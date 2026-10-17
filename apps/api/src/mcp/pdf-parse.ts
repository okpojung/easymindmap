/**
 * **PDF 글자 읽기** (2026-10-14) — `import_pdf` 의 아랫단. 설계: mcp-connector.md §9.17
 *
 * 외부 패키지 없이(노드 기본 `zlib` 만) PDF 의 글자를 **쪽마다, 위치·크기와 함께** 꺼낸다.
 * 구조 만들기(제목·문단·가지)는 `pdf-map.ts` 가 한다.
 *
 * 하는 것
 *   · 객체 읽기 — 파일을 훑어 `N G obj` 를 모두 읽는다(깨진 xref 에도 견딘다). 객체 스트림(ObjStm)·
 *     증분 저장(뒤에 나온 정의가 이긴다)·trailer / XRef 스트림의 /Root.
 *   · 필터 — Flate(+PNG 예측자)·ASCIIHex·ASCII85·RunLength·LZW.
 *   · 글꼴 — ToUnicode CMap(bfchar·bfrange·codespacerange), Type0(Identity·UCS2·UHC/KSC),
 *     단순 글꼴의 WinAnsi·MacRoman·Standard + Differences 글리프 이름, 글자 폭(/Widths·/W·/DW).
 *   · 내용 스트림 — 그래픽 상태(q Q cm)·글자 상태(Tf Tc Tw Tz TL Ts Tm Td TD T*)·Tj TJ ' " ·
 *     Form XObject(Do)·인라인 이미지 건너뛰기. 보이지 않는 글자(스캔 PDF 의 OCR 층)도 읽는다.
 *   · 그림(이미지 XObject) — 글로 옮기지 않고 **그린 자리만** 적는다(`PageText.draws`). 꺼내서 PNG·JPEG 로
 *     만드는 것은 `pdf-image.ts` (2026-10-17 사용자 요청: "그림일 때는 이미지로 첨부해 줘").
 *   · 책갈피(Outlines) — 제목·쪽·위치(/XYZ 의 top), 이름 있는 목적지(/Dests·Names 트리).
 * 못 하는 것: 암호 걸린 PDF(거절), 글자가 그림인 스캔 PDF(OCR 없음 — 쪽마다 "글자 없음"으로 알린다),
 *   ToUnicode 없는 Identity 글꼴(글자를 알 수 없음 — 센다).
 */
import { constants as zc, inflateRawSync, inflateSync } from 'zlib';

export class PdfError extends Error {}

// ── 객체 ─────────────────────────────────────────────────────────────

export class PName { constructor(readonly name: string) {} }
export class PRef { constructor(readonly num: number, readonly gen: number) {} }
export class PStr { constructor(readonly bytes: Uint8Array) {} }
export class POp { constructor(readonly op: string) {} }
export class PStream { constructor(readonly dict: PDict, readonly raw: Uint8Array) {} }
export type PDict = Map<string, PObj>;
export type PObj = null | boolean | number | PName | PRef | PStr | PObj[] | PDict | PStream;

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

class Mark { constructor(readonly k: '<<' | '>>' | '[' | ']' | '{' | '}') {} }
const M_DS = new Mark('<<'), M_DE = new Mark('>>'), M_AS = new Mark('['), M_AE = new Mark(']');
const M_BS = new Mark('{'), M_BE = new Mark('}');
type Tok = PObj | Mark | POp | undefined;

export class Lexer {
  constructor(readonly b: Uint8Array, public p = 0, readonly end = b.length) {}

  skipWs(): void {
    const b = this.b;
    while (this.p < this.end) {
      const c = b[this.p];
      if (WS[c]) this.p++;
      else if (c === 37) { while (this.p < this.end && b[this.p] !== 10 && b[this.p] !== 13) this.p++; }
      else break;
    }
  }

  next(): Tok {
    this.skipWs();
    const b = this.b;
    if (this.p >= this.end) return undefined;
    const c = b[this.p];
    if (c === 60) { // <
      if (b[this.p + 1] === 60) { this.p += 2; return M_DS; }
      return this.hexString();
    }
    if (c === 62) { if (b[this.p + 1] === 62) { this.p += 2; return M_DE; } this.p++; return this.next(); }
    if (c === 91) { this.p++; return M_AS; }
    if (c === 93) { this.p++; return M_AE; }
    if (c === 123) { this.p++; return M_BS; }
    if (c === 125) { this.p++; return M_BE; }
    if (c === 40) return this.litString();
    if (c === 47) return this.name();
    if (c === 41) { this.p++; return this.next(); } // 짝 없는 ) — 버린다
    const s = this.p;
    while (this.p < this.end && !WS[b[this.p]] && !DELIM[b[this.p]]) this.p++;
    if (this.p === s) { this.p++; return this.next(); }
    const word = latin1(b, s, this.p);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return Number(word);
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    return new POp(word);
  }

  private name(): PName {
    const b = this.b;
    this.p++;
    const s = this.p;
    while (this.p < this.end && !WS[b[this.p]] && !DELIM[b[this.p]]) this.p++;
    let n = latin1(b, s, this.p);
    if (n.includes('#')) n = n.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    return new PName(n);
  }

  private hexString(): PStr {
    const b = this.b;
    this.p++;
    const out: number[] = [];
    let hi = -1;
    while (this.p < this.end && b[this.p] !== 62) {
      const v = hexVal(b[this.p++]);
      if (v < 0) continue;
      if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
    }
    if (hi >= 0) out.push(hi * 16);
    this.p++;
    return new PStr(Uint8Array.from(out));
  }

  private litString(): PStr {
    const b = this.b;
    this.p++;
    const out: number[] = [];
    let depth = 1;
    while (this.p < this.end) {
      const c = b[this.p++];
      if (c === 92) { // \
        const n = b[this.p++];
        if (n === 110) out.push(10); else if (n === 114) out.push(13); else if (n === 116) out.push(9);
        else if (n === 98) out.push(8); else if (n === 102) out.push(12);
        else if (n === 13) { if (b[this.p] === 10) this.p++; }
        else if (n === 10) { /* 줄 이음 */ }
        else if (n >= 48 && n <= 55) {
          let v = n - 48;
          for (let k = 0; k < 2 && b[this.p] >= 48 && b[this.p] <= 55; k++) v = v * 8 + (b[this.p++] - 48);
          out.push(v & 255);
        } else out.push(n);
        continue;
      }
      if (c === 40) depth++;
      else if (c === 41 && --depth === 0) break;
      out.push(c);
    }
    return new PStr(Uint8Array.from(out));
  }

  /** 객체 하나 — `refs` 면 `n g R` 을 참조로 읽는다(내용 스트림에서는 끈다) */
  obj(refs = true, first?: Tok): PObj | POp | undefined {
    const t = first === undefined ? this.next() : first;
    if (t === M_DS) {
      const d: PDict = new Map();
      for (;;) {
        const k = this.next();
        if (k === undefined || k === M_DE) break;
        if (!(k instanceof PName)) continue;
        const v = this.obj(refs);
        if (v instanceof POp) { if (v.op === 'endobj' || v.op === 'stream') break; continue; }
        d.set(k.name, v === undefined ? null : v);
      }
      return d;
    }
    if (t === M_AS) {
      const a: PObj[] = [];
      for (;;) {
        const save = this.p;
        const k = this.next();
        if (k === undefined || k === M_AE) break;
        if (k instanceof POp && (k.op === 'endobj' || k.op === 'stream')) { this.p = save; break; }
        const v = this.obj(refs, k);
        if (v instanceof POp || v === undefined) continue;
        a.push(v);
      }
      return a;
    }
    if (t instanceof Mark) return this.obj(refs); // 짝 없는 >> ] { } — 건너뛴다
    if (refs && typeof t === 'number' && Number.isInteger(t) && t >= 0) {
      const save = this.p;
      const g = this.next();
      if (typeof g === 'number' && Number.isInteger(g)) {
        const r = this.next();
        if (r instanceof POp && r.op === 'R') return new PRef(t, g);
      }
      this.p = save;
    }
    return t as PObj | POp | undefined;
  }
}

