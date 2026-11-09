import assert from 'node:assert/strict';
import { prepareHtmlAssets, releaseHtmlAssets } from './htmlAssetPolicy';
import { buildPreparedHtmlExport } from './htmlAssetExport';
import { parseZip } from './zip';
import { decryptStandaloneHtml } from './encryptedHtml';
import { parseHtmlMapFile, parseZipMapFile } from '@/utils/importMapFile';
import type { SampleMap } from '@emm/model';

// Only synthetic bytes. A network call must never be necessary for restoration.
const one = new TextEncoder().encode('synthetic-office-original-A-한글');
const two = new Uint8Array([80, 75, 3, 4, 0, 251, 1, 252, 2, 253, 3, 254, 4, 255]);
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64'));
const url = (bytes: Uint8Array, mime: string) => `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
const a = url(one, 'application/octet-stream'), b = url(two, 'application/octet-stream'), image = url(png, 'image/png');
const map: SampleMap = {
  title: '정책 왕복 합성 자료',
  root: { id: 'root', text: '합성 검증', colorKey: 'root', side: 'center', attachments: [{ id: 'first', name: 'same$$.docx', url: a }], image: { src: image, w: 1, h: 1 } },
  branches: [{ id: 'branch', text: '서로 다른 동명 원본', colorKey: 'l1A', side: 'right', attachments: [{ id: 'second', name: 'same$$.docx', url: b }], notes: [{ id: 'note', html: `<p>사진</p><img src="${image}">` }] }],
} as SampleMap;
const original = JSON.stringify(map);
const sources = new Map([[a, { bytes: one, mime: 'application/octet-stream' }], [b, { bytes: two, mime: 'application/octet-stream' }], [image, { bytes: png, mime: 'image/png' }]]);
const prepared = await prepareHtmlAssets(map, async source => { const value = sources.get(source); if (!value) throw Error('missing fixture'); return value; });
const view = { layoutType: 'tree-right' as const };
const bytesOf = (value: string | undefined) => Buffer.from(value!.split(',')[1], 'base64');
function originals(restored: SampleMap) {
  assert.deepEqual(bytesOf(restored.root.attachments![0].url), Buffer.from(one));
  assert.deepEqual(bytesOf(restored.branches[0].attachments![0].url), Buffer.from(two));
  assert.deepEqual(bytesOf(restored.root.image!.src), Buffer.from(png));
  assert.ok(restored.branches[0].notes![0].html!.includes('data:image/png;base64,'));
}
const savedFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error('NO_NETWORK_IN_EXPORT_RESTORE_TEST'); };
try {
  const all = await buildPreparedHtmlExport(prepared, { mode: 'all' }, view);
  assert.ok(all.fileName.endsWith('.html'));
  const allHtml = await all.blob.text();
  originals(parseHtmlMapFile(allHtml)!.map);
  assert.equal(allHtml.split(a).length - 1, 1, 'viewer and restoration metadata share one embedded attachment');

  const none = await buildPreparedHtmlExport(prepared, { mode: 'none' }, view);
  assert.ok(none.fileName.endsWith('.zip'));
  const noneBytes = new Uint8Array(await none.blob.arrayBuffer());
  const noneEntries = await parseZip(noneBytes);
  const htmlEntry = noneEntries.find(entry => entry.path.endsWith('.html'))!;
  const noneHtml = new TextDecoder().decode(htmlEntry.data);
  for (const data of [a, b, image]) assert.ok(!noneHtml.includes(data), 'excluded originals never appear in HTML');
  assert.equal(noneEntries.filter(entry => entry.path.startsWith('files/')).length, 3);
  assert.notEqual(parseHtmlMapFile(noneHtml)!.map.root.attachments![0].url, parseHtmlMapFile(noneHtml)!.map.branches[0].attachments![0].url);
  originals((await parseZipMapFile(noneBytes))!.map);

  const selected = await buildPreparedHtmlExport(prepared, { mode: 'selected', selectedIds: [prepared.assets[0].id] }, view);
  const selectedEntries = await parseZip(new Uint8Array(await selected.blob.arrayBuffer()));
  assert.equal(selectedEntries.filter(entry => entry.path.startsWith('files/')).length, 2);
  assert.ok(!selectedEntries.some(entry => Buffer.from(entry.data).equals(Buffer.from(one))), 'embedded original has no duplicate binary entry');
  originals((await parseZipMapFile(new Uint8Array(await selected.blob.arrayBuffer())))!.map);

  const secret = 'SyntheticArchive9!';
  const protectedZip = await buildPreparedHtmlExport(prepared, { mode: 'none' }, view, secret);
  assert.equal(protectedZip.fileName, '보호된-맵.zip');
  const protectedBytes = new Uint8Array(await protectedZip.blob.arrayBuffer());
  const protectedEntries = await parseZip(protectedBytes);
  assert.deepEqual(protectedEntries.map(entry => entry.path), ['viewer.html', 'files/content.emmenc']);
  const outside = new TextDecoder().decode(protectedBytes);
  for (const value of [map.title, 'same$$.docx', a, Buffer.from(one).toString('utf8')]) assert.ok(!outside.includes(value), 'outside ZIP reveals no original names or content');
  await assert.rejects(parseZipMapFile(protectedBytes), /PROTECTED_ARCHIVE_PASSWORD_REQUIRED/);
  await assert.rejects(parseZipMapFile(protectedBytes, undefined, 'WrongSynthetic9!'));
  originals((await parseZipMapFile(protectedBytes, undefined, secret))!.map);

  const protectedHtml = await buildPreparedHtmlExport(prepared, { mode: 'all' }, view, secret);
  assert.equal(protectedHtml.fileName, '보호된-맵.html');
  const decrypted = await decryptStandaloneHtml(await protectedHtml.blob.text(), secret);
  originals(parseHtmlMapFile(decrypted.html)!.map);
  assert.equal(JSON.stringify(map), original, 'all export modes leave the active map and its originals unchanged');
  assert.deepEqual(one, sources.get(a)!.bytes, 'preparation owns its buffers');
  console.log('PASS HTML asset package integration: all / selected / none / encrypted ZIP / legacy protected HTML / exact restoration');
} finally {
  globalThis.fetch = savedFetch;
  releaseHtmlAssets(prepared);
}
