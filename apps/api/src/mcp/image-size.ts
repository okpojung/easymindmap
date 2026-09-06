/**
 * **내장 사진(data URL)의 실제 크기** (MCP, 2026-09-06).
 *
 * 파서는 `![설명](data:image/png;base64,…)` 을 노드 사진으로 담되 크기를
 * 모른다 — 브라우저가 없어 `<img>` 로 재 볼 수 없으니 자리표시 값
 * (320×200)을 넣는다. 앱은 불러올 때 원격(http) 사진만 다시 재므로, AI 가
 * MCP 로 넣은 data URL 사진은 그 자리표시 크기로 그려진다(비율이 깨진다).
 *
 * 그래서 서버가 파일 머리에서 폭·높이를 읽는다. 디코더가 아니다 — PNG 의
 * IHDR, GIF 의 논리 화면, JPEG 의 SOF 마커, WebP 의 VP8/VP8L/VP8X 청크만
 * 읽는다. 못 읽으면 자리표시 값을 그대로 둔다(사진은 살아 있다).
 *
 * 표시 폭은 **640 까지** — 화면 캡처(1920 폭)를 자연 크기로 두면 노드 하나가
 * 화면을 덮는다. 앱에서 우하단 핸들로 다시 늘릴 수 있다.
 */
import type { MindNode } from '../emm/model';

/** 앱의 `embedImage.ts` MAX_EMBED_BYTES 와 같다 — 한 장의 원본 바이트 상한 */
export const MAX_IMAGE_BYTES = 2_500_000;
export const MAX_DISPLAY_W = 640;
/** 파서의 자리표시 값(`REMOTE_IMAGE_PLACEHOLDER_W/H`) — 이 값일 때만 손댄다 */
const PLACEHOLDER_W = 320;
const PLACEHOLDER_H = 200;

export class ImageTooLargeError extends Error {}

const DATA_RE = /^data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/** data URL 의 원본 바이트 수(대략 — base64 길이에서 계산) */
export function dataUrlBytes(src: string): number {
  const m = DATA_RE.exec(src);
  if (!m) return 0;
  const b64 = m[2].replace(/\s+/g, '');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** 머리 부분만 디코드한다(JPEG 는 SOF 마커가 뒤에 있을 수 있어 넉넉히) */
function head(src: string, maxBytes: number): Buffer | null {
  const m = DATA_RE.exec(src);
  if (!m) return null;
  const b64 = m[2].replace(/\s+/g, '');
  const chars = Math.min(b64.length, Math.ceil(maxBytes / 3) * 4);
  return Buffer.from(b64.slice(0, chars), 'base64');
}

function png(b: Buffer): { w: number; h: number } | null {
  if (b.length < 24) return null;
  if (b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (b.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function gif(b: Buffer): { w: number; h: number } | null {
  if (b.length < 10) return null;
  const sig = b.toString('ascii', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') return null;
  return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
}

function jpeg(b: Buffer): { w: number; h: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xff) { i++; continue; }
    const len = b.readUInt16BE(i + 2);
    // SOF0~SOF15 (DHT c4 · JPG c8 · DAC cc 제외)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    }
    if (marker === 0xda) return null; // 스캔 시작 — SOF 없이 여기까지 왔으면 포기
    i += 2 + len;
  }
  return null;
}

function webp(b: Buffer): { w: number; h: number } | null {
  if (b.length < 30) return null;
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  if (chunk === 'VP8 ') {
    return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

/** data URL 사진의 픽셀 크기. 형식을 모르거나 머리가 깨졌으면 null */
export function dataUrlImageSize(src: string): { w: number; h: number } | null {
  const b = head(src, 65_536);
  if (!b) return null;
  const got = png(b) ?? gif(b) ?? webp(b) ?? jpeg(b);
  if (!got || !(got.w > 0 && got.h > 0)) return null;
  return got;
}

/** 표시 크기 — 폭 640 상한, 비율 유지 */
export function displaySize(w: number, h: number): { w: number; h: number } {
  if (w <= MAX_DISPLAY_W) return { w, h };
  const r = MAX_DISPLAY_W / w;
  return { w: MAX_DISPLAY_W, h: Math.max(1, Math.round(h * r)) };
}

/**
 * 트리의 모든 노드에서 data URL 사진의 자리표시 크기를 실제 크기로 바꾼다
 * (제자리 수정). 2.5MB 를 넘는 사진이 있으면 ImageTooLargeError — 앱의
 * 붙여넣기 상한과 같다.
 *
 * @returns 손댄 사진 수
 */
export function sizeDataUrlImages(nodes: MindNode[]): number {
  let touched = 0;
  const walk = (list: MindNode[]) => {
    for (const n of list) {
      for (const im of n.images ?? []) {
        if (!/^data:image\//i.test(im.src)) continue;
        const bytes = dataUrlBytes(im.src);
        if (bytes > MAX_IMAGE_BYTES) {
          throw new ImageTooLargeError(
            `사진 한 장이 ${(bytes / 1_000_000).toFixed(1)}MB 입니다 — 2.5MB 까지만 넣을 수 있습니다. 줄여서 다시 보내 주세요.`,
          );
        }
        if (im.w !== PLACEHOLDER_W || im.h !== PLACEHOLDER_H) continue;
        const size = dataUrlImageSize(im.src);
        if (!size) continue;
        const d = displaySize(size.w, size.h);
        im.w = d.w;
        im.h = d.h;
        touched++;
      }
      if (n.children?.length) walk(n.children as MindNode[]);
    }
  };
  walk(nodes);
  return touched;
}