function hexVal(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

export function latin1(b: Uint8Array, s = 0, e = b.length): string {
  let out = '';
  for (let i = s; i < e; i += 8192) out += String.fromCharCode.apply(null, Array.from(b.subarray(i, Math.min(e, i + 8192))));
  return out;
}

// ── 필터 ─────────────────────────────────────────────────────────────

/**
 * 풀린 크기 상한 (#642 Codex) — 작은 PDF 안의 압축 폭탄(몇 KB → 몇 GB)이 API 프로세스 메모리를 다 먹지
 * 않게, 스트림 하나와 문서 전체에 각각 건다. 글자를 읽는 데 쓰는 것은 내용·글꼴·CMap·객체 스트림뿐이라
 * 실제 문서는 이보다 훨씬 작다(300쪽 보고서도 수십 MB).
 */
export const MAX_STREAM_DECODED = 64 * 1024 * 1024;
export const MAX_DOC_DECODED = 256 * 1024 * 1024;
const TOO_BIG = () => new PdfError(`압축을 푼 크기가 너무 큽니다(스트림 하나 ${MAX_STREAM_DECODED / 1024 / 1024}MB · 문서 전체 ${MAX_DOC_DECODED / 1024 / 1024}MB 까지) — 압축 폭탄이거나 지나치게 큰 PDF 입니다.`);

function inflate(data: Uint8Array, cap: number): Uint8Array {
  const tries: (() => Uint8Array)[] = [
    () => inflateSync(data, { maxOutputLength: cap }),
    () => inflateSync(data, { finishFlush: zc.Z_SYNC_FLUSH, maxOutputLength: cap }),
    () => inflateRawSync(data.subarray(2), { finishFlush: zc.Z_SYNC_FLUSH, maxOutputLength: cap }),
  ];
  for (const t of tries) {
    try { return t(); } catch (e) {
      // 상한에 걸린 것은 다른 방법으로 풀어도 같다 — 바로 멈춘다
      if ((e as { code?: string })?.code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) throw TOO_BIG();
    }
  }
  throw new PdfError('압축된 스트림을 풀지 못했습니다(Flate).');
}

function pngPredict(data: Uint8Array, parms: PDict | null): Uint8Array {
  const pred = num(parms?.get('Predictor')) ?? 1;
  if (pred < 10) return data;
  const colors = num(parms?.get('Colors')) ?? 1;
  const bpc = num(parms?.get('BitsPerComponent')) ?? 8;
  const cols = num(parms?.get('Columns')) ?? 1;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const row = Math.ceil((colors * bpc * cols) / 8);
  const out = new Uint8Array(Math.floor(data.length / (row + 1)) * row);
  let prev = new Uint8Array(row);
  for (let r = 0, o = 0; (r + 1) * (row + 1) <= data.length; r++) {
    const ft = data[r * (row + 1)];
    const cur = data.subarray(r * (row + 1) + 1, (r + 1) * (row + 1));
    const line = new Uint8Array(row);
    for (let i = 0; i < row; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1;
      else if (ft === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      line[i] = v & 255;
    }
    out.set(line, o); o += row; prev = line;
  }
  return out;
}

function asciiHex(d: Uint8Array): Uint8Array {
  const out: number[] = []; let hi = -1;
  for (const c of d) { if (c === 62) break; const v = hexVal(c); if (v < 0) continue; if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; } }
  if (hi >= 0) out.push(hi * 16);
  return Uint8Array.from(out);
}

function ascii85(d: Uint8Array, cap = Infinity): Uint8Array {
  const out: number[] = []; const g: number[] = [];
  let i = 0;
  if (d[0] === 60 && d[1] === 126) i = 2;
  for (; i < d.length; i++) {
    const c = d[i];
    if (c === 126) break;
    if (WS[c]) continue;
    if (c === 122 && g.length === 0) { out.push(0, 0, 0, 0); if (out.length > cap) throw TOO_BIG(); continue; }
    if (c < 33 || c > 117) continue;
    g.push(c - 33);
    if (g.length === 5) { let v = 0; for (const x of g) v = v * 85 + x; out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); g.length = 0; }
  }
  if (g.length) { const n = g.length; while (g.length < 5) g.push(84); let v = 0; for (const x of g) v = v * 85 + x; const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...bytes.slice(0, n - 1)); }
  return Uint8Array.from(out);
}

function runLength(d: Uint8Array, cap = Infinity): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < d.length;) {
    if (out.length > cap) throw TOO_BIG();
    const n = d[i++];
    if (n === 128) break;
    if (n < 128) { for (let k = 0; k <= n && i < d.length; k++) out.push(d[i++]); }
    else { const v = d[i++]; for (let k = 0; k < 257 - n; k++) out.push(v); }
  }
  return Uint8Array.from(out);
}

function lzw(d: Uint8Array, early = 1, cap = Infinity): Uint8Array {
  const out: number[] = [];
  let dict: number[][] = [];
  const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push([], []); };
  reset();
  let bits = 9, buf = 0, nb = 0, prev: number[] | null = null;
  for (const byte of d) {
    buf = (buf << 8) | byte; nb += 8;
    while (nb >= bits) {
      const code = (buf >> (nb - bits)) & ((1 << bits) - 1); nb -= bits;
      if (code === 256) { reset(); bits = 9; prev = null; continue; }
      if (code === 257) return Uint8Array.from(out);
      let entry: number[];
      if (code < dict.length) entry = dict[code];
      else if (prev) entry = [...prev, prev[0]];
      else return Uint8Array.from(out);
      out.push(...entry);
      if (out.length > cap) throw TOO_BIG();
      if (prev) dict.push([...prev, entry[0]]);
      prev = entry;
      if (dict.length + early >= 1 << bits && bits < 12) bits++;
    }
  }
  return Uint8Array.from(out);
}

/** 그림 압축 필터 → 이름 (풀지 않는다) */
const IMAGE_FILTERS = new Map([
  ['DCTDecode', 'DCT'], ['DCT', 'DCT'], ['JPXDecode', 'JPX'], ['JBIG2Decode', 'JBIG2'], ['CCITTFaxDecode', 'CCITT'], ['CCF', 'CCITT'],
]);

// ── 문서 ─────────────────────────────────────────────────────────────

export function num(o: PObj | undefined): number | undefined { return typeof o === 'number' ? o : undefined; }

/** 쪽 하나 — 상속되는 Resources·상자·회전을 채운 것 */
export interface PageRef { dict: PDict; ref: number | null; resources: PDict | null; box: number[]; rotate?: number }

export interface OutlineItem { title: string; page: number | null; top: number | null; children: OutlineItem[] }

export class PdfDoc {
  private readonly objs = new Map<number, PObj>();
  private readonly decoded = new WeakMap<PStream, Uint8Array>();
  /** 지금까지 푼 바이트 — `MAX_DOC_DECODED` 를 넘으면 `overBudget` 이 서고 그 뒤로는 풀지 않는다 */
  private decodedBytes = 0;
  overBudget = false;
  /**
   * 깨진 조각처럼 넘기면 안 되는 거절(지나친 중첩·글자 조각 수 등) — 부르는 쪽이 조각 하나의 오류로 삼켜도
   * `readPdf` 가 보고 PDF 전체를 거절한다. 조용히 글을 빼먹거나 틀리게 읽지 않게 한다 (#642 Codex)
   */
  fatal: PdfError | null = null;
  /** 글자 조각 수 (문서 전체) — `MAX_RUNS_DOC` 상한 */
  runCount = 0;
  /** 그린 글자열 바이트 (문서 전체) — `MAX_SHOW_BYTES_DOC` 상한 */
  showBytes = 0;
  fail(msg: string): PdfError { this.fatal ??= new PdfError(msg); return this.fatal; }
  readonly trailer: PDict = new Map();
  private readonly s: string;

  constructor(readonly bytes: Uint8Array) {
    if (latin1(bytes, 0, Math.min(1024, bytes.length)).indexOf('%PDF-') < 0) throw new PdfError('PDF 파일이 아닙니다(머리에 %PDF- 가 없습니다).');
    this.s = latin1(bytes);
    this.scan();
    this.expandObjStreams();
    this.relength();
    if (this.overBudget) throw TOO_BIG();
    this.findTrailer();
    if (this.trailer.get('Encrypt')) throw new PdfError('암호가 걸린(보호된) PDF 라 읽을 수 없습니다 — 보호를 푼 PDF 로 다시 올려 주세요.');
  }

  /**
   * `N 0 obj 1234 endobj` 꼴의 숫자 객체 — 스트림 뒤에 오는 간접 `/Length` 를 첫 훑기에서 쓰려고 미리 모은다
   * (#642 Codex: 못 찾으면 첫 `endstream` 글자에서 잘라 그 뒤 글을 잃는다). 틀린 값이어도 아래에서
   * 그 자리에 `endstream` 이 있는지 다시 보므로 해가 없다.
   */
  private numberObjs(): Map<number, number> {
    const m = new Map<number, number>();
    const re = /(\d+)\s+\d+\s+obj\s*(\d+)\s*endobj/g;
    let x: RegExpExecArray | null;
    while ((x = re.exec(this.s))) m.set(Number(x[1]), Number(x[2]));
    return m;
  }

  /** 길이가 객체 스트림 안 숫자라 첫 훑기에서 몰랐던 스트림 — 객체 스트림을 푼 뒤 다시 자른다 */
  private readonly pendingLen: { s: PStream; ds: number; ref: number }[] = [];

  private relength(): void {
    for (const { s, ds, ref } of this.pendingLen) {
      const L = num(this.resolve(new PRef(ref, 0)));
      if (L === undefined || ds + L > this.bytes.length || !/^\s*endstream/.test(this.s.slice(ds + L, ds + L + 20))) continue;
      const fixed = new PStream(s.dict, this.bytes.subarray(ds, ds + L));
      for (const [n, v] of this.objs) if (v === s) this.objs.set(n, fixed);
    }
    this.pendingLen.length = 0;
  }

