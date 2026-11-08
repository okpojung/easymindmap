// Password-protected, offline HTML. No app/auth/storage dependency.
// Keep createHtmlCrypto self-contained: its compiled source is embedded in the
// locked viewer and shared verbatim with the standalone Markdown editor.
export type ProtectedHtmlKind = 'map' | 'markdown';
export interface ProtectedHtmlEnvelope {
  format: 'emm-protected-html'; version: 1; kind: ProtectedHtmlKind;
  kdf: 'PBKDF2-SHA256'; cipher: 'AES-256-GCM'; iterations: 600000;
  salt: string; iv: string; data: string;
}

export function createHtmlCrypto() {
  const MAX_PLAIN = 64 * 1024 * 1024;
  const MAX_FILE = 92 * 1024 * 1024;
  const ITERATIONS = 600000;
  const FORMAT = 'emm-protected-html';
  const FAILURE = '암호가 맞지 않거나 파일이 손상되었습니다.';
  function passwordValidationError(password: string): string | null {
    if (typeof password !== 'string' || Array.from(password).length < 8) return '암호는 8자 이상이어야 합니다.';
    if (Array.from(password).length > 256) return '암호는 256자 이내로 입력해 주세요.';
    const kinds = Number(/\p{L}/u.test(password)) + Number(/\p{N}/u.test(password)) + Number(/[^\p{L}\p{N}\s]/u.test(password));
    return kinds >= 2 ? null : '문자·숫자·특수문자 중 두 종류 이상을 조합해 주세요. 대소문자는 같은 종류입니다.';
  }
  function available(): void {
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) throw new Error('이 브라우저에서는 안전한 암호화를 사용할 수 없습니다. 최신 Chrome 또는 Edge에서 열어 주세요.');
  }
  function toBase64(bytes: Uint8Array): string {
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i += 0x6000) parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x6000)));
    return btoa(parts.join(''));
  }
  function fromBase64(value: string, max: number): Uint8Array {
    if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');
    let binary: string;
    try { binary = atob(value); } catch { throw new Error('지원하지 않거나 손상된 암호화 파일입니다.'); }
    if (binary.length > max || btoa(binary) !== value) throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }
  function validate(raw: unknown): ProtectedHtmlEnvelope {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');
    const o = raw as Record<string, unknown>;
    const keys = ['format', 'version', 'kind', 'kdf', 'cipher', 'iterations', 'salt', 'iv', 'data'];
    if (Object.keys(o).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(o, k)) ||
      o.format !== FORMAT || o.version !== 1 || (o.kind !== 'map' && o.kind !== 'markdown') ||
      o.kdf !== 'PBKDF2-SHA256' || o.cipher !== 'AES-256-GCM' || o.iterations !== ITERATIONS ||
      typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.data !== 'string') throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');
    if (fromBase64(o.salt, 16).length !== 16 || fromBase64(o.iv, 12).length !== 12 || o.data.length < 24 || o.data.length > Math.ceil((MAX_PLAIN + 16) / 3) * 4 || o.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(o.data)) throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');
    return o as unknown as ProtectedHtmlEnvelope;
  }
  function isEncryptedHtml(text: string): boolean {
    return typeof text === 'string' && (/<meta\s+name=["']emm-protected-html["']/i.test(text) || /<script\s+type=["']application\/json["']\s+id=["']emm-encrypted-payload["']/i.test(text));
  }
  function parse(text: string): ProtectedHtmlEnvelope {
    if (typeof text !== 'string' || text.length > MAX_FILE) throw new Error('암호화 파일의 크기 한도를 넘었습니다.');
    const matches = [...text.matchAll(/<script type="application\/json" id="emm-encrypted-payload">([\s\S]*?)<\/script>/g)];
    if (matches.length !== 1) throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');
    try { return validate(JSON.parse(matches[0][1])); } catch { throw new Error('지원하지 않거나 손상된 암호화 파일입니다.'); }
  }
  function aad(kind: ProtectedHtmlKind): Uint8Array {
    return new TextEncoder().encode(JSON.stringify([FORMAT, 1, kind, 'PBKDF2-SHA256', ITERATIONS, 'AES-256-GCM']));
  }
  async function key(password: string, salt: Uint8Array, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
    available();
    if (typeof password !== 'string' || Array.from(password).length > 256) throw new Error(FAILURE);
    const passwordBytes = new TextEncoder().encode(password);
    try {
      const material = await crypto.subtle.importKey('raw', passwordBytes as BufferSource, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
    } finally { passwordBytes.fill(0); }
  }
  async function encrypt(html: string, password: string, kind: ProtectedHtmlKind): Promise<ProtectedHtmlEnvelope> {
    available();
    const invalid = passwordValidationError(password);
    if (invalid) throw new Error(invalid);
    if (kind !== 'map' && kind !== 'markdown') throw new Error('지원하지 않는 문서 종류입니다.');
    const bytes = new TextEncoder().encode(html);
    if (!bytes.length || bytes.length > MAX_PLAIN) throw new Error('암호화할 HTML은 64MB 이내여야 합니다. 첨부파일을 줄이거나 맵을 나누어 주세요.');
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    try {
      const derived = await key(password, salt, 'encrypt');
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(kind) as BufferSource, tagLength: 128 }, derived, bytes));
      return { format: FORMAT, version: 1, kind, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(ciphertext) };
    } finally { bytes.fill(0); }
  }
  async function decrypt(envelope: ProtectedHtmlEnvelope, password: string): Promise<{ html: string; kind: ProtectedHtmlKind }> {
    available();
    const e = validate(envelope);
    const ciphertext = fromBase64(e.data, MAX_PLAIN + 16);
    if (ciphertext.length < 17) throw new Error(FAILURE);
    try {
      const derived = await key(password, fromBase64(e.salt, 16), 'decrypt');
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(e.iv, 12) as BufferSource, additionalData: aad(e.kind) as BufferSource, tagLength: 128 }, derived, ciphertext as BufferSource));
      try { return { html: new TextDecoder('utf-8', { fatal: true }).decode(plain), kind: e.kind }; }
      finally { plain.fill(0); }
    } catch { throw new Error(FAILURE); }
  }
  return { passwordValidationError, isEncryptedHtml, parse, validate, encrypt, decrypt, limits: { maxPlainBytes: MAX_PLAIN, maxFileChars: MAX_FILE } };
}

