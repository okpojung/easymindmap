import assert from 'node:assert/strict';
import { attachmentDownloadName, downloadAttachment } from './downloadAttachment';

const originals = {
  fetch: globalThis.fetch,
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  create: URL.createObjectURL,
  revoke: URL.revokeObjectURL,
};
let passed = 0;
async function check(name: string, run: (h: ReturnType<typeof harness>) => Promise<void> | void) {
  const h = harness();
  try { await run(h); passed++; console.log('PASS ' + name); }
  finally {
    globalThis.fetch = originals.fetch;
    for (const k of ['document', 'window'] as const) {
      if (originals[k]) Object.defineProperty(globalThis, k, originals[k]!);
      else Reflect.deleteProperty(globalThis, k);
    }
    URL.createObjectURL = originals.create; URL.revokeObjectURL = originals.revoke;
  }
}
function harness() {
  const h = {
    blobs: [] as Blob[], revoked: [] as string[], timers: [] as (() => void)[],
    clicks: [] as { name: string; href: string; attached: boolean }[],
    requests: [] as { input: RequestInfo | URL; init?: RequestInit }[],
    attached: 0, removed: 0, clickFails: false,
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => originals.fetch(input, init)) as typeof fetch,
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    h.requests.push({ input, init }); return h.fetch(input, init);
  }) as typeof fetch;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    body: { appendChild: (a: { attached: boolean }) => { a.attached = true; h.attached++; } },
    createElement: (tag: string) => {
      assert.equal(tag, 'a');
      return {
        href: '', download: '', style: {}, attached: false,
        click() {
          if (h.clickFails) throw new Error('click failed');
          h.clicks.push({ name: this.download, href: this.href, attached: this.attached });
        },
        remove() { if (this.attached) { this.attached = false; h.removed++; } },
      };
    },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    setTimeout: (fn: () => void, delay: number) => { assert.equal(delay, 60_000); h.timers.push(fn); return 1; },
  } });
  URL.createObjectURL = (blob: Blob) => { h.blobs.push(blob); return 'blob:download-' + h.blobs.length; };
  URL.revokeObjectURL = (url: string) => { h.revoked.push(url); };
  return h;
}
const identity = async (url: string) => url;
const opts = { resolveUrl: identity };