  private scan(): void {
    let lens: Map<number, number> | null = null;
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.s))) {
      const at = m.index;
      if (at > 0 && !WS[this.bytes[at - 1]] && !DELIM[this.bytes[at - 1]]) continue;
      const n = Number(m[1]);
      const lx = new Lexer(this.bytes, re.lastIndex);
      let o: PObj | POp | undefined;
      try { o = lx.obj(); } catch { continue; }
      if (o instanceof POp || o === undefined) continue;
      let endAt = lx.p;
      if (o instanceof Map) {
        const save = lx.p;
        const k = lx.next();
        if (k instanceof POp && k.op === 'stream') {
          let ds = lx.p;
          if (this.bytes[ds] === 13) ds++;
          if (this.bytes[ds] === 10) ds++;
          let de = -1;
          let unresolved = false;
          const len = o.get('Length');
          const L = typeof len === 'number' ? len
            : len instanceof PRef ? num(this.objs.get(len.num)) ?? (lens ??= this.numberObjs()).get(len.num) : undefined;
          if (L !== undefined && ds + L <= this.bytes.length && /^\s*endstream/.test(this.s.slice(ds + L, ds + L + 20))) de = ds + L;
          if (de < 0 && len instanceof PRef && L === undefined) unresolved = true;
          if (de < 0) {
            const es = this.s.indexOf('endstream', ds);
            de = es < 0 ? this.bytes.length : es;
            if (this.bytes[de - 1] === 10) de--;
            if (this.bytes[de - 1] === 13) de--;
          }
          const dict: PDict = o;
          o = new PStream(dict, this.bytes.subarray(ds, de));
          if (unresolved) this.pendingLen.push({ s: o, ds, ref: (len as PRef).num });
          const es2 = this.s.indexOf('endstream', de);
          endAt = es2 < 0 ? this.bytes.length : es2 + 9;
        } else lx.p = save;
      }
      this.objs.set(n, o);
      re.lastIndex = Math.max(re.lastIndex, endAt);
    }
  }

  private expandObjStreams(): void {
    const direct = new Set(this.objs.keys());
    for (const [, o] of [...this.objs]) {
      if (!(o instanceof PStream) || name(o.dict.get('Type')) !== 'ObjStm') continue;
      let data: Uint8Array;
      try { data = this.stream(o); } catch { continue; }
      const n = num(this.resolve(o.dict.get('N'))) ?? 0;
      const first = num(this.resolve(o.dict.get('First'))) ?? 0;
      const head = new Lexer(data, 0, first);
      const pairs: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = head.next(), b = head.next();
        if (typeof a !== 'number' || typeof b !== 'number') break;
        pairs.push([a, b]);
      }
      for (const [objNum, off] of pairs) {
        if (direct.has(objNum)) continue;
        try {
          const v = new Lexer(data, first + off).obj();
          if (!(v instanceof POp) && v !== undefined) this.objs.set(objNum, v);
        } catch { /* 건너뛴다 */ }
      }
    }
  }

  private findTrailer(): void {
    let at = this.s.lastIndexOf('trailer');
    while (at >= 0) {
      const d = new Lexer(this.bytes, at + 7).obj();
      if (d instanceof Map && d.get('Root')) { for (const [k, v] of d) if (!this.trailer.has(k)) this.trailer.set(k, v); break; }
      at = this.s.lastIndexOf('trailer', at - 1);
    }
    if (!this.trailer.get('Root')) {
      for (const o of [...this.objs.values()].reverse()) {
        if (o instanceof PStream && name(o.dict.get('Type')) === 'XRef' && o.dict.get('Root')) {
          for (const k of ['Root', 'Info', 'Encrypt']) if (o.dict.get(k) !== undefined) this.trailer.set(k, o.dict.get(k) as PObj);
          break;
        }
      }
    }
  }

  resolve(o: PObj | undefined, depth = 0): PObj {
    let v: PObj | undefined = o;
    while (v instanceof PRef && depth++ < 20) v = this.objs.get(v.num);
    return v === undefined ? null : v;
  }
  dict(o: PObj | undefined): PDict | null {
    const v = this.resolve(o);
    if (v instanceof Map) return v;
    if (v instanceof PStream) return v.dict;
    return null;
  }
  arr(o: PObj | undefined): PObj[] | null { const v = this.resolve(o); return Array.isArray(v) ? v : null; }

  /** 스트림 풀기 (필터 차례대로) — 그림 필터(DCT 등)는 풀지 않는다 */
  stream(s: PStream): Uint8Array {
    const c = this.decoded.get(s);
    if (c) return c;
    const f = this.resolve(s.dict.get('Filter'));
    const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => name(this.resolve(x)) ?? '');
    const p = this.resolve(s.dict.get('DecodeParms'));
    const parms = Array.isArray(p) ? p.map((x) => this.dict(x)) : [p instanceof Map ? p : null];
    if (this.overBudget) throw TOO_BIG();
    // 이 스트림이 쓸 수 있는 몫 — 스트림 상한과 문서에 남은 몫 중 작은 것
    const cap = Math.min(MAX_STREAM_DECODED, MAX_DOC_DECODED - this.decodedBytes);
    let d: Uint8Array = s.raw;
    try {
      filters.forEach((fl, i) => {
        const pm = parms[i] ?? null;
        if (fl === 'FlateDecode' || fl === 'Fl') d = pngPredict(inflate(d, cap), pm);
        else if (fl === 'ASCIIHexDecode' || fl === 'AHx') d = asciiHex(d);
        else if (fl === 'ASCII85Decode' || fl === 'A85') d = ascii85(d, cap);
        else if (fl === 'RunLengthDecode' || fl === 'RL') d = runLength(d, cap);
        else if (fl === 'LZWDecode' || fl === 'LZW') d = pngPredict(lzw(d, num(pm?.get('EarlyChange')) ?? 1, cap), pm);
        else throw new PdfError(`지원하지 않는 필터: ${fl}`);
        if (d.length > cap) throw TOO_BIG();
      });
    } catch (e) {
      // 상한에 걸리면 문서 전체를 멈추게 표시한다 — 부르는 쪽이 깨진 조각으로 여겨 삼켜도 readPdf 가 본다
      if (e instanceof PdfError && e.message === TOO_BIG().message) this.overBudget = true;
      throw e;
    }
    this.decodedBytes += d.length;
    if (this.decodedBytes >= MAX_DOC_DECODED) this.overBudget = true;
    this.decoded.set(s, d);
    return d;
  }

  /**
   * 그림 스트림 풀기 (2026-10-17) — 글 읽기 예산(`overBudget`)과 **따로** 센다: 큰 사진 하나 때문에 PDF 전체를
   * 거절하면 안 된다. 캐시하지 않는다(그림은 한 번 쓰고 버린다). 마지막 필터가 그림 압축(DCT·JPX·JBIG2·CCITT)이면
   * 풀지 않고 그 이름을 `tail` 로 돌려준다 — JPEG 는 그 바이트가 곧 파일이다.
   */
  imageStream(s: PStream, cap: number): { data: Uint8Array; tail: string | null } {
    const f = this.resolve(s.dict.get('Filter'));
    const filters = (Array.isArray(f) ? f : f ? [f] : []).map((x) => name(this.resolve(x)) ?? '');
    const p = this.resolve(s.dict.get('DecodeParms'));
    const parms = Array.isArray(p) ? p.map((x) => this.dict(x)) : [p instanceof Map ? p : null];
    let d: Uint8Array = s.raw;
    let tail: string | null = null;
    for (let i = 0; i < filters.length; i++) {
      const fl = filters[i], pm = parms[i] ?? null;
      if (IMAGE_FILTERS.has(fl)) {
        if (i !== filters.length - 1) throw new PdfError(`그림 필터 ${fl} 뒤에 다른 필터가 있습니다`);
        tail = IMAGE_FILTERS.get(fl)!;
        break;
      }
      try {
        if (fl === 'FlateDecode' || fl === 'Fl') d = pngPredict(inflate(d, cap), pm);
        else if (fl === 'ASCIIHexDecode' || fl === 'AHx') d = asciiHex(d);
        else if (fl === 'ASCII85Decode' || fl === 'A85') d = ascii85(d, cap);
        else if (fl === 'RunLengthDecode' || fl === 'RL') d = runLength(d, cap);
        else if (fl === 'LZWDecode' || fl === 'LZW') d = pngPredict(lzw(d, num(pm?.get('EarlyChange')) ?? 1, cap), pm);
        else throw new PdfError(`지원하지 않는 필터: ${fl}`);
      } catch (e) {
        if (e instanceof PdfError && e.message === TOO_BIG().message) throw new PdfError('그림이 너무 큽니다');
        throw e;
      }
      if (d.length > cap) throw new PdfError('그림이 너무 큽니다');
    }
    return { data: d, tail };
  }

  get root(): PDict | null { return this.dict(this.trailer.get('Root')); }

  /** 문서 정보의 제목 */
  get title(): string {
    const info = this.dict(this.trailer.get('Info'));
    const t = this.resolve(info?.get('Title'));
    return t instanceof PStr ? decodeTextString(t.bytes).trim() : '';
  }

  /** 쪽 목록 — 상속되는 Resources·MediaBox·CropBox 를 채워서 */
  pages(): PageRef[] {
    const out: PageRef[] = [];
    const seen = new Set<PDict>();
    const walk = (node: PObj | undefined, ref: number | null, inh: { res: PDict | null; box: number[] | null; rotate: number }, depth: number) => {
      const d = this.dict(node);
      if (!d || seen.has(d) || depth > 64) return;
      seen.add(d);
      const res = this.dict(d.get('Resources')) ?? inh.res;
      const boxA = this.arr(d.get('CropBox')) ?? this.arr(d.get('MediaBox'));
      const box = boxA ? boxA.map((x) => num(this.resolve(x)) ?? 0) : inh.box;
      const rotate = num(this.resolve(d.get('Rotate'))) ?? inh.rotate;
      const kids = this.arr(d.get('Kids'));
      if (kids && name(d.get('Type')) !== 'Page') {
        for (const k of kids) walk(k, k instanceof PRef ? k.num : null, { res, box, rotate }, depth + 1);
      } else {
        out.push({ dict: d, ref, resources: res, box: box ?? [0, 0, 612, 792], rotate });
      }
    };
    const root = this.root;
    if (root) walk(root.get('Pages'), null, { res: null, box: null, rotate: 0 }, 0);
    if (!out.length) {
      for (const [n, o] of [...this.objs].sort((a, b) => a[0] - b[0])) {
        if (o instanceof Map && name(o.get('Type')) === 'Page') out.push({ dict: o, ref: n, resources: this.dict(o.get('Resources')), box: (this.arr(o.get('MediaBox')) ?? [0, 0, 612, 792]).map((x) => num(this.resolve(x)) ?? 0), rotate: num(this.resolve(o.get('Rotate'))) ?? 0 });
      }
    }
    return out;
  }

  /** 쪽 내용 스트림(여럿이면 이어 붙임) */
  contents(page: PDict): Uint8Array {
    const c = this.resolve(page.get('Contents'));
    const list = Array.isArray(c) ? c.map((x) => this.resolve(x)) : [c];
    const parts: Uint8Array[] = [];
    let total = 0;
    for (const s of list) {
      if (!(s instanceof PStream)) continue;
      let p: Uint8Array;
      try { p = this.stream(s); } catch { continue; /* 깨진 조각은 건너뛴다 */ }
      // 같은 스트림을 여러 번 가리켜도 푸는 몫은 한 번만 센다(캐시) — 이어 붙인 크기를 따로 묶는다 (#642 Codex)
      total += p.length + 1;
      if (total > MAX_STREAM_DECODED) { this.overBudget = true; throw TOO_BIG(); }
      parts.push(p);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; out[o++] = 10; }
    return out;
  }

  /** 책갈피 */
  outline(pageIndexByRef: Map<number, number>): OutlineItem[] {
    const root = this.root;
    const top = this.dict(root?.get('Outlines'));
    if (!top) return [];
    const seen = new Set<PDict>();
    const named = (n: string): PObj => {
      const dests = this.dict(root?.get('Dests'));
      if (dests?.has(n)) return this.resolve(dests.get(n));
      const tree = this.dict(this.dict(root?.get('Names'))?.get('Dests'));
      return tree ? this.nameTree(tree, n, 0) : null;
    };
    const dest = (d: PObj): { page: number | null; top: number | null } => {
      let v = this.resolve(d);
      if (v instanceof PStr) v = named(latin1(v.bytes));
      else if (v instanceof PName) v = named(v.name);
      if (v instanceof Map) v = this.resolve(v.get('D'));
      if (!Array.isArray(v) || !v.length) return { page: null, top: null };
      const p = v[0];
      const page = p instanceof PRef ? pageIndexByRef.get(p.num) ?? null : typeof p === 'number' ? p : null;
      const kind = name(v[1]);
      const t = kind === 'XYZ' ? num(this.resolve(v[3])) : kind === 'FitH' || kind === 'FitBH' ? num(this.resolve(v[2])) : undefined;
      return { page, top: t ?? null };
    };
    const items = (first: PObj | undefined, depth: number): OutlineItem[] => {
      const out: OutlineItem[] = [];
      let cur = this.dict(first);
      let guard = 0;
      while (cur && !seen.has(cur) && guard++ < 5000 && depth < 12) {
        seen.add(cur);
        const t = this.resolve(cur.get('Title'));
        let target: { page: number | null; top: number | null } = { page: null, top: null };
        if (cur.get('Dest') !== undefined) target = dest(cur.get('Dest') as PObj);
        else {
          const a = this.dict(cur.get('A'));
          if (a && name(a.get('S')) === 'GoTo') target = dest(a.get('D') as PObj);
        }
        out.push({ title: t instanceof PStr ? decodeTextString(t.bytes).replace(/\s+/g, ' ').trim() : '', ...target, children: items(cur.get('First'), depth + 1) });
        cur = this.dict(cur.get('Next'));
      }
      return out;
    };
    return items(top.get('First'), 0);
  }

  private nameTree(node: PDict, key: string, depth: number): PObj {
    if (depth > 32) return null;
    const names = this.arr(node.get('Names'));
    if (names) for (let i = 0; i + 1 < names.length; i += 2) {
      const k = this.resolve(names[i]);
      if (k instanceof PStr && latin1(k.bytes) === key) return this.resolve(names[i + 1]);
    }
    for (const kid of this.arr(node.get('Kids')) ?? []) {
      const d = this.dict(kid);
      if (!d) continue;
      const lim = this.arr(d.get('Limits'));
      if (lim && lim.length === 2) {
        const lo = this.resolve(lim[0]), hi = this.resolve(lim[1]);
        if (lo instanceof PStr && hi instanceof PStr && (key < latin1(lo.bytes) || key > latin1(hi.bytes))) continue;
      }
      const r = this.nameTree(d, key, depth + 1);
      if (r !== null) return r;
    }
    return null;
  }
}

