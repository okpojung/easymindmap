/**
 * **PDF 의 그림을 사진으로 꺼내기** (2026-10-17) — `import_pdf` 가 그림을 글로 옮기지 않고 노드 사진으로 붙인다.
 * 설계: mcp-connector.md §9.17 "그림".
 *
 * 사용자 요청: "그림(이미지)일 때에는 이미지의 텍스트를 인식해 넣지 말고 이미지로 첨부해 줘". 외부 패키지 없이
 * (노드 `zlib` 만) 이미지 XObject 를 브라우저가 그릴 수 있는 파일로 만든다.
 *   · DCT(JPEG) — 그 바이트가 곧 JPEG 파일이다. 그대로 쓴다.
 *   · 그 밖(Flate·LZW·RunLength·필터 없음) — 화소를 풀어 PNG 로 다시 싼다. 색 공간 DeviceGray·RGB·CMYK(RGB 로)·
 *     Cal*·ICCBased(N)·Indexed, 화소당 1·2·4·8·16 비트, Decode [1 0](흑백 뒤집기), SMask(투명도).
 *   · 못 하는 것(건너뛰고 센다): JPX(JPEG 2000)·JBIG2·CCITT(팩스)·Lab·Separation·DeviceN, 스텐실 마스크.
 *
 * 고르는 규칙 — 장식은 사진으로 넣지 않는다.
 *   · 작은 것: 그린 상자가 24pt 보다 작거나 화소가 16 보다 작다(글머리표·아이콘).
 *   · 되풀이: 같은 그림이 읽은 쪽의 절반 이상(3쪽 이상)에 있다(로고·배경 무늬 — 머리글처럼).
 *   · 한 쪽에서 같은 그림은 한 번만.
 * 400만 화소를 넘는 그림은 **풀면서 바로** 줄인다(한 줄씩 펼쳐 상자 평균 — 큰 그림이 수백 MB 를 잡지 않게).
 * 사진 한 장은 앱과 같이 2.5MB 까지 — PNG 가 넘으면 화소를 줄여(2·3·4…배) 맞추고, JPEG 가 넘으면 건너뛴다.
 * JPEG 에 SMask(투명도)가 있으면 투명도는 버리고 넣는다(JPEG 디코더가 없다) — 결과에 수를 알린다.
 * 이름 붙은 색 공간(`/CS0`)은 그린 자리의 Resources 에서 푼다. Flate·LZW 의 TIFF 예측자 2 도 되돌린다.
 * 맵 하나에 100장 · 합계 40MB 까지(넘으면 건너뛰고 센다). 푸는 일도 PDF 하나에 256MB·300번까지 —
 * 못 쓰는 그림(형식·크기)도 센다. 저장할 때 서버가 data URL 사진을 첨부 저장소로 옮긴다
 * (`maps/doc-images.ts`) — 문서에는 참조만 남는다.
 */
import { deflateSync } from 'zlib';
import { PName, PStr, PStream, PdfDoc, PdfError, num, type PDict, type PObj, type PageText } from './pdf-parse';

export const MAX_IMAGE_FILE = 2_500_000;
export const MAX_IMAGES = 100;
export const MAX_IMAGES_BYTES = 40_000_000;
/** 그림 하나를 풀 때의 상한(화소 바이트) — 큰 스캔 사진도 받되 메모리를 지킨다 */
const MAX_RAW = 64 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MIN_PT = 24;
const MIN_PX = 16;

/** 맵에 넣을 그림 하나 — 쪽 좌표의 자리 + 파일 */
export interface PdfImage {
  page: number;
  /** 그림 위 가장자리 y(쪽 좌표, 위로 큼) — 본문 사이에 끼울 자리 */
  top: number;
  x0: number;
  mime: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  /** 원본 화소 크기 (줄였으면 줄인 크기) */
  w: number;
  h: number;
}

export interface PdfImagesResult {
  images: PdfImage[];
  /** 건너뛴 까닭별 수 — 결과 문장에 알린다 */
  skipped: { small: number; repeated: number; format: number; tooBig: number; limit: number; broken: number };
  /** 넣었지만 투명도(SMask)를 버린 JPEG 수 */
  opaque: number;
}