// Generated source is a literal, not function.toString(): production minifiers
// may move closures. The offline decryptor must remain independent of bundling.
/* EMM_CRYPTO_FACTORY_SOURCE_START */
const CRYPTO_FACTORY_SOURCE = "function createHtmlCrypto() {\n    const MAX_PLAIN = 64 * 1024 * 1024;\n    const MAX_FILE = 92 * 1024 * 1024;\n    const ITERATIONS = 600000;\n    const FORMAT = 'emm-protected-html';\n    const FAILURE = '암호가 맞지 않거나 파일이 손상되었습니다.';\n    function passwordValidationError(password) {\n        if (typeof password !== 'string' || Array.from(password).length < 8)\n            return '암호는 8자 이상이어야 합니다.';\n        if (Array.from(password).length > 256)\n            return '암호는 256자 이내로 입력해 주세요.';\n        const kinds = Number(/\\p{L}/u.test(password)) + Number(/\\p{N}/u.test(password)) + Number(/[^\\p{L}\\p{N}\\s]/u.test(password));\n        return kinds >= 2 ? null : '문자·숫자·특수문자 중 두 종류 이상을 조합해 주세요. 대소문자는 같은 종류입니다.';\n    }\n    function available() {\n        if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues)\n            throw new Error('이 브라우저에서는 안전한 암호화를 사용할 수 없습니다. 최신 Chrome 또는 Edge에서 열어 주세요.');\n    }\n    function toBase64(bytes) {\n        const parts = [];\n        for (let i = 0; i < bytes.length; i += 0x6000)\n            parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x6000)));\n        return btoa(parts.join(''));\n    }\n    function fromBase64(value, max) {\n        if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        let binary;\n        try {\n            binary = atob(value);\n        }\n        catch {\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        }\n        if (binary.length > max || btoa(binary) !== value)\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        return Uint8Array.from(binary, c => c.charCodeAt(0));\n    }\n    function validate(raw) {\n        if (!raw || typeof raw !== 'object' || Array.isArray(raw))\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        const o = raw;\n        const keys = ['format', 'version', 'kind', 'kdf', 'cipher', 'iterations', 'salt', 'iv', 'data'];\n        if (Object.keys(o).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(o, k)) ||\n            o.format !== FORMAT || o.version !== 1 || (o.kind !== 'map' && o.kind !== 'markdown') ||\n            o.kdf !== 'PBKDF2-SHA256' || o.cipher !== 'AES-256-GCM' || o.iterations !== ITERATIONS ||\n            typeof o.salt !== 'string' || typeof o.iv !== 'string' || typeof o.data !== 'string')\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        if (fromBase64(o.salt, 16).length !== 16 || fromBase64(o.iv, 12).length !== 12 || o.data.length < 24 || o.data.length > Math.ceil((MAX_PLAIN + 16) / 3) * 4 || o.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(o.data))\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        return o;\n    }\n    function isEncryptedHtml(text) {\n        return typeof text === 'string' && (/<meta\\s+name=[\"']emm-protected-html[\"']/i.test(text) || /<script\\s+type=[\"']application\\/json[\"']\\s+id=[\"']emm-encrypted-payload[\"']/i.test(text));\n    }\n    function parse(text) {\n        if (typeof text !== 'string' || text.length > MAX_FILE)\n            throw new Error('암호화 파일의 크기 한도를 넘었습니다.');\n        const matches = [...text.matchAll(/<script type=\"application\\/json\" id=\"emm-encrypted-payload\">([\\s\\S]*?)<\\/script>/g)];\n        if (matches.length !== 1)\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        try {\n            return validate(JSON.parse(matches[0][1]));\n        }\n        catch {\n            throw new Error('지원하지 않거나 손상된 암호화 파일입니다.');\n        }\n    }\n    function aad(kind) {\n        return new TextEncoder().encode(JSON.stringify([FORMAT, 1, kind, 'PBKDF2-SHA256', ITERATIONS, 'AES-256-GCM']));\n    }\n    async function key(password, salt, usage) {\n        available();\n        if (typeof password !== 'string' || Array.from(password).length > 256)\n            throw new Error(FAILURE);\n        const passwordBytes = new TextEncoder().encode(password);\n        try {\n            const material = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey']);\n            return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);\n        }\n        finally {\n            passwordBytes.fill(0);\n        }\n    }\n    async function encrypt(html, password, kind) {\n        available();\n        const invalid = passwordValidationError(password);\n        if (invalid)\n            throw new Error(invalid);\n        if (kind !== 'map' && kind !== 'markdown')\n            throw new Error('지원하지 않는 문서 종류입니다.');\n        const bytes = new TextEncoder().encode(html);\n        if (!bytes.length || bytes.length > MAX_PLAIN)\n            throw new Error('암호화할 HTML은 64MB 이내여야 합니다. 첨부파일을 줄이거나 맵을 나누어 주세요.');\n        const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));\n        try {\n            const derived = await key(password, salt, 'encrypt');\n            const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(kind), tagLength: 128 }, derived, bytes));\n            return { format: FORMAT, version: 1, kind, kdf: 'PBKDF2-SHA256', cipher: 'AES-256-GCM', iterations: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(ciphertext) };\n        }\n        finally {\n            bytes.fill(0);\n        }\n    }\n    async function decrypt(envelope, password) {\n        available();\n        const e = validate(envelope);\n        const ciphertext = fromBase64(e.data, MAX_PLAIN + 16);\n        if (ciphertext.length < 17)\n            throw new Error(FAILURE);\n        try {\n            const derived = await key(password, fromBase64(e.salt, 16), 'decrypt');\n            const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(e.iv, 12), additionalData: aad(e.kind), tagLength: 128 }, derived, ciphertext));\n            try {\n                return { html: new TextDecoder('utf-8', { fatal: true }).decode(plain), kind: e.kind };\n            }\n            finally {\n                plain.fill(0);\n            }\n        }\n        catch {\n            throw new Error(FAILURE);\n        }\n    }\n    return { passwordValidationError, isEncryptedHtml, parse, validate, encrypt, decrypt, limits: { maxPlainBytes: MAX_PLAIN, maxFileChars: MAX_FILE } };\n}";
/* EMM_CRYPTO_FACTORY_SOURCE_END */