export function name(o: PObj | undefined): string | undefined { return o instanceof PName ? o.name : undefined; }

// ── 글자열 ───────────────────────────────────────────────────────────

const PDFDOC_HIGH: Record<number, number> = {
  0x80: 0x2022, 0x81: 0x2020, 0x82: 0x2021, 0x83: 0x2026, 0x84: 0x2014, 0x85: 0x2013, 0x86: 0x0192, 0x87: 0x2044,
  0x88: 0x2039, 0x89: 0x203a, 0x8a: 0x2212, 0x8b: 0x2030, 0x8c: 0x201e, 0x8d: 0x201c, 0x8e: 0x201d, 0x8f: 0x2018,
  0x90: 0x2019, 0x91: 0x201a, 0x92: 0x2122, 0x93: 0xfb01, 0x94: 0xfb02, 0x95: 0x0141, 0x96: 0x0152, 0x97: 0x0160,
  0x98: 0x0178, 0x99: 0x017d, 0x9a: 0x0131, 0x9b: 0x0142, 0x9c: 0x0153, 0x9d: 0x0161, 0x9e: 0x017e, 0xa0: 0x20ac,
};

export function utf16be(b: Uint8Array, s = 0): string {
  let out = '';
  for (let i = s; i + 1 < b.length; i += 2) out += String.fromCharCode((b[i] << 8) | b[i + 1]);
  return out;
}

function tryDecode(label: string, b: Uint8Array): string | null {
  try { return new TextDecoder(label, { fatal: true }).decode(b); } catch { return null; }
}

/** 책갈피·문서 정보의 글자열 — UTF-16BE(BOM) · UTF-8(BOM) · (한국어 PDF 의) EUC-KR · PDFDocEncoding */
export function decodeTextString(b: Uint8Array): string {
  if (b[0] === 0xfe && b[1] === 0xff) return utf16be(b, 2);
  if (b[0] === 0xff && b[1] === 0xfe) { let o = ''; for (let i = 2; i + 1 < b.length; i += 2) o += String.fromCharCode(b[i] | (b[i + 1] << 8)); return o; }
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return tryDecode('utf-8', b.subarray(3)) ?? latin1(b, 3);
  if (b.some((x) => x >= 0x80)) {
    const u8 = tryDecode('utf-8', b);
    if (u8 && /[\u3131-\uD7A3]/.test(u8)) return u8;
    const kr = tryDecode('euc-kr', b);
    if (kr && /[\uAC00-\uD7A3]/.test(kr)) return kr;
  }
  let out = '';
  for (const c of b) out += String.fromCharCode(PDFDOC_HIGH[c] ?? c);
  return out;
}

// ── 글꼴 ─────────────────────────────────────────────────────────────