// ── PNG 만들기 ───────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array, c = 0xffffffff): number {
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 255] ^ (c >>> 8);
  return c;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
  return out;
}

/** 8비트 화소 → PNG. ch = 1(회색)·2(회색+투명)·3(RGB)·4(RGBA) */
export function encodePng(w: number, h: number, ch: 1 | 2 | 3 | 4, px: Uint8Array): Uint8Array {
  const row = w * ch;
  const raw = new Uint8Array((row + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (row + 1)] = 0; raw.set(px.subarray(y * row, (y + 1) * row), y * (row + 1) + 1); }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = ({ 1: 0, 2: 4, 3: 2, 4: 6 } as const)[ch]; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** 화소를 k 배 줄인다(상자 평균) */
function shrink(w: number, h: number, ch: number, px: Uint8Array, k: number): { w: number; h: number; px: Uint8Array } {
  const nw = Math.max(1, Math.floor(w / k)), nh = Math.max(1, Math.floor(h / k));
  const out = new Uint8Array(nw * nh * ch);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < ch; c++) {
    let s = 0, n = 0;
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) { s += px[((y * k + dy) * w + (x * k + dx)) * ch + c]; n++; }
    out[(y * nw + x) * ch + c] = Math.round(s / n);
  }
  return { w: nw, h: nh, px: out };
}

// ── 색 공간 ──────────────────────────────────────────────────────────

/** 색 공간 → 성분 수와 화소 하나를 RGB(또는 회색)로 바꾸는 법. 모르면 null */
const DEVICE_NAMES = new Set(['DeviceGray', 'G', 'CalGray', 'DeviceRGB', 'RGB', 'CalRGB', 'DeviceCMYK', 'CMYK', 'ICCBased', 'Indexed', 'I', 'Pattern', 'Lab', 'Separation', 'DeviceN']);

type Space = { n: number; gray: boolean; toRgb?: (src: Uint8Array, i: number, out: Uint8Array, o: number) => void; palette?: Uint8Array };

function cmyk(c: number, m: number, y: number, k: number, out: Uint8Array, o: number) {
  out[o] = Math.round(((255 - c) * (255 - k)) / 255);
  out[o + 1] = Math.round(((255 - m) * (255 - k)) / 255);
  out[o + 2] = Math.round(((255 - y) * (255 - k)) / 255);
}

function space(doc: PdfDoc, cs: PObj | undefined, depth = 0, res: PDict | null = null): Space | null {
  let v = doc.resolve(cs);
  // `/CS0` 처럼 쪽·폼의 Resources /ColorSpace 에 정의한 이름 (#650 Codex)
  if (v instanceof PName && !DEVICE_NAMES.has(v.name)) {
    const named = doc.dict(res?.get('ColorSpace'))?.get(v.name);
    if (named !== undefined) v = doc.resolve(named);
  }
  const nm = v instanceof PName ? v.name : Array.isArray(v) && v[0] instanceof PName ? v[0].name : undefined;
  if (!nm || depth > 4) return null;
  if (nm === 'DeviceGray' || nm === 'G' || nm === 'CalGray') return { n: 1, gray: true };
  if (nm === 'DeviceRGB' || nm === 'RGB' || nm === 'CalRGB') return { n: 3, gray: false };
  if (nm === 'DeviceCMYK' || nm === 'CMYK') return { n: 4, gray: false, toRgb: (s, i, out, o) => cmyk(s[i], s[i + 1], s[i + 2], s[i + 3], out, o) };
  if (nm === 'ICCBased' && Array.isArray(v)) {
    const st = doc.resolve(v[1]);
    const n = st instanceof PStream ? num(doc.resolve(st.dict.get('N'))) : undefined;
    if (n === 1) return { n: 1, gray: true };
    if (n === 3) return { n: 3, gray: false };
    if (n === 4) return space(doc, new PName('DeviceCMYK'));
    return st instanceof PStream ? space(doc, st.dict.get('Alternate'), depth + 1, res) : null;
  }
  if ((nm === 'Indexed' || nm === 'I') && Array.isArray(v)) {
    const base = space(doc, v[1], depth + 1, res);
    const hival = num(doc.resolve(v[2]));
    const lk = doc.resolve(v[3]);
    if (!base || base.palette || hival === undefined) return null;
    const bytes = lk instanceof PStr ? lk.bytes : lk instanceof PStream ? doc.imageStream(lk, 1 << 20).data : null;
    if (!bytes) return null;
    // 팔레트를 RGB 로 펼쳐 둔다
    const pal = new Uint8Array((hival + 1) * 3);
    for (let i = 0; i <= hival; i++) {
      const j = i * base.n;
      if (j + base.n > bytes.length) break;
      if (base.gray) pal[i * 3] = pal[i * 3 + 1] = pal[i * 3 + 2] = bytes[j];
      else if (base.toRgb) base.toRgb(bytes, j, pal, i * 3);
      else { pal[i * 3] = bytes[j]; pal[i * 3 + 1] = bytes[j + 1]; pal[i * 3 + 2] = bytes[j + 2]; }
    }
    return { n: 1, gray: false, palette: pal };
  }
  return null;
}

