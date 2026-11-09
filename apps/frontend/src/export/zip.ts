// File: src/export/zip.ts
// Minimal dependency-free ZIP writer (STORE method, no compression) used by
// the HTML export to package "맵.html + files/첨부파일" into one download.
// Browsers cannot write into a folder on the user's disk, so we ship a .zip
// whose unzipped layout IS the requested structure:
//   맵제목/
//     맵제목.html      ← references attachments via ./files/... relative links
//     files/…          ← packaged attachment binaries
// STORE (no deflate) keeps this ~80 lines with zero dependencies; attachments
// are usually already-compressed media, so deflate would gain little.

export interface ZipEntry {
  // Forward slashes as separators; folders are implied by the path.
  path: string;
  data: Uint8Array;
}


export const ZIP_MAX_BYTES = 144 * 1024 * 1024;
export const ZIP_MAX_ENTRIES = 4096;

function safeZipPath(path: string): string {
  if (typeof path !== 'string' || !path || path.length > 65535 || /[\\:\x00-\x1f\x7f]/.test(path) || path.startsWith('/') || /%(?:2e|2f|5c|0[0-9a-f]|1[0-9a-f]|7f)/i.test(path)) throw new Error('ZIP에 안전하지 않은 파일 경로가 있습니다.');
  const key = path.endsWith('/') ? path.slice(0, -1) : path;
  if (!key || key.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('ZIP에 안전하지 않은 파일 경로가 있습니다.');
  return key.normalize('NFC');
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// DOS time/date fields for "now" (zip has no timezone; local time is fine).
function dosDateTime(): { time: number; date: number } {
  const d = new Date();
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Builds a complete .zip (STORE method, UTF-8 names) from the given entries.
export function buildZip(entries: ZipEntry[]): Uint8Array {
  if (!Array.isArray(entries) || entries.length > ZIP_MAX_ENTRIES) throw new Error('ZIP 항목 수 한도를 넘었습니다.');
  const seen = new Set<string>();
  let budget = 22;
  for (const entry of entries) {
    const key = safeZipPath(entry.path);
    if (seen.has(key)) throw new Error('ZIP에 중복된 파일 경로가 있습니다.');
    seen.add(key);
    if (!(entry.data instanceof Uint8Array) || (entry.path.endsWith('/') && entry.data.length !== 0)) throw new Error('지원하지 않는 ZIP 항목입니다.');
    const nameSize = new TextEncoder().encode(entry.path).length;
    if (nameSize > 65535) throw new Error('ZIP 파일명이 너무 깁니다.');
    budget += 76 + nameSize * 2 + entry.data.length;
    if (budget > ZIP_MAX_BYTES) throw new Error('ZIP 파일이 144MiB 한도를 넘었습니다.');
  }
  const enc = new TextEncoder();
  const { time, date } = dosDateTime();

  interface Central { name: Uint8Array; crc: number; size: number; offset: number }
  const locals: Uint8Array[] = [];
  const centrals: Central[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = enc.encode(entry.path);
    const crc = crc32(entry.data);
    const header = new Uint8Array(30 + name.length);
    const v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true); // local file header signature
    v.setUint16(4, 20, true); // version needed
    v.setUint16(6, 0x0800, true); // flags: UTF-8 names
    v.setUint16(8, 0, true); // method: STORE
    v.setUint16(10, time, true);
    v.setUint16(12, date, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, entry.data.length, true); // compressed size (= raw)
    v.setUint32(22, entry.data.length, true); // uncompressed size
    v.setUint16(26, name.length, true);
    v.setUint16(28, 0, true); // extra length
    header.set(name, 30);

    locals.push(header, entry.data);
    centrals.push({ name, crc, size: entry.data.length, offset });
    offset += header.length + entry.data.length;
  }

  const centralParts: Uint8Array[] = [];
  let centralSize = 0;
  for (const c of centrals) {
    const rec = new Uint8Array(46 + c.name.length);
    const v = new DataView(rec.buffer);
    v.setUint32(0, 0x02014b50, true); // central directory signature
    v.setUint16(4, 20, true); // version made by
    v.setUint16(6, 20, true); // version needed
    v.setUint16(8, 0x0800, true); // flags: UTF-8
    v.setUint16(10, 0, true); // method: STORE
    v.setUint16(12, time, true);
    v.setUint16(14, date, true);
    v.setUint32(16, c.crc, true);
    v.setUint32(20, c.size, true);
    v.setUint32(24, c.size, true);
    v.setUint16(28, c.name.length, true);
    // extra/comment/disk/attrs stay 0
    v.setUint32(42, c.offset, true);
    rec.set(c.name, 46);
    centralParts.push(rec);
    centralSize += rec.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const part of [...locals, ...centralParts, eocd]) {
    out.set(part, pos);
    pos += part.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ZIP 읽기 — '새 맵 > 불러오기'가 내보낸 ZIP(맵 + files/)을 직접 받기 위한
// 파서. 우리 내보내기(STORE)는 물론, 다른 도구로 다시 압축한 파일(deflate)
// 도 DecompressionStream으로 푼다.
// ---------------------------------------------------------------------------

export async function parseZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const invalid = () => new Error('지원하지 않거나 손상된 ZIP 파일입니다.');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 22 || bytes.byteLength > ZIP_MAX_BYTES) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const need = (off: number, length: number, end = bytes.length): void => { if (!Number.isSafeInteger(off) || !Number.isSafeInteger(length) || off < 0 || length < 0 || off + length > end) throw invalid(); };
  const u16 = (o: number) => { need(o, 2); return view.getUint16(o, true); };
  const u32 = (o: number) => { need(o, 4); return view.getUint32(o, true); };
  let eocd = -1;
  for (let i = bytes.length - 22, end = Math.max(0, bytes.length - 22 - 65535); i >= end; i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) { eocd = i; break; }
  }
  if (eocd < 0 || u16(eocd + 4) !== 0 || u16(eocd + 6) !== 0) throw invalid();
  const count = u16(eocd + 10), centralSize = u32(eocd + 12), centralStart = u32(eocd + 16);
  if (count > ZIP_MAX_ENTRIES || count !== u16(eocd + 8) || centralStart + centralSize !== eocd) throw invalid();
  need(centralStart, centralSize, eocd);
  const dec = new TextDecoder('utf-8', { fatal: true });
  const names = new Set<string>();
  const records: { path: string; method: number; crc: number; size: number; raw: Uint8Array; start: number; end: number; directory: boolean }[] = [];
  let off = centralStart, total = 0;
  for (let k = 0; k < count; k++) {
    need(off, 46, eocd);
    if (u32(off) !== 0x02014b50) throw invalid();
    const flags = u16(off + 8), method = u16(off + 10), crc = u32(off + 16), csize = u32(off + 20), size = u32(off + 24);
    const nl = u16(off + 28), xl = u16(off + 30), cl = u16(off + 32), local = u32(off + 42);
    if ((flags & ~0x080e) !== 0 || (method !== 0 && method !== 8) || u16(off + 34) !== 0 || csize > ZIP_MAX_BYTES || size > ZIP_MAX_BYTES || (method === 0 && csize !== size)) throw invalid();
    need(off + 46, nl + xl + cl, eocd);
    const nameBytes = bytes.subarray(off + 46, off + 46 + nl);
    let path: string;
    try { path = dec.decode(nameBytes); } catch { throw invalid(); }
    const key = safeZipPath(path);
    if (names.has(key)) throw new Error('ZIP에 중복된 파일 경로가 있습니다.');
    names.add(key);
    total += size;
    if (total > ZIP_MAX_BYTES) throw new Error('ZIP 원본 합계가 144MiB 한도를 넘었습니다.');
    const directory = path.endsWith('/');
    if (directory && size !== 0) throw invalid();
    need(local, 30, centralStart);
    if (u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method) throw invalid();
    const lnl = u16(local + 26), lxl = u16(local + 28);
    need(local + 30, lnl + lxl, centralStart);
    if (lnl !== nl || nameBytes.some((b, i) => b !== bytes[local + 30 + i])) throw invalid();
    const dataStart = local + 30 + lnl + lxl;
    need(dataStart, csize, centralStart);
    let localEnd = dataStart + csize;
    if ((flags & 8) === 0) {
      if (u32(local + 14) !== crc || u32(local + 18) !== csize || u32(local + 22) !== size) throw invalid();
    } else {
      // Some writers use a signed data descriptor, others omit the signature.
      const descriptorMatches = (at: number) => at + 12 <= centralStart && u32(at) === crc && u32(at + 4) === csize && u32(at + 8) === size;
      if (localEnd + 16 <= centralStart && u32(localEnd) === 0x08074b50 && descriptorMatches(localEnd + 4)) localEnd += 16;
      else if (descriptorMatches(localEnd)) localEnd += 12;
      else throw invalid();
      // If local fields are present even with a descriptor, they must agree.
      if ((u32(local + 14) !== 0 && u32(local + 14) !== crc) || (u32(local + 18) !== 0 && u32(local + 18) !== csize) || (u32(local + 22) !== 0 && u32(local + 22) !== size)) throw invalid();
    }
    records.push({ path, method, crc, size, raw: bytes.subarray(dataStart, dataStart + csize), start: local, end: localEnd, directory });
    off += 46 + nl + xl + cl;
  }
  if (off !== eocd) throw invalid();
  const ranges = [...records].sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) if (ranges[i].start < ranges[i - 1].end) throw invalid();
  const out: ZipEntry[] = [];
  let decodedTotal = 0;
  for (const rec of records) {
    let data: Uint8Array;
    if (rec.method === 0) data = rec.raw;
    else {
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        reader = new Blob([rec.raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > rec.size || decodedTotal + length > ZIP_MAX_BYTES) { await reader.cancel(); throw new Error('ZIP 압축 해제 크기 한도를 넘었습니다.'); }
          chunks.push(part.value);
        }
        if (length !== rec.size) throw invalid();
        data = new Uint8Array(length);
        let cursor = 0;
        for (const chunk of chunks) { data.set(chunk, cursor); cursor += chunk.length; }
      } catch { throw new Error('ZIP 압축을 안전하게 해제하지 못했습니다. 파일이 손상되었거나 크기 한도를 넘었습니다.'); }
      finally { reader?.releaseLock(); }
    }
    decodedTotal += data.byteLength;
    if (data.byteLength !== rec.size || decodedTotal > ZIP_MAX_BYTES || crc32(data) !== rec.crc) throw new Error('ZIP 파일의 크기 또는 CRC 무결성 검사가 실패했습니다.');
    if (!rec.directory) out.push({ path: rec.path, data });
  }
  return out;
}