await check('original Korean and MD extensions are preserved', () => {
  assert.equal(attachmentDownloadName('한글 문서 (2).markdown'), '한글 문서 (2).markdown');
  assert.equal(attachmentDownloadName('image.PNG'), 'image.PNG');
});
await check('path components and invalid control characters are removed', () => {
  assert.equal(attachmentDownloadName('../private/file.md'), 'file.md');
  assert.equal(attachmentDownloadName('C:\\folder\\a.md'), 'a.md');
  assert.equal(attachmentDownloadName('a\u0000:*?"<>|.md'), 'a________.md');
  assert.equal(attachmentDownloadName('..'), 'attachment');
  assert.equal(attachmentDownloadName('  '), 'attachment');
});
await check('embedded MD retains BOM, CRLF, Korean and punctuation byte-for-byte', async h => {
  const text = '\uFEFF# 다운로드\r\n\r\n한글 + % & ?\r\n';
  await downloadAttachment('원본.md', 'data:text/markdown;charset=utf-8,' + encodeURIComponent(text), opts);
  assert.deepEqual(new Uint8Array(await h.blobs[0].arrayBuffer()), new TextEncoder().encode(text));
  assert.equal(h.clicks[0].name, '원본.md'); assert.equal(h.clicks[0].attached, true);
  assert.equal(h.removed, 1); assert.equal(h.revoked.length, 0);
  h.timers[0](); assert.deepEqual(h.revoked, ['blob:download-1']);
});
await check('base64 binary attachment retains exact bytes and MIME', async h => {
  await downloadAttachment('binary.bin', 'data:application/octet-stream;base64,AP8BAgA=', opts);
  assert.deepEqual([...new Uint8Array(await h.blobs[0].arrayBuffer())], [0, 255, 1, 2, 0]);
  assert.equal(h.blobs[0].type, 'application/octet-stream');
});
await check('server authorization is resolved at click time, not persisted in a link', async h => {
  let resolves = 0;
  h.fetch = async () => new Response('# server MD\n', { headers: { 'Content-Type': 'text/markdown' } });
  await downloadAttachment('server.md', '/v1/attachments/test-id', { resolveUrl: async source => {
    resolves++; assert.equal(source, '/v1/attachments/test-id'); return 'https://api.example.test/v1/attachments/test-id?authorization=ephemeral';
  } });
  assert.equal(resolves, 1); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].init?.credentials, 'same-origin');
  assert.equal(h.requests[0].init?.referrerPolicy, 'no-referrer');
  assert.equal(h.requests[0].init?.cache, 'no-store');
  assert.equal(h.clicks[0].href, 'blob:download-1');
  assert.equal(await h.blobs[0].text(), '# server MD\n');
});
await check('PDF and HTML explicitly download without opening a viewer', async h => {
  h.fetch = async () => new Response('<html>file</html>', { headers: { 'Content-Type': 'text/html' } });
  await downloadAttachment('document.html', 'https://files.example.test/file', opts);
  assert.equal(h.clicks[0].name, 'document.html'); assert.equal(h.clicks[0].href.startsWith('blob:'), true);
});
await check('temporary Blob URLs download through the same path', async h => {
  h.fetch = async () => new Response(new Uint8Array([8, 9]));
  await downloadAttachment('local.bin', 'blob:local-file', opts);
  assert.deepEqual([...new Uint8Array(await h.blobs[0].arrayBuffer())], [8, 9]);
});
await check('empty files are valid downloads', async h => {
  await downloadAttachment('empty.txt', 'data:text/plain,', opts);
  assert.equal(h.blobs[0].size, 0); assert.equal(h.clicks.length, 1);
});
for (const status of [401, 403, 404, 500]) await check('HTTP ' + status + ' is never downloaded as an error file', async h => {
  h.fetch = async () => new Response('error page', { status });
  await assert.rejects(downloadAttachment('file.md', '/v1/attachments/test', opts), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  assert.equal(h.clicks.length, 0); assert.equal(h.blobs.length, 0);
});
await check('network and CORS errors do not leak source or authorization in errors', async h => {
  h.fetch = async () => { throw new TypeError('failed URL with private query'); };
  await assert.rejects(downloadAttachment('file.md', 'https://files.example.test/file', opts), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  assert.equal(h.clicks.length, 0);
});
await check('resolver errors are fixed, actionable failures without a navigation fallback', async h => {
  await assert.rejects(downloadAttachment('a.md', '/v1/attachments/a', { resolveUrl: async () => { throw new Error('private details'); } }), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  assert.equal(h.requests.length, 0); assert.equal(h.clicks.length, 0);
});
await check('missing and executable/unsupported URLs fail before authorization or fetch', async h => {
  let resolves = 0;
  for (const url of [undefined, '', 'javascript:alert(1)', 'file:///private', '//foreign.example/file']) {
    await assert.rejects(downloadAttachment('a.md', url, { resolveUrl: async u => { resolves++; return u; } }), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  }
  assert.equal(resolves, 0); assert.equal(h.requests.length, 0);
});
await check('unsafe resolved URL is rejected', async h => {
  await assert.rejects(downloadAttachment('a.md', '/v1/attachments/a', { resolveUrl: async () => 'javascript:alert(1)' }), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  assert.equal(h.requests.length, 0);
});
await check('already cancelled downloads never resolve authorization or fetch', async h => {
  const ctrl = new AbortController(); ctrl.abort();
  await assert.rejects(downloadAttachment('a.md', 'data:text/plain,a', { ...opts, signal: ctrl.signal }), { name: 'AbortError' });
  assert.equal(h.requests.length, 0); assert.equal(h.clicks.length, 0);
});
await check('document switch during authorization cancels before fetch', async h => {
  const ctrl = new AbortController();
  await assert.rejects(downloadAttachment('a.md', '/v1/attachments/a', {
    signal: ctrl.signal, resolveUrl: async u => { ctrl.abort(); return u; },
  }), { name: 'AbortError' });
  assert.equal(h.requests.length, 0);
});
await check('document switch during body download prevents a stale file download', async h => {
  const ctrl = new AbortController();
  h.fetch = async () => ({ ok: true, blob: async () => { ctrl.abort(); return new Blob(['stale']); } }) as Response;
  await assert.rejects(downloadAttachment('a.md', '/v1/attachments/a', { ...opts, signal: ctrl.signal }), { name: 'AbortError' });
  assert.equal(h.blobs.length, 0); assert.equal(h.clicks.length, 0);
  assert.equal(h.requests[0].init?.signal, ctrl.signal);
});
await check('browser handoff failure removes its anchor and releases the Blob immediately', async h => {
  h.clickFails = true;
  await assert.rejects(downloadAttachment('a.md', 'data:text/plain,a', opts), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  assert.equal(h.removed, 1); assert.deepEqual(h.revoked, ['blob:download-1']); assert.equal(h.timers.length, 0);
});
await check('failed response body never produces a partial file', async h => {
  h.fetch = async () => ({ ok: true, blob: async () => { throw new Error('interrupted'); } }) as unknown as Response;
  await assert.rejects(downloadAttachment('a.md', '/v1/attachments/a', opts), /^Error: ATTACHMENT_DOWNLOAD_FAILED$/);
  assert.equal(h.blobs.length, 0); assert.equal(h.clicks.length, 0);
});
console.log('PASS attachment download: ' + passed + ' checks');