/** 한 줄을 성분 값(0~255, Indexed 는 색 번호)으로 푼다 — 줄 끝은 바이트에 맞춰 채워져 있다 */
function unpackRow(data: Uint8Array, r: number, per: number, bpc: number, scale: boolean, out: Uint8Array): void {
  const max = (1 << bpc) - 1;
  for (let i = 0; i < per; i++) {
    let v: number;
    if (bpc === 8) v = data[r + i];
    else if (bpc === 16) v = data[r + i * 2];
    else { const bit = i * bpc; v = (data[r + (bit >> 3)] >> (8 - bpc - (bit & 7))) & max; if (scale) v = Math.round((v * 255) / max); }
    out[i] = v;
  }
}

/** 한 번에 펼치는 화소 상한 — 이보다 크면 **풀면서 바로** 줄인다(상자 평균). 큰 그림이 수백 MB 를 잡지 않게 (#650 Codex) */
const TARGET_PX = 4_000_000;

/** 이미지 XObject 하나 → 파일. 못 만들면 까닭을 던진다 */
/** 그림 풀기에 쓴 바이트 누계 — 받아들인 그림만이 아니라 **시도한 것 전부**를 센다 (#650 Codex) */
export interface DecodeBudget { raw: number; tries: number }
/** 한 PDF 에서 그림을 푸는 데 쓰는 바이트·횟수 상한 — 못 쓰는 그림이 수백 개여도 일이 끝없이 늘지 않게 */
export const MAX_DECODE_RAW = 256 * 1024 * 1024;
export const MAX_DECODE_TRIES = 300;