/** WinAnsi 의 32~255 글리프 이름 — 인코딩이자 글리프 이름 → 유니코드 표 */
const WIN_NAMES = ('space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash ' +
  'zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z ' +
  'bracketleft backslash bracketright asciicircum underscore grave a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde bullet ' +
  'Euro bullet quotesinglbase florin quotedblbase ellipsis dagger daggerdbl circumflex perthousand Scaron guilsinglleft OE bullet Zcaron bullet ' +
  'bullet quoteleft quoteright quotedblleft quotedblright bullet endash emdash tilde trademark scaron guilsinglright oe bullet zcaron Ydieresis ' +
  'space exclamdown cent sterling currency yen brokenbar section dieresis copyright ordfeminine guillemotleft logicalnot hyphen registered macron ' +
  'degree plusminus twosuperior threesuperior acute mu paragraph periodcentered cedilla onesuperior ordmasculine guillemotright onequarter onehalf threequarters questiondown ' +
  'Agrave Aacute Acircumflex Atilde Adieresis Aring AE Ccedilla Egrave Eacute Ecircumflex Edieresis Igrave Iacute Icircumflex Idieresis ' +
  'Eth Ntilde Ograve Oacute Ocircumflex Otilde Odieresis multiply Oslash Ugrave Uacute Ucircumflex Udieresis Yacute Thorn germandbls ' +
  'agrave aacute acircumflex atilde adieresis aring ae ccedilla egrave eacute ecircumflex edieresis igrave iacute icircumflex idieresis ' +
  'eth ntilde ograve oacute ocircumflex otilde odieresis divide oslash ugrave uacute ucircumflex udieresis yacute thorn ydieresis').split(' ');
const WIN_HIGH_UNI = [0x20ac, 0x2022, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x2022, 0x017d, 0x2022,
  0x2022, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x2022, 0x017e, 0x0178];

const GLYPH_UNI = new Map<string, string>();
WIN_NAMES.forEach((n, i) => {
  const code = i + 32;
  const u = code === 127 ? 0x2022 : code >= 128 && code < 160 ? WIN_HIGH_UNI[code - 128] : code;
  if (!GLYPH_UNI.has(n)) GLYPH_UNI.set(n, String.fromCharCode(u));
});
for (const [n, u] of Object.entries({
  fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', minus: '−', dotlessi: 'ı', dotlessj: 'ȷ', fraction: '⁄', lslash: 'ł', Lslash: 'Ł',
  breve: '˘', dotaccent: '˙', ring: '˚', hungarumlaut: '˝', ogonek: '˛', caron: 'ˇ', quoteright: '’', quoteleft: '‘', nbspace: ' ',
  bullet: '•', periodcentered: '·', middot: '·', angleleft: '〈', angleright: '〉', arrowright: '→', arrowleft: '←', arrowup: '↑', arrowdown: '↓',
  lessequal: '≤', greaterequal: '≥', notequal: '≠', approxequal: '≈', infinity: '∞', summation: '∑', product: '∏', radical: '√', integral: '∫',
  partialdiff: '∂', element: '∈', Delta: 'Δ', Omega: 'Ω', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ',
  mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', visiblespace: '␣', emptyset: '∅', checkmark: '✓',
})) GLYPH_UNI.set(n, u);

/** 글리프 이름 → 글자 (`uni4E00` · `u1F600` · `a.sc` · `f_f_i`) */
export function glyphToUnicode(nm: string): string | null {
  if (GLYPH_UNI.has(nm)) return GLYPH_UNI.get(nm) as string;
  const base = nm.split('.')[0];
  if (base !== nm && base) return glyphToUnicode(base);
  if (base.includes('_')) { const parts = base.split('_').map(glyphToUnicode); return parts.every((p) => p) ? parts.join('') : null; }
  let m = /^uni([0-9A-Fa-f]{4,})$/.exec(base);
  if (m) { let o = ''; for (let i = 0; i + 4 <= m[1].length; i += 4) o += String.fromCharCode(parseInt(m[1].slice(i, i + 4), 16)); return o; }
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(base);
  if (m) return String.fromCodePoint(parseInt(m[1], 16));
  return null;
}

const MAC_HIGH = ('Adieresis Aring Ccedilla Eacute Ntilde Odieresis Udieresis aacute agrave acircumflex adieresis atilde aring ccedilla eacute egrave ' +
  'ecircumflex edieresis iacute igrave icircumflex idieresis ntilde oacute ograve ocircumflex odieresis otilde uacute ugrave ucircumflex udieresis ' +
  'dagger degree cent sterling section bullet paragraph germandbls registered copyright trademark acute dieresis notequal AE Oslash ' +
  'infinity plusminus lessequal greaterequal yen mu partialdiff summation product pi integral ordfeminine ordmasculine Omega ae oslash ' +
  'questiondown exclamdown logicalnot radical florin approxequal Delta guillemotleft guillemotright ellipsis space Agrave Atilde Otilde OE oe ' +
  'endash emdash quotedblleft quotedblright quoteleft quoteright divide lozenge ydieresis Ydieresis fraction currency guilsinglleft guilsinglright fi fl ' +
  'daggerdbl periodcentered quotesinglbase quotedblbase perthousand Acircumflex Ecircumflex Aacute Edieresis Egrave Iacute Icircumflex Idieresis Igrave Oacute Ocircumflex ' +
  'apple Ograve Uacute Ucircumflex Ugrave dotlessi circumflex tilde macron breve dotaccent ring cedilla hungarumlaut ogonek caron').split(' ');

function baseEncoding(n: string | undefined): (string | null)[] {
  const enc: (string | null)[] = new Array(256).fill(null);
  for (let c = 32; c < 127; c++) enc[c] = WIN_NAMES[c - 32];
  if (n === 'MacRomanEncoding') MAC_HIGH.forEach((g, i) => { enc[128 + i] = g; });
  else if (n === 'StandardEncoding') {
    enc[0x27] = 'quoteright'; enc[0x60] = 'quoteleft';
    const std: Record<number, string> = { 0xa1: 'exclamdown', 0xa2: 'cent', 0xa3: 'sterling', 0xa4: 'fraction', 0xa5: 'yen', 0xa6: 'florin', 0xa7: 'section',
      0xa8: 'currency', 0xa9: 'quotesingle', 0xaa: 'quotedblleft', 0xab: 'guillemotleft', 0xac: 'guilsinglleft', 0xad: 'guilsinglright', 0xae: 'fi', 0xaf: 'fl',
      0xb1: 'endash', 0xb2: 'dagger', 0xb3: 'daggerdbl', 0xb4: 'periodcentered', 0xb6: 'paragraph', 0xb7: 'bullet', 0xb8: 'quotesinglbase', 0xb9: 'quotedblbase',
      0xba: 'quotedblright', 0xbb: 'guillemotright', 0xbc: 'ellipsis', 0xbd: 'perthousand', 0xbf: 'questiondown', 0xc1: 'grave', 0xc2: 'acute', 0xc3: 'circumflex',
      0xc4: 'tilde', 0xc5: 'macron', 0xc6: 'breve', 0xc7: 'dotaccent', 0xc8: 'dieresis', 0xca: 'ring', 0xcb: 'cedilla', 0xcd: 'hungarumlaut', 0xce: 'ogonek',
      0xcf: 'caron', 0xd0: 'emdash', 0xe1: 'AE', 0xe3: 'ordfeminine', 0xe8: 'Lslash', 0xe9: 'Oslash', 0xea: 'OE', 0xeb: 'ordmasculine', 0xf1: 'ae', 0xf5: 'dotlessi',
      0xf8: 'lslash', 0xf9: 'oslash', 0xfa: 'oe', 0xfb: 'germandbls' };
    for (const [k, v] of Object.entries(std)) enc[Number(k)] = v;
  } else {
    for (let c = 127; c < 256; c++) enc[c] = WIN_NAMES[c - 32];
  }
  return enc;
}

interface CodeRange { len: number; lo: number; hi: number }

