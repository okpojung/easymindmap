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
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => view.getUint16(o, true);
  const u32 = (o: number) => view.getUint32(o, true);

  // EOCD(끝 레코드) 탐색 — 주석이 붙어 있을 수 있어 뒤에서 앞으로 스캔
  let eocd = -1;
  const scanEnd = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= scanEnd; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return [];

  const count = u16(eocd + 10);
  let off = u32(eocd + 16);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];

  for (let k = 0; k < count && off + 46 <= bytes.length; k++) {
    if (u32(off) !== 0x02014b50) break;
    const method = u16(off + 10);
    const csize = u32(off + 20);
    const nameLen = u16(off + 28);
    const extraLen = u16(off + 30);
    const cmtLen = u16(off + 32);
    const lho = u32(off + 42);
    const name = dec.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + cmtLen;

    if (name.endsWith('/')) continue; // 폴더 엔트리
    if (lho + 30 > bytes.length) continue;
    const lNameLen = u16(lho + 26);
    const lExtraLen = u16(lho + 28);
    const dataStart = lho + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + csize);

    if (method === 0) {
      out.push({ path: name, data: raw });
    } else if (method === 8) {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([raw as BlobPart]).stream().pipeThrough(ds);
        out.push({ path: name, data: new Uint8Array(await new Response(stream).arrayBuffer()) });
      } catch {
        // 풀 수 없는 엔트리는 건너뛴다
      }
    }
  }
  return out;
}