export function decodeImage(doc: PdfDoc, s: PStream, res: PDict | null = null, budget: DecodeBudget = { raw: 0, tries: 0 }): { mime: 'image/png' | 'image/jpeg'; bytes: Uint8Array; w: number; h: number; opaque?: boolean } {
  const d = s.dict;
  const w = num(doc.resolve(d.get('Width'))) ?? 0, h = num(doc.resolve(d.get('Height'))) ?? 0;
  if (w < 1 || h < 1 || w * h > MAX_PIXELS) throw new SkipImage('tooBig');
  const room = MAX_DECODE_RAW - budget.raw;
  if (room <= 0 || budget.tries >= MAX_DECODE_TRIES) throw new SkipImage('limit');
  budget.tries++;
  budget.raw += s.raw.length; // 실패해도 압축 바이트만큼은 센다
  const { data, tail } = doc.imageStream(s, Math.min(MAX_RAW, room));
  budget.raw += data.length;
  if (tail === 'DCT') {
    if (data.length > MAX_IMAGE_FILE) throw new SkipImage('tooBig');
    if (data[0] !== 0xff || data[1] !== 0xd8) throw new SkipImage('broken');
    // JPEG 에 SMask 가 있으면 투명도는 버린다 — JPEG 를 풀 디코더가 없다. 그림을 통째로 빼는 것보다 낫다고 보고, 결과에 수를 알린다
    return { mime: 'image/jpeg', bytes: data, w, h, ...(doc.resolve(d.get('SMask')) instanceof PStream ? { opaque: true } : {}) };
  }
  if (tail) throw new SkipImage('format');
  const sp = space(doc, d.get('ColorSpace'), 0, res);
  if (!sp) throw new SkipImage('format');
  const bpc = num(doc.resolve(d.get('BitsPerComponent'))) ?? 8;
  if (![1, 2, 4, 8, 16].includes(bpc)) throw new SkipImage('format');
  const per = w * sp.n;
  const rowBytes = Math.ceil((per * bpc) / 8);
  if (data.length < rowBytes * h) throw new SkipImage('broken');
  // /Decode — 성분마다 [최소 최대] 로 값을 다시 매긴다([1 0] = 뒤집기, 스캔 흑백에 흔하다). 모든 성분에 따로 건다 (#650 Codex).
  // Indexed 는 색 번호에 건다(기본 [0 2^bpc-1]). 기본값이면 건너뛴다
  const dec = doc.arr(d.get('Decode'))?.map((x) => num(doc.resolve(x)) ?? 0);
  const maxV = (1 << Math.min(bpc, 8)) - 1;
  let remap: Uint8Array[] | null = null;
  if (dec && dec.length >= sp.n * 2) {
    const tables: Uint8Array[] = [];
    let any = false;
    for (let c = 0; c < sp.n; c++) {
      const lo = dec[c * 2], hi = dec[c * 2 + 1];
      const t = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        if (sp.palette) { const idx = lo + (Math.min(v, maxV) * (hi - lo)) / maxV; t[v] = Math.max(0, Math.min(255, Math.round(idx))); }
        else t[v] = Math.max(0, Math.min(255, Math.round((lo + (v / 255) * (hi - lo)) * 255)));
        if (t[v] !== v) any = true;
      }
      tables.push(t);
    }
    if (any) remap = tables;
  }
  // 투명도(SMask) — 같은 크기의 그림일 때만
  let mask: { data: Uint8Array; bpc: number; rowBytes: number } | null = null;
  const sm = doc.resolve(d.get('SMask'));
  if (sm instanceof PStream && num(doc.resolve(sm.dict.get('Width'))) === w && num(doc.resolve(sm.dict.get('Height'))) === h) {
    try {
      const m = doc.imageStream(sm, Math.max(1, Math.min(MAX_RAW, MAX_DECODE_RAW - budget.raw)));
      budget.raw += m.data.length;
      const mb = num(doc.resolve(sm.dict.get('BitsPerComponent'))) ?? 8;
      const rb = Math.ceil((w * mb) / 8);
      if (!m.tail && [1, 2, 4, 8, 16].includes(mb) && m.data.length >= rb * h) mask = { data: m.data, bpc: mb, rowBytes: rb };
    } catch { mask = null; }
  }
  const color = !sp.gray;
  const ch = ((color ? 3 : 1) + (mask ? 1 : 0)) as 1 | 2 | 3 | 4;
  // 풀면서 줄인다 — 화소가 TARGET_PX 를 넘으면 k×k 상자 평균. 펼친 버퍼는 한 줄씩만 잡는다
  const k0 = Math.max(1, Math.ceil(Math.sqrt((w * h) / TARGET_PX)));
  const nw = Math.max(1, Math.floor(w / k0)), nh = Math.max(1, Math.floor(h / k0));
  const px = new Uint8Array(nw * nh * ch);
  const acc = new Uint32Array(nw * ch);
  const vals = new Uint8Array(per), alpha = new Uint8Array(w), row = new Uint8Array(w * ch);
  for (let y = 0; y < nh * k0; y++) {
    unpackRow(data, y * rowBytes, per, bpc, !sp.palette, vals);
    if (remap) for (let i = 0; i < per; i++) vals[i] = remap[i % sp.n][vals[i]];
    if (mask) unpackRow(mask.data, y * mask.rowBytes, w, mask.bpc, true, alpha);
    for (let i = 0, o = 0; i < w; i++, o += ch) {
      if (sp.palette) { const c = vals[i] * 3; row[o] = sp.palette[c] ?? 0; row[o + 1] = sp.palette[c + 1] ?? 0; row[o + 2] = sp.palette[c + 2] ?? 0; }
      else if (sp.toRgb) sp.toRgb(vals, i * sp.n, row, o);
      else if (color) { row[o] = vals[i * 3]; row[o + 1] = vals[i * 3 + 1]; row[o + 2] = vals[i * 3 + 2]; }
      else row[o] = vals[i];
      if (mask) row[o + ch - 1] = alpha[i];
    }
    if (k0 === 1) { px.set(row, y * w * ch); continue; }
    for (let x = 0; x < nw * k0; x++) for (let c = 0; c < ch; c++) acc[Math.floor(x / k0) * ch + c] += row[x * ch + c];
    if ((y + 1) % k0 === 0) {
      const oy = (y + 1) / k0 - 1, n = k0 * k0;
      for (let i = 0; i < acc.length; i++) px[oy * nw * ch + i] = Math.round(acc[i] / n);
      acc.fill(0);
    }
  }
  // 2.5MB 를 넘으면 화소를 2·3·…·8 배 더 줄여 맞춘다(상자 평균)
  for (let k = 1; k <= 8; k++) {
    const cur = k === 1 ? { w: nw, h: nh, px } : shrink(nw, nh, ch, px, k);
    const png = encodePng(cur.w, cur.h, ch, cur.px);
    if (png.length <= MAX_IMAGE_FILE) return { mime: 'image/png', bytes: png, w: cur.w, h: cur.h };
  }
  throw new SkipImage('tooBig');
}