/** CMap 스트림(ToUnicode 또는 내장 인코딩) 읽기 */
export function parseCMap(data: Uint8Array): { ranges: CodeRange[]; uni: Map<number, string>; cid: Map<number, number> } {
  const lx = new Lexer(data);
  const ranges: CodeRange[] = [];
  const uni = new Map<number, string>();
  const cid = new Map<number, number>();
  const toNum = (s: PStr) => s.bytes.reduce((a, b) => a * 256 + b, 0);
  const dst = (s: PStr) => (s.bytes.length >= 2 ? utf16be(s.bytes) : String.fromCharCode(...s.bytes));
  const ops: PObj[] = [];
  for (;;) {
    const t = lx.obj(false);
    if (t === undefined) break;
    if (!(t instanceof POp)) { ops.push(t); if (ops.length > 3000) ops.splice(0, 1000); continue; }
    const op = t.op;
    const collect = (endOp: string): PObj[] => {
      const items: PObj[] = [];
      for (;;) {
        const v = lx.obj(false);
        if (v === undefined || (v instanceof POp && v.op === endOp)) break;
        if (!(v instanceof POp)) items.push(v);
      }
      return items;
    };
    if (op === 'begincodespacerange') {
      const it = collect('endcodespacerange');
      for (let i = 0; i + 1 < it.length; i += 2) {
        const a = it[i], b = it[i + 1];
        if (a instanceof PStr && b instanceof PStr) ranges.push({ len: a.bytes.length, lo: toNum(a), hi: toNum(b) });
      }
    } else if (op === 'beginbfchar') {
      const it = collect('endbfchar');
      for (let i = 0; i + 1 < it.length; i += 2) {
        const a = it[i], b = it[i + 1];
        if (a instanceof PStr) uni.set(key(a.bytes.length, toNum(a)), b instanceof PStr ? dst(b) : b instanceof PName ? glyphToUnicode(b.name) ?? '' : '');
      }
    } else if (op === 'beginbfrange') {
      const it = collect('endbfrange');
      for (let i = 0; i + 2 < it.length; i += 3) {
        const a = it[i], b = it[i + 1], d = it[i + 2];
        if (!(a instanceof PStr) || !(b instanceof PStr)) continue;
        const lo = toNum(a), hi = Math.min(toNum(b), lo + 65535), len = a.bytes.length;
        if (Array.isArray(d)) d.forEach((x, k) => { if (x instanceof PStr && lo + k <= hi) uni.set(key(len, lo + k), dst(x)); });
        else if (d instanceof PStr) {
          const base = d.bytes.length >= 2 ? utf16be(d.bytes) : String.fromCharCode(...d.bytes);
          const head = base.slice(0, -1), last = base.charCodeAt(base.length - 1);
          for (let c = lo; c <= hi; c++) uni.set(key(len, c), head + String.fromCharCode(last + (c - lo)));
        }
      }
    } else if (op === 'begincidchar') {
      const it = collect('endcidchar');
      for (let i = 0; i + 1 < it.length; i += 2) { const a = it[i], b = it[i + 1]; if (a instanceof PStr && typeof b === 'number') cid.set(key(a.bytes.length, toNum(a)), b); }
    } else if (op === 'begincidrange') {
      const it = collect('endcidrange');
      for (let i = 0; i + 2 < it.length; i += 3) {
        const a = it[i], b = it[i + 1], c = it[i + 2];
        if (a instanceof PStr && b instanceof PStr && typeof c === 'number') for (let x = toNum(a), e = Math.min(toNum(b), x + 65535); x <= e; x++) cid.set(key(a.bytes.length, x), c + (x - toNum(a)));
      }
    }
  }
  return { ranges, uni, cid };
}

function key(len: number, code: number): number { return len * 0x100000000 + code; }

export interface FontInfo {
  /** 글자열 바이트 → 글자 코드들 (각각 글자·폭·바이트 수) */
  decode(b: Uint8Array): { text: string; w: number; single32: boolean; known: boolean }[];
  bold: boolean;
  name: string;
}

/**
 * 기호 글꼴(Wingdings·Symbol)의 글자 — ToUnicode 가 'n'·'§'·'Ÿ' 처럼 **글자 코드 그대로**를 주는 일이 많다
 * (워드·한글의 글머리표). 그 코드가 실제로 그리는 기호로 바꾼다 — 원문에 보이는 그대로 담으려고.
 */
const WINGDINGS: Record<number, string> = {
  0x6c: '●', 0x6d: '❍', 0x6e: '■', 0x6f: '□', 0x70: '◻', 0x71: '❑', 0x72: '❒', 0x73: '⬧', 0x74: '⧫', 0x75: '◆', 0x76: '❖', 0x77: '⬥',
  0x9e: '·', 0x9f: '•', 0xa1: '○', 0xa2: '⭕', 0xa7: '▪', 0xa8: '◻', 0xd8: '➢', 0xe0: '→', 0xe8: '➔', 0xef: '⇦', 0xf0: '⇨', 0xfb: '✗', 0xfc: '✓', 0xfe: '☑', 0xfd: '☒',
  0x46: '☞', 0x4a: '☺', 0x4c: '☹', 0x51: '✈', 0xa4: '◉', 0xae: '◾', 0x6b: '&',
};
const SYMBOL: Record<number, string> = {
  0x61: 'α', 0x62: 'β', 0x63: 'χ', 0x64: 'δ', 0x65: 'ε', 0x66: 'φ', 0x67: 'γ', 0x68: 'η', 0x69: 'ι', 0x6b: 'κ', 0x6c: 'λ', 0x6d: 'μ', 0x6e: 'ν',
  0x70: 'π', 0x71: 'θ', 0x72: 'ρ', 0x73: 'σ', 0x74: 'τ', 0x75: 'υ', 0x77: 'ω', 0x78: 'ξ', 0x79: 'ψ', 0x7a: 'ζ', 0x44: 'Δ', 0x46: 'Φ', 0x47: 'Γ',
  0x4c: 'Λ', 0x50: 'Π', 0x51: 'Θ', 0x53: 'Σ', 0x57: 'Ω', 0x59: 'Ψ', 0xb7: '•', 0xae: '→', 0xac: '←', 0xad: '↑', 0xaf: '↓', 0xb3: '≥', 0xa3: '≤',
  0xb9: '≠', 0xb1: '±', 0xb4: '×', 0xb8: '÷', 0xa5: '∞', 0xd6: '√', 0xe5: '∑', 0xf2: '∫', 0xbb: '≈', 0xce: '∈', 0xc6: '∅', 0xd7: '·', 0x2d: '−',
};
function symbolMapper(baseFont: string): ((s: string) => string) | null {
  const table = /wingding/i.test(baseFont) ? WINGDINGS : /symbol/i.test(baseFont) ? SYMBOL : null;
  if (!table) return null;
  return (s) => Array.from(s, (ch) => {
    let c = ch.charCodeAt(0);
    if (c >= 0xf020 && c <= 0xf0ff) c -= 0xf000; // 워드의 기호 글꼴 개인 영역
    return table[c] ?? ch;
  }).join('');
}

const FONT_CACHE = new WeakMap<PDict, FontInfo>();

export function loadFont(doc: PdfDoc, fd: PDict | null): FontInfo {
  if (!fd) return { decode: (b) => Array.from(b, (c) => ({ text: String.fromCharCode(c), w: 0.5, single32: c === 32, known: true })), bold: false, name: '' };
  const hit = FONT_CACHE.get(fd);
  if (hit) return hit;
  const sub = name(doc.resolve(fd.get('Subtype')));
  const baseFont = name(doc.resolve(fd.get('BaseFont'))) ?? '';
  const bold = /bold|black|heavy|semibold|demi|extrab|-b$|,b/i.test(baseFont);
  let toUni: ReturnType<typeof parseCMap> | null = null;
  const tu = doc.resolve(fd.get('ToUnicode'));
  if (tu instanceof PStream) { try { toUni = parseCMap(doc.stream(tu)); } catch { toUni = null; } }

  let info: FontInfo;
  if (sub === 'Type0') {
    const encObj = doc.resolve(fd.get('Encoding'));
    const encName = name(encObj) ?? '';
    let encCMap: ReturnType<typeof parseCMap> | null = null;
    if (encObj instanceof PStream) { try { encCMap = parseCMap(doc.stream(encObj)); } catch { encCMap = null; } }
    const desc = doc.dict(doc.arr(fd.get('DescendantFonts'))?.[0]);
    const dw = num(doc.resolve(desc?.get('DW'))) ?? 1000;
    const widths = new Map<number, number>();
    const W = doc.arr(desc?.get('W')) ?? [];
    for (let i = 0; i < W.length;) {
      const a = num(doc.resolve(W[i]));
      const b = doc.resolve(W[i + 1]);
      if (a === undefined) { i++; continue; }
      if (Array.isArray(b)) { b.forEach((w, k) => widths.set(a + k, num(doc.resolve(w)) ?? dw)); i += 2; }
      else { const last = num(b) ?? a, w = num(doc.resolve(W[i + 2])) ?? dw; for (let c = a; c <= Math.min(last, a + 65535); c++) widths.set(c, w); i += 3; }
    }
    const ranges = (encCMap?.ranges.length ? encCMap.ranges : toUni?.ranges.length ? toUni.ranges : null);
    const isUcs2 = /UCS2|UTF16/i.test(encName);
    const isKr = /KSC|UHC|KSCms|KSCpc/i.test(encName);
    const krDec = isKr ? (() => { try { return new TextDecoder('euc-kr'); } catch { return null; } })() : null;
    info = {
      bold, name: baseFont,
      decode(b) {
        const out: { text: string; w: number; single32: boolean; known: boolean }[] = [];
        for (let i = 0; i < b.length;) {
          let len = 2;
          if (ranges) len = codeLen(b, i, ranges);
          else if (isKr) len = b[i] < 0x80 ? 1 : 2;
          if (i + len > b.length) len = b.length - i;
          let code = 0;
          for (let k = 0; k < len; k++) code = code * 256 + b[i + k];
          const cidv = encCMap?.cid.get(key(len, code)) ?? code;
          let text: string | undefined = toUni?.uni.get(key(len, code));
          if (text === undefined && toUni && len !== 2) text = toUni.uni.get(key(2, code));
          if (text === undefined) {
            if (isUcs2) text = String.fromCharCode(code);
            else if (isKr && krDec) text = len === 1 ? String.fromCharCode(code) : krDec.decode(b.subarray(i, i + len));
          }
          out.push({ text: text ?? '', w: (widths.get(isKr || isUcs2 ? -1 : cidv) ?? dw) / 1000, single32: len === 1 && code === 32, known: text !== undefined });
          i += len;
        }
        return out;
      },
    };
  } else {
    const fm = doc.arr(fd.get('FontMatrix'));
    const scale = sub === 'Type3' && fm ? (num(doc.resolve(fm[0])) ?? 0.001) : 0.001;
    const first = num(doc.resolve(fd.get('FirstChar'))) ?? 0;
    const wArr = (doc.arr(fd.get('Widths')) ?? []).map((x) => num(doc.resolve(x)) ?? 0);
    const missing = num(doc.resolve(doc.dict(fd.get('FontDescriptor'))?.get('MissingWidth'))) ?? 0;
    const encObj = doc.resolve(fd.get('Encoding'));
    const encDict = encObj instanceof Map ? encObj : null;
    const flags = num(doc.resolve(doc.dict(fd.get('FontDescriptor'))?.get('Flags'))) ?? 0;
    const symbolic = (flags & 4) !== 0 && !(encObj instanceof PName) && !encDict;
    const enc = baseEncoding(name(encObj) ?? name(doc.resolve(encDict?.get('BaseEncoding'))) ?? (sub === 'TrueType' ? 'WinAnsiEncoding' : 'StandardEncoding'));
    const diff = doc.arr(encDict?.get('Differences'));
    if (diff) { let c = 0; for (const x of diff) { const v = doc.resolve(x); if (typeof v === 'number') c = v; else if (v instanceof PName) enc[c++ & 255] = v.name; } }
    info = {
      bold, name: baseFont,
      decode(b) {
        return Array.from(b, (c) => {
          let text: string | undefined = toUni?.uni.get(key(1, c));
          if (text === undefined && !symbolic) { const g = enc[c]; text = g ? glyphToUnicode(g) ?? undefined : undefined; }
          if (text === undefined && symbolic && c >= 32 && c < 127) text = String.fromCharCode(c);
          const wRaw = c >= first && c - first < wArr.length ? wArr[c - first] : missing || (sub === 'Type3' ? 0 : 500);
          return { text: text ?? '', w: wRaw * scale, single32: c === 32, known: text !== undefined };
        });
      },
    };
  }
  const sym = symbolMapper(baseFont);
  if (sym) { const inner = info.decode; info = { ...info, decode: (b) => inner(b).map((g) => ({ ...g, text: sym(g.text) })) }; }
  FONT_CACHE.set(fd, info);
  return info;
}