export function passwordValidationError(password: string): string | null { return createHtmlCrypto().passwordValidationError(password); }
export function isEncryptedHtml(text: string): boolean { return createHtmlCrypto().isEncryptedHtml(text); }
export async function decryptStandaloneHtml(text: string, password: string): Promise<{ html: string; kind: ProtectedHtmlKind }> {
  const codec = createHtmlCrypto();
  return codec.decrypt(codec.parse(text), password);
}

export function buildLockedHtml(envelope: ProtectedHtmlEnvelope): string {
  const codec = createHtmlCrypto();
  codec.validate(envelope);
  const payload = JSON.stringify(envelope).replace(/</g, '\\u003c');
  const runtime = CRYPTO_FACTORY_SOURCE.replace(/<\/script/gi, '<\\/script');
  // No allow-same-origin: decrypted scripts must never inherit the EMM origin.
  // The restrictive CSP also prevents remote images/scripts and background I/O.
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="emm-protected-html" content="1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; frame-src 'self' about: data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>암호로 보호된 문서</title><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.6 system-ui,sans-serif;color:#243b4c;background:#f4f6f7}.lock{max-width:440px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #dce3e8;border-radius:16px}h1{font-size:24px;letter-spacing:-.03em;margin:0 0 12px}p{color:#5e6d78;margin:8px 0 20px}label{display:block;font-weight:600}input{display:block;width:100%;font:inherit;padding:11px;margin:8px 0 16px;border:1px solid #a7b5bf;border-radius:8px}button{font:inherit;padding:10px 16px;border:0;border-radius:8px;cursor:pointer;background:#24485e;color:white}button:disabled{opacity:.5}.error{color:#a52828;min-height:24px;margin-top:12px}.hint{font-size:12px;color:#657782;margin:18px 0 0}.bar{height:52px;padding:6px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#fff;border-bottom:1px solid #dce3e8}.bar span{font-size:12px}.bar button{padding:5px 12px}iframe{display:block;width:100%;height:calc(100vh - 52px);border:0;background:#fff}[hidden]{display:none!important}@media(max-width:480px){.lock{margin:6vh 16px;padding:24px}.bar{padding:6px 8px}.bar span{font-size:11px}}
</style></head><body>
<section class="lock" id="lock"><h1>암호로 보호된 문서</h1><p>본문과 포함된 첨부파일은 암호화되어 있습니다. 암호를 입력하면 이 브라우저에서만 복호화합니다.</p>
<form id="unlock"><label for="password">암호</label><input id="password" type="password" autocomplete="off" maxlength="512" required><button id="open" type="submit">문서 열기</button><div class="error" id="error" role="alert"></div></form><p class="hint">암호를 잊으면 복구할 수 없습니다. 일반 웹 링크의 외부 사이트는 이 파일의 보호 대상이 아닙니다.</p></section>
<div class="bar" id="bar" hidden><span>암호가 해제된 상태입니다. 화면 복사와 개별 첨부 저장은 암호화되지 않습니다.</span><button id="relock" type="button">다시 잠그기</button></div>
<iframe id="viewer" title="복호화된 문서" sandbox="allow-scripts allow-downloads allow-popups allow-modals allow-forms" hidden></iframe>
<script type="application/json" id="emm-encrypted-payload">${payload}</script>
<script>(function(){'use strict';var codec=(${runtime})();var form=document.getElementById('unlock'),pass=document.getElementById('password'),error=document.getElementById('error'),button=document.getElementById('open'),frame=document.getElementById('viewer'),lock=document.getElementById('lock'),bar=document.getElementById('bar');
form.addEventListener('submit',async function(event){event.preventDefault();if(button.disabled)return;button.disabled=true;error.textContent='복호화 중…';try{var envelope=codec.validate(JSON.parse(document.getElementById('emm-encrypted-payload').textContent));var result=await codec.decrypt(envelope,pass.value);pass.value='';frame.srcdoc=result.html;result.html='';frame.hidden=false;bar.hidden=false;lock.hidden=true;error.textContent='';}catch(e){error.textContent=e instanceof Error?e.message:'문서를 열지 못했습니다.';pass.value='';pass.focus();}finally{button.disabled=false;}});
document.getElementById('relock').addEventListener('click',function(){frame.srcdoc='';frame.hidden=true;bar.hidden=true;lock.hidden=false;pass.value='';error.textContent='';pass.focus();});pass.focus();})();</script>
</body></html>`;
}

export async function encryptStandaloneHtml(html: string, password: string, kind: ProtectedHtmlKind): Promise<string> {
  const envelope = await createHtmlCrypto().encrypt(html, password, kind);
  return buildLockedHtml(envelope);
}
