// node scripts/run-vite-test.mjs src/utils/importMapFileZip.test.ts
import assert from 'node:assert/strict';
import type { SampleMap } from '@emm/model';
import { relinkAttachments, relinkImages, isProtectedArchiveViewerHtml } from './importMapFile';
const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);
const fixture = (): SampleMap => ({ title: 'ZIP fixture', root: { id: 'r', text: 'root', colorKey: 'root', attachments: [
  { id: 'one', name: 'same.md', kind: 'file', url: 'files/asset-one-same.md' },
  { id: 'two', name: 'same.md', kind: 'file', url: 'files/asset-two-same.md' },
] }, branches: [], centers: [{ root: { id: 'r2', text: 'second', colorKey: 'root', attachments: [{ id: 'three', name: 'same.md', kind: 'file', url: './files/third.md' }] }, branches: [] }] });
const decoded = (s: string) => atob(s.slice(s.indexOf(',') + 1));
async function main() {
  const map = fixture(), before = JSON.stringify(map);
  const files = [{ path: 'files/asset-one-same.md', data: bytes('first') }, { path: 'files/asset-two-same.md', data: bytes('second') }, { path: 'files/third.md', data: bytes('third') }];
  const result = relinkAttachments(map, files);
  assert.deepEqual(result.map.root.attachments!.map(a => decoded(a.url!)), ['first', 'second']);
  assert.equal(decoded(result.map.centers![0].root.attachments![0].url!), 'third');
  assert.equal(result.relinked, 3); assert.equal(JSON.stringify(map), before);
  assert.throws(() => relinkAttachments(map, [{ path: 'files/same.md', data: bytes('wrong fallback') }]), /원본이 없습니다/);
  assert.throws(() => relinkAttachments(map, []), /원본이 없습니다/);
  const legacy = fixture(); legacy.root.attachments = [{ id: 'old', name: 'old.md', kind: 'file', url: 'blob:expired' }]; legacy.centers = undefined;
  assert.equal(decoded(relinkAttachments(legacy, [{ path: 'files/old.md', data: bytes('legacy') }]).map.root.attachments![0].url!), 'legacy');
  legacy.root.attachments![0].url = '';
  assert.equal(decoded(relinkAttachments(legacy, [{ path: 'files/old-2.md', data: bytes('legacy stem') }]).map.root.attachments![0].url!), 'legacy stem');
  legacy.root.attachments![0].url = 'data:text/plain;base64,eA==';
  assert.equal(relinkAttachments(legacy, files).map.root.attachments![0].url, 'data:text/plain;base64,eA==');
  const images = fixture(); images.root.attachments = []; images.centers = undefined;
  images.root.image = { src: 'files/picture.png', w: 20, h: 10 };
  images.root.notes = [{ id: 'note', type: 'paragraph', text: 'rich image', html: '<p><img alt="a>b" data-src="keep" src="files/picture.png"></p>' }];
  const imgBefore = JSON.stringify(images);
  const relinked = await relinkImages(images, [{ path: 'files/picture.png', data: Uint8Array.of(1, 2, 3) }], { preferServer: false });
  assert.ok(relinked.map.root.image!.src.startsWith('data:image/png;base64,'));
  assert.ok(relinked.map.root.notes![0].html!.includes('src="data:image/png;base64,'));
  assert.ok(relinked.map.root.notes![0].html!.includes('data-src="keep"'));
  assert.equal(relinked.relinkedImages, 1); assert.equal(JSON.stringify(images), imgBefore);
  console.log('PASS import ZIP: explicit duplicate names, missing originals fail closed, legacy fallback, root/extra-center, node/rich-note images, immutable maps');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

const markerExample = '<meta name="emm-protected-archive" content="1">';
assert.equal(isProtectedArchiveViewerHtml('guide.md', '# 안내\n\n' + markerExample), false);
assert.equal(isProtectedArchiveViewerHtml('viewer.html', '<!doctype html><html><head>' + markerExample + '</head><body></body></html>'), true);
assert.equal(isProtectedArchiveViewerHtml('guide.html', '<html><head></head><body><pre>' + markerExample + '</pre></body></html>'), false);
assert.equal(isProtectedArchiveViewerHtml('guide.html', '<html><head><!-- ' + markerExample + ' --></head><body></body></html>'), false);
console.log('PASS protected archive marker: only real HTML head, never Markdown examples');