function codeLen(b: Uint8Array, i: number, ranges: CodeRange[]): number {
  for (let len = 1; len <= 4; len++) {
    if (i + len > b.length) break;
    let code = 0;
    for (let k = 0; k < len; k++) code = code * 256 + b[i + k];
    if (ranges.some((r) => r.len === len && code >= r.lo && code <= r.hi)) return len;
  }
  const lens = ranges.map((r) => r.len);
  return lens.length ? Math.min(...lens) : 1;
}

// ── 내용 스트림 → 글자 조각 ──────────────────────────────────────────

/** 같은 글꼴·크기·기준선으로 한 번에 그려진 글자 조각 (쪽 좌표, y 는 위로 큼) */
export interface Run { x0: number; x1: number; y: number; size: number; text: string; bold: boolean; rot: boolean }

export interface PageText {
  width: number; height: number; runs: Run[]; unknownGlyphs: number; /** 그린 글자열 바이트 — 상한 셈 */ showBytes?: number;
  /** 그린 그림(이미지 XObject) — 쪽 좌표의 상자. 꺼내기는 `pdf-image.ts` (2026-10-17) */
  draws?: ImageDraw[];
}

/** 쪽에 그린 그림 하나 — 단위 정사각형을 그때의 CTM 으로 옮긴 상자(쪽 좌표, y 는 위로 큼) */
export interface ImageDraw { x0: number; y0: number; x1: number; y1: number; s: PStream }
/** 쪽 하나에서 기록하는 그림 상한 — 무늬처럼 같은 그림을 수천 번 찍는 PDF 방어 */
const MAX_DRAWS_PAGE = 500;

