// 첨부 **내용 덮어쓰기**의 판정 조각 (2026-10-31, `PUT /v1/attachments/:id/content`).
//
// 노드에 붙인 .md 를 웹 마크다운 편집기(새 탭)에서 고친 뒤 **같은 첨부에**
// 저장한다. 같은 id 를 지켜야 문서 JSON 안의 `/v1/attachments/<id>` 주소가
// 그대로 산다 — 새 첨부로 올리면 노드마다 주소를 바꿔 써야 한다.
//
// 컨트롤러·서비스가 쓰는 판정을 여기 모은다 — DB·저장소 없이 시험할 수 있게.

import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { PayloadTooLargeException } from '@nestjs/common';

/** 편집기로 고칠 수 있는 첨부 — 이름 확장자 또는 DB mime 이 텍스트 */
const TEXT_EXT = /\.(md|markdown|txt)$/i;
const MARKDOWN_EXT = /\.(md|markdown)$/i;

export function isEditableText(name: string, mime: string | null | undefined): boolean {
  return TEXT_EXT.test(name) || /^text\//i.test(String(mime ?? '').trim());
}

/** 요청 본문이 텍스트인가 — `text/markdown; charset=utf-8`, `text/plain` 등 `text/*` 만 */
export function isTextContentType(header: string | undefined): boolean {
  return /^text\/[a-z0-9.+-]+\s*(;|$)/i.test(String(header ?? '').trim());
}

/**
 * 저장할 mime — .md/.markdown 이면 `text/markdown` 으로 보정한다.
 * 업로드 때 브라우저가 .md 를 `application/octet-stream` 이나 빈 값으로
 * 보내는 일이 흔하다(OS 에 등록된 형식이 없으면 그렇다). 그 밖에는 원래
 * 값이 텍스트면 두고, 아니면 `text/plain`.
 */
export function editedMime(name: string, current: string | null | undefined): string {
  if (MARKDOWN_EXT.test(name)) return 'text/markdown';
  const cur = String(current ?? '').trim();
  return /^text\//i.test(cur) ? cur.slice(0, 127) : 'text/plain';
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * `If-Match` 해석.
 *   · 없음 / `*`         → `null` (검사하지 않고 덮어쓴다)
 *   · `"sha256:<hex64>"` → 그 hex (소문자). 따옴표·`W/` 는 너그럽게 받는다
 *   · 그 밖              → `'invalid'` (400 — 조용히 덮어쓰면 충돌 검사를
 *                          켰다고 믿는 클라이언트의 수정을 잃는다)
 */
export function parseIfMatch(header: string | string[] | undefined): string | null | 'invalid' {
  const raw = (Array.isArray(header) ? header[0] : header)?.trim();
  if (!raw || raw === '*') return null;
  const m = /^(?:W\/)?"?sha256:([0-9a-f]{64})"?$/i.exec(raw);
  return m ? m[1].toLowerCase() : 'invalid';
}

/**
 * 요청 본문을 **한도까지만** 읽는다. 넘으면 413.
 *
 * 전역 json 파서(25mb)는 `application/json` 만 건드리므로 `text/*` 본문은
 * 스트림 그대로 여기 온다. Content-Length 가 한도를 넘으면 읽기 전에
 * 거절하고, 길이를 속이거나 chunked 로 오면 세면서 끊는다.
 */
export function readBodyLimited(req: Readable & { headers?: Record<string, unknown> }, limit: number): Promise<Buffer> {
  const tooLarge = () => new PayloadTooLargeException(
    `첨부 1개는 최대 ${Math.round(limit / 1024 / 1024)}MB 까지입니다.`,
  );
  const declared = Number(req.headers?.['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    req.resume(); // 남은 본문은 버린다 — 연결이 매달리지 않게
    return Promise.reject(tooLarge());
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let done = false;
    const onData = (c: Buffer) => {
      if (done) return;
      total += c.length;
      if (total > limit) {
        done = true;
        chunks.length = 0;
        reject(tooLarge());
        return; // 'data' 를 계속 받아 버린다(resume 상태) — 응답은 이미 나간다
      }
      chunks.push(c);
    };
    req.on('data', onData);
    req.once('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.once('error', (err) => { if (!done) { done = true; reject(err); } });
  });
}

/** 저장소 스트림을 끝까지 읽어 SHA-256 — 편집 대상은 텍스트라 작다 */
export async function sha256OfStream(stream: NodeJS.ReadableStream): Promise<string> {
  const h = createHash('sha256');
  for await (const c of stream as AsyncIterable<Buffer | string>) h.update(c);
  return h.digest('hex');
}
