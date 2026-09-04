// AI API 키 암호화 — **서버가 남의 API 키를 보관하는 유일한 자리** (2026-09-04).
//
// 왜 필요한가: 키는 지금까지 브라우저(localStorage)에만 있었다. 그래서
// 브라우저·PC 를 바꾸거나 주소(origin)가 바뀔 때마다 다시 등록해야 했다
// (2026-09-02 dev → pro-dev 이전에서 실제로 겪었다). 계정에 붙여 두면
// 어디서 로그인하든 따라온다 — 대신 **평문으로 두면 안 된다.** DB 를 볼 수
// 있는 사람이 남의 키로 남의 돈을 쓸 수 있기 때문이다.
//
// 방식: AES-256-GCM. 키는 환경변수 `AI_KEY_SECRET` 의 sha256 (32바이트).
// 저장 형식 `v1:<iv>:<tag>:<ciphertext>` (전부 base64) — 앞의 `v1` 이
// 나중에 방식을 바꿀 때 옛 행을 구분하는 표식이다.
//
// **비밀이 없으면 기능이 꺼진다** — 앱은 죽지 않고, 프런트는 예전처럼
// 브라우저에만 보관한다(그 사실을 화면이 밝힌다).

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const FORMAT = 'v1';

function keyOf(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptAiKey(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** 형식이 어긋나거나 비밀이 다르면 null — 예외로 앱을 세우지 않는다 */
export function decryptAiKey(stored: string, secret: string): string | null {
  const parts = String(stored || '').split(':');
  if (parts.length !== 4 || parts[0] !== FORMAT) return null;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', keyOf(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** 화면에 보여 줄 끝자리 — 어느 키가 등록돼 있는지 알아볼 만큼만 */
export function aiKeyHint(plain: string): string {
  const s = String(plain || '').trim();
  return s.length <= 4 ? '••••' : `…${s.slice(-4)}`;
}
