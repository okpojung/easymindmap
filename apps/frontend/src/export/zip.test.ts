import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { buildZip, parseZip, ZIP_MAX_BYTES, ZIP_MAX_ENTRIES } from './zip';
const enc = new TextEncoder();
const data = (s: string) => enc.encode(s);
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const central = (b: Uint8Array) => view(b).getUint32(b.length - 6, true);
function descriptorFixture() {
  const old = buildZip([{ path: 'a', data: data('descriptor') }]);
  const c = central(old), ov = view(old), out = new Uint8Array(old.length + 16);
  out.set(old.subarray(0, c)); out.set(old.subarray(c), c + 16);
  const v = view(out), crc = ov.getUint32(14, true), size = ov.getUint32(18, true);
  v.setUint16(6, 0x0808, true); v.setUint16(c + 24, 0x0808, true);
  for (const p of [14, 18, 22]) v.setUint32(p, 0, true);
  v.setUint32(c, 0x08074b50, true); v.setUint32(c + 4, crc, true); v.setUint32(c + 8, size, true); v.setUint32(c + 12, size, true);
  v.setUint32(out.length - 6, c + 16, true);
  return out;
}
function deflated(plain: Uint8Array, claimed = plain.length) {
  const raw = new Uint8Array(deflateRawSync(plain));
  const b = buildZip([{ path: 'file', data: raw }]), v = view(b), c = central(b);
  const crc = view(buildZip([{ path: 'x', data: plain }])).getUint32(14, true);
  v.setUint16(8, 8, true); v.setUint16(c + 10, 8, true);
  v.setUint32(14, crc, true); v.setUint32(c + 16, crc, true);
  v.setUint32(22, claimed, true); v.setUint32(c + 24, claimed, true);
  return b;
}
async function main() {
  const entries = [{ path: '맵.html', data: data('한글 map') }, { path: 'files/a.bin', data: Uint8Array.of(0, 1, 255) }];
  const zip = buildZip(entries);
  assert.deepEqual(await parseZip(zip), entries);
  assert.deepEqual(await parseZip(buildZip([])), []);
  const wrapped = new Uint8Array(zip.length + 10); wrapped.set(zip, 5);
  assert.deepEqual(await parseZip(wrapped.subarray(5, 5 + zip.length)), entries);
  for (let end = 0; end < zip.length; end += 7) await assert.rejects(parseZip(zip.subarray(0, end)), /ZIP/);
  const corrupt = buildZip([{ path: 'x', data: data('original') }]); corrupt[31] ^= 1;
  await assert.rejects(parseZip(corrupt), /CRC/);
  const localName = zip.slice(); localName[30] ^= 1; await assert.rejects(parseZip(localName), /ZIP/);
  const badOffset = zip.slice(); view(badOffset).setUint32(central(badOffset) + 42, badOffset.length, true); await assert.rejects(parseZip(badOffset), /ZIP/);
  const encrypted = zip.slice(); view(encrypted).setUint16(central(encrypted) + 8, 0x0801, true); await assert.rejects(parseZip(encrypted), /ZIP/);
  const count = zip.slice(); view(count).setUint16(count.length - 12, ZIP_MAX_ENTRIES + 1, true); view(count).setUint16(count.length - 14, ZIP_MAX_ENTRIES + 1, true); await assert.rejects(parseZip(count), /ZIP/);
  for (const path of ['../x', '/absolute', 'C:/x', 'files/../x', 'files\\x', 'files/%2e%2e/x']) assert.throws(() => buildZip([{ path, data: data('x') }]), /경로/);
  assert.throws(() => buildZip([{ path: 'same', data: data('a') }, { path: 'same', data: data('b') }]), /중복/);
  const duplicate = buildZip([{ path: 'a', data: data('1') }, { path: 'b', data: data('2') }]);
  const c1 = central(duplicate), c2 = c1 + 47, l2 = view(duplicate).getUint32(c2 + 42, true);
  duplicate[c2 + 46] = 97; duplicate[l2 + 30] = 97;
  await assert.rejects(parseZip(duplicate), /중복/);
  const traversal = buildZip([{ path: 'files/a', data: data('1') }]);
  traversal.set(data('../oops'), 30); traversal.set(data('../oops'), central(traversal) + 46);
  await assert.rejects(parseZip(traversal), /경로/);
  const fakeLarge = new Uint8Array(22); Object.defineProperty(fakeLarge, 'byteLength', { value: ZIP_MAX_BYTES + 1 });
  await assert.rejects(parseZip(fakeLarge), /ZIP/);
  const bomb = zip.slice(); view(bomb).setUint32(central(bomb) + 24, ZIP_MAX_BYTES + 1, true); await assert.rejects(parseZip(bomb), /ZIP/);
  const desc = descriptorFixture(); assert.equal(new TextDecoder().decode((await parseZip(desc))[0].data), 'descriptor');
  const damagedDesc = desc.slice(); damagedDesc[central(damagedDesc) - 8] ^= 1; await assert.rejects(parseZip(damagedDesc), /ZIP/);
  let supported = true;
  try { new DecompressionStream('deflate-raw'); } catch { supported = false; }
  if (supported) {
    const plain = data('round trip '.repeat(1000));
    assert.deepEqual((await parseZip(deflated(plain)))[0].data, plain);
    await assert.rejects(parseZip(deflated(plain, 1)), /크기|해제/);
  } else console.log('SKIP deflate: runtime lacks deflate-raw DecompressionStream');
  console.log('PASS ZIP: STORE/empty/byteOffset, CRC, descriptors, offsets, traversal, duplicate paths, limits, truncation; bounded deflate when available');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