export class SkipImage extends Error { constructor(readonly why: keyof PdfImagesResult['skipped']) { super(why); } }

/**
 * 쪽마다 기록한 그림 자리 → 맵에 넣을 그림. 작은 것·되풀이(로고)·같은 쪽의 겹침은 고르는 규칙대로 뺀다.
 */
export function extractPdfImages(doc: PdfDoc, pages: (PageText & { index: number })[]): PdfImagesResult {
  const skipped = { small: 0, repeated: 0, format: 0, tooBig: 0, limit: 0, broken: 0 };
  const images: PdfImage[] = [];
  // 되풀이 — 같은 그림 스트림이 그려진 쪽 수
  const pagesOf = new Map<PStream, Set<number>>();
  for (const p of pages) for (const dr of p.draws ?? []) {
    const set = pagesOf.get(dr.s) ?? new Set<number>();
    set.add(p.index); pagesOf.set(dr.s, set);
  }
  const repeatAt = Math.max(3, Math.ceil(pages.length * 0.5));
  const cache = new Map<PStream, ReturnType<typeof decodeImage> | SkipImage>();
  let total = 0, opaque = 0;
  const budget: DecodeBudget = { raw: 0, tries: 0 };
  for (const p of pages) {
    const seen = new Set<PStream>();
    const draws = [...(p.draws ?? [])].sort((a, b) => b.y1 - a.y1 || a.x0 - b.x0);
    for (const dr of draws) {
      if (seen.has(dr.s)) continue;
      seen.add(dr.s);
      const pw = num(doc.resolve(dr.s.dict.get('Width'))) ?? 0, ph = num(doc.resolve(dr.s.dict.get('Height'))) ?? 0;
      if (dr.x1 - dr.x0 < MIN_PT || dr.y1 - dr.y0 < MIN_PT || pw < MIN_PX || ph < MIN_PX) { skipped.small++; continue; }
      if (pages.length > 1 && (pagesOf.get(dr.s)?.size ?? 0) >= repeatAt) { skipped.repeated++; continue; }
      if (images.length >= MAX_IMAGES) { skipped.limit++; continue; }
      let got = cache.get(dr.s);
      if (!got) {
        // 결과 한도에 이미 닿았으면 풀지도 않는다
        if (total >= MAX_IMAGES_BYTES) { skipped.limit++; continue; }
        try { got = decodeImage(doc, dr.s, dr.res ?? null, budget); } catch (e) {
          got = e instanceof SkipImage ? e : new SkipImage(e instanceof PdfError && /너무 큽니다/.test(e.message) ? 'tooBig' : 'broken');
        }
        cache.set(dr.s, got);
      }
      if (got instanceof SkipImage) { skipped[got.why]++; continue; }
      if (total + got.bytes.length > MAX_IMAGES_BYTES) { skipped.limit++; continue; }
      total += got.bytes.length;
      if (got.opaque) opaque++;
      images.push({ page: p.index, top: dr.y1, x0: dr.x0, mime: got.mime, bytes: got.bytes, w: got.w, h: got.h });
    }
  }
  return { images, skipped, opaque };
}