type Mat = [number, number, number, number, number, number];
const IDENT: Mat = [1, 0, 0, 1, 0, 0];
function mul(m1: Mat, m2: Mat): Mat {
  return [
    m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

/**
 * 그래픽 상태 `q` 깊이 상한 — 실제 문서는 수십을 넘지 않는다. 넘으면 PDF 를 거절한다: 넘친 상태를 버리면
 * 그 `Q` 뒤 좌표가 틀어지고, 다 붙들면 짝 없는 `q` 수백만 개가 메모리를 채운다 (#642 Codex 두 차례)
 */
const MAX_GSTATE_DEPTH = 1024;
/** 글자 조각(Tj 한 번) 수 상한 — 쪽 하나 · 문서 전체. 압축된 `(a) Tj` 되풀이가 메모리를 채우지 않게 (#642 Codex) */
export const MAX_RUNS_PAGE = 100_000;
export const MAX_RUNS_DOC = 1_500_000;
/** 그리는 글자열 바이트 상한 — 쪽 하나 · 문서 전체 (실제 문서는 쪽당 수십 KB) */
export const MAX_SHOW_BYTES_PAGE = 2_000_000;
export const MAX_SHOW_BYTES_DOC = 30_000_000;

interface GState { ctm: Mat; font: FontInfo | null; size: number; tc: number; tw: number; th: number; tl: number; rise: number }

/** 쪽 하나의 글자 조각들 */
export function pageText(doc: PdfDoc, page: PageRef): PageText {
  const [bx0, by0, bx1, by1] = page.box;
  const w = Math.abs(bx1 - bx0) || 612, h = Math.abs(by1 - by0) || 792;
  // /Rotate — 보이는 대로(시계 방향) 돌려 둔다. 돌린 쪽은 글자 행렬을 거꾸로 돌려 그리므로, 이것을 빼면
  // 화면에선 가로인 글이 '돌아간 글씨' 로 쪽 끝에 몰리고 줄로 묶이지 않는다 (#642 Codex)
  const r = ((Math.round((page.rotate ?? 0) / 90) * 90) % 360 + 360) % 360;
  const rot: Mat = r === 90 ? [0, -1, 1, 0, 0, w] : r === 180 ? [-1, 0, 0, -1, w, h] : r === 270 ? [0, 1, -1, 0, h, 0] : IDENT;
  const out: PageText = { width: r % 180 ? h : w, height: r % 180 ? w : h, runs: [], unknownGlyphs: 0 };
  const origin: Mat = mul([1, 0, 0, 1, -Math.min(bx0, bx1), -Math.min(by0, by1)], rot);
  run(doc, doc.contents(page.dict), page.resources, { ctm: origin, font: null, size: 12, tc: 0, tw: 0, th: 1, tl: 0, rise: 0 }, out, 0, new Set());
  return out;
}

/** `gs0` — 시작 그래픽 상태. Form XObject 는 `Do` 때의 상태(글꼴·크기 등)를 물려받는다 (#642 Codex) */
function run(doc: PdfDoc, data: Uint8Array, res: PDict | null, gs0: GState, out: PageText, depth: number, forms: Set<PStream>): void {
  const fonts = doc.dict(res?.get('Font'));
  const xobjs = doc.dict(res?.get('XObject'));
  let gs: GState = { ...gs0 };
  const stack: GState[] = [];
  let tm: Mat = IDENT, tlm: Mat = IDENT;
  const lx = new Lexer(data);
  const ops: (PObj)[] = [];

  const show = (s: PStr) => {
    const f = gs.font;
    if (!f) return;
    // 글자 하나하나를 객체로 만들기 전에 바이트로 센다 — 압축된 수 MB 짜리 (aaaa…) Tj 한 번이 메모리를 채우지 않게 (#642 Codex)
    doc.showBytes += s.bytes.length;
    out.showBytes = (out.showBytes ?? 0) + s.bytes.length;
    if (out.showBytes > MAX_SHOW_BYTES_PAGE) throw doc.fail(`한 쪽의 글자가 ${MAX_SHOW_BYTES_PAGE.toLocaleString('en-US')}바이트를 넘습니다 — 깨졌거나 악의적인 PDF 로 보여 읽지 않습니다.`);
    if (doc.showBytes > MAX_SHOW_BYTES_DOC) throw doc.fail(`글자가 ${MAX_SHOW_BYTES_DOC.toLocaleString('en-US')}바이트를 넘습니다 — pages 로 나눠 주세요(예: "1-100").`);
    const glyphs = f.decode(s.bytes);
    const start = mul(mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], tm), gs.ctm);
    let text = '';
    for (const g of glyphs) {
      text += g.text;
      if (!g.known) out.unknownGlyphs++;
      const tx = (g.w * gs.size + gs.tc + (g.single32 ? gs.tw : 0)) * gs.th;
      tm = mul([1, 0, 0, 1, tx, 0], tm);
    }
    const end = mul(mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], tm), gs.ctm);
    if (!text) return;
    const size = Math.hypot(start[2], start[3]);
    const rot = Math.abs(start[1]) > 0.1 * Math.abs(start[0]) + 1e-6;
    if (out.runs.length >= MAX_RUNS_PAGE) throw doc.fail(`한 쪽의 글자 조각이 ${MAX_RUNS_PAGE.toLocaleString('en-US')}개를 넘습니다 — 깨졌거나 악의적인 PDF 로 보여 읽지 않습니다.`);
    if (++doc.runCount > MAX_RUNS_DOC) throw doc.fail(`글자 조각이 ${MAX_RUNS_DOC.toLocaleString('en-US')}개를 넘습니다 — pages 로 나눠 주세요(예: "1-100").`);
    out.runs.push({ x0: start[4], x1: end[4], y: start[5], size, text, bold: f.bold, rot });
  };

  for (let guard = 0; guard < 5_000_000; guard++) {
    const t = lx.obj(false);
    if (t === undefined) break;
    if (!(t instanceof POp)) { ops.push(t); if (ops.length > 64) ops.shift(); continue; }
    const a = ops;
    const n = (i: number) => (typeof a[a.length - i] === 'number' ? (a[a.length - i] as number) : 0);
    switch (t.op) {
      // q 를 짝 없이 수백만 번 늘어놓은 스트림이 상태 사본으로 메모리를 채우지 않게 깊이를 묶는다 (#642 Codex).
      // 넘친 q 는 세기만 하고, 그만큼의 Q 는 아무것도 꺼내지 않는다 — 짝이 맞는 문서는 그대로다
      case 'q':
        if (stack.length >= MAX_GSTATE_DEPTH) throw doc.fail(`그래픽 상태(q)가 ${MAX_GSTATE_DEPTH}단을 넘게 겹쳐 있습니다 — 깨졌거나 악의적인 PDF 로 보여 읽지 않습니다.`);
        stack.push({ ...gs }); break;
      case 'Q': gs = stack.pop() ?? gs; break;
      case 'cm': gs.ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], gs.ctm); break;
      case 'BT': tm = IDENT; tlm = IDENT; break;
      case 'Tf': {
        const fn = a[a.length - 2];
        gs.size = n(1);
        gs.font = loadFont(doc, fn instanceof PName ? doc.dict(fonts?.get(fn.name)) : null);
        break;
      }
      case 'Tc': gs.tc = n(1); break;
      case 'Tw': gs.tw = n(1); break;
      case 'Tz': gs.th = n(1) / 100; break;
      case 'TL': gs.tl = n(1); break;
      case 'Ts': gs.rise = n(1); break;
      case 'Td': tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); tm = tlm; break;
      case 'TD': gs.tl = -n(1); tlm = mul([1, 0, 0, 1, n(2), n(1)], tlm); tm = tlm; break;
      case 'Tm': tlm = [n(6), n(5), n(4), n(3), n(2), n(1)]; tm = tlm; break;
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); tm = tlm; break;
      case 'Tj': { const s = a[a.length - 1]; if (s instanceof PStr) show(s); break; }
      case "'": { tlm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); tm = tlm; const s = a[a.length - 1]; if (s instanceof PStr) show(s); break; }
      case '"': { gs.tw = n(3); gs.tc = n(2); tlm = mul([1, 0, 0, 1, 0, -gs.tl], tlm); tm = tlm; const s = a[a.length - 1]; if (s instanceof PStr) show(s); break; }
      case 'TJ': {
        const arr = a[a.length - 1];
        if (Array.isArray(arr)) for (const el of arr) {
          if (el instanceof PStr) show(el);
          else if (typeof el === 'number') tm = mul([1, 0, 0, 1, (-el / 1000) * gs.size * gs.th, 0], tm);
        }
        break;
      }
      case 'Do': {
        const nm = a[a.length - 1];
        const xo = nm instanceof PName ? doc.resolve(xobjs?.get(nm.name)) : null;
        if (xo instanceof PStream && name(xo.dict.get('Subtype')) === 'Image' && doc.resolve(xo.dict.get('ImageMask')) !== true) {
          // 그림 — 글로 옮기지 않고 자리만 적어 둔다(꺼내기는 pdf-image.ts). 단위 정사각형의 네 모서리를 옮긴다
          const [a0, b0, c0, d0, e0, f0] = gs.ctm;
          const xs = [e0, a0 + e0, c0 + e0, a0 + c0 + e0], ys = [f0, b0 + f0, d0 + f0, b0 + d0 + f0];
          const draws = (out.draws ??= []);
          if (draws.length < MAX_DRAWS_PAGE) draws.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), s: xo });
        } else if (xo instanceof PStream && name(xo.dict.get('Subtype')) === 'Form' && depth < 10 && !forms.has(xo)) {
          const m = (doc.arr(xo.dict.get('Matrix')) ?? IDENT).map((x) => num(doc.resolve(x)) ?? 0) as Mat;
          forms.add(xo);
          try { run(doc, doc.stream(xo), doc.dict(xo.dict.get('Resources')) ?? res, { ...gs, ctm: mul(m.length === 6 ? m : IDENT, gs.ctm) }, out, depth + 1, forms); } catch { /* 깨진 폼은 건너뛴다 */ }
          forms.delete(xo);
        }
        break;
      }
      case 'BI': { // 인라인 그림 — ID 다음 바이너리를 EI 까지 건너뛴다
        for (;;) { const k = lx.obj(false); if (k === undefined || (k instanceof POp && k.op === 'ID')) break; }
        const b = lx.b;
        let p = lx.p + 1;
        while (p + 2 < b.length && !(b[p] === 69 && b[p + 1] === 73 && WS[b[p - 1]] && (WS[b[p + 2]] || p + 2 === b.length))) p++;
        lx.p = p + 2;
        break;
      }
      default: break;
    }
    ops.length = 0;
  }
}

/** 쪽 범위 글 → 번호 집합 (1부터). "1-20,25" · "3" · "10-" */
export function parsePageRange(s: string, max: number): Set<number> | null {
  const t = String(s ?? '').replace(/\s+/g, '');
  if (!t) return null;
  const out = new Set<number>();
  for (const part of t.split(',')) {
    const m = /^(\d+)(?:-(\d*))?$/.exec(part);
    if (!m) throw new PdfError(`쪽 범위를 알아보지 못했습니다: "${part}" — "1-20,25" 꼴로 적어 주세요.`);
    const a = Number(m[1]), b = m[2] === undefined ? a : m[2] === '' ? max : Number(m[2]);
    for (let p = Math.max(1, a); p <= Math.min(max, b); p++) out.add(p);
  }
  if (!out.size) throw new PdfError(`쪽 범위 "${s}" 에 해당하는 쪽이 없습니다 (이 PDF 는 ${max}쪽).`);
  return out;
}

/** PDF 전체 읽기 — 쪽마다 글자 조각 + 책갈피 + 문서 제목. `maxPages` 를 넘으면 쪽 범위를 달라고 거절한다 */
export function readPdf(bytes: Uint8Array, opts: { pages?: string; maxPages?: number } = {}): {
  title: string; pageCount: number; pages: (PageText & { index: number })[]; outline: OutlineItem[];
  /** 그림을 꺼낼 때 쓴다(`pdf-image.ts` 의 `extractPdfImages`) */
  doc: PdfDoc;
} {
  const doc = new PdfDoc(bytes);
  const list = doc.pages();
  if (!list.length) throw new PdfError('PDF 에서 쪽을 찾지 못했습니다(깨진 파일일 수 있습니다).');
  const want = parsePageRange(opts.pages ?? '', list.length);
  const cap = opts.maxPages ?? Infinity;
  if ((want ? want.size : list.length) > cap) {
    throw new PdfError(`PDF 가 ${list.length}쪽이라 한 번에 맵으로 만들기에 너무 큽니다(한 번에 ${cap}쪽까지) — pages 로 나눠 주세요(예: "1-${cap}").`);
  }
  const byRef = new Map<number, number>();
  list.forEach((p, i) => { if (p.ref !== null) byRef.set(p.ref, i); });
  const pages: (PageText & { index: number })[] = [];
  list.forEach((p, i) => {
    if (want && !want.has(i + 1)) return;
    let pt: PageText;
    try { pt = pageText(doc, p); } catch { pt = { width: 612, height: 792, runs: [], unknownGlyphs: 0 }; }
    if (doc.overBudget) throw TOO_BIG(); // 깨진 조각처럼 삼켜졌어도 — 조용히 글을 빼먹지 않는다
    if (doc.fatal) throw doc.fatal;
    pages.push({ ...pt, index: i });
  });
  let outline: OutlineItem[] = [];
  try { outline = doc.outline(byRef); } catch { outline = []; }
  return { title: doc.title, pageCount: list.length, pages, outline, doc };
}
