import assert from 'node:assert/strict';
import vm from 'node:vm';
import { shareViewerAssets, SHARED_VIEWER_ASSET_BOOTSTRAP } from './sharedViewerAssets';

const md = 'data:text/markdown;base64,' + Buffer.from('# 비공개 일기\n원본 바이트').toString('base64');
const binary = 'data:application/octet-stream;base64,' + Buffer.from([0, 1, 127, 128, 255]).toString('base64');
const image = 'data:image/png;base64,' + Buffer.from('synthetic PNG bytes').toString('base64');
// Includes UTF-16 surrogate pairs, escaped CR/LF, Korean and HTML-safe escaping
// ahead of each resource. Offsets must stay correct after script parsing.
const metadata = { format: 'easymindmap-map', version: 1, map: { title: '한글 🧪 <script>\r\n', root: { attachments: [{ name: '일기.md', url: md }] }, branches: [{ image: { src: image }, attachments: [{ url: binary }] }] } };
const metaJson = JSON.stringify(metadata).replace(/</g, '\\u003c');
const viewer = { root: { text: 'Literal emm-shared-asset:1:2 must stay text', attachments: [{ name: '일기.md', href: md }], image: { src: image }, children: [{ attachments: [{ href: binary }] }] }, centers: [{ attachments: [{ href: md }] }], links: [{ href: 'https://example.com/' }], codeRenders: { unique: { src: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E' } } };
const before = JSON.stringify(viewer);
const packed = shareViewerAssets(viewer, metaJson);
assert.equal(packed.sharedCount, 4);
assert.equal(JSON.stringify(viewer), before, 'do not mutate caller data');
for (const value of [md, binary, image]) assert.ok(!JSON.stringify(packed.data).includes(value), 'viewer contains references, not a second payload');
assert.equal(JSON.parse(metaJson).map.root.attachments[0].url, md, 'legacy restoration map is unchanged');
assert.equal(packed.data.root.text, viewer.root.text, 'ordinary node text is never resolved');
assert.equal(packed.data.links[0].href, viewer.links[0].href, 'external links unchanged');
assert.equal(packed.data.codeRenders.unique.src, viewer.codeRenders.unique.src, 'viewer-only/non-base64 resource unchanged');

function hydrate(data: unknown, meta = metaJson) {
  const context = { window: { __MINDMAP__: structuredClone(data) }, document: { getElementById: (id: string) => id === 'easymindmap-map' ? { textContent: meta } : null, createElement: () => { throw Error('No HTML image fixture in this test'); } } };
  vm.runInNewContext(SHARED_VIEWER_ASSET_BOOTSTRAP, context);
  return context.window.__MINDMAP__;
}
assert.equal(JSON.stringify(hydrate(packed.data)), before, 'actual browser bootstrap restores every original viewer byte');
assert.throws(() => hydrate({ href: 'emm-shared-asset:999999999:8' }), /참조/);
assert.throws(() => hydrate({ src: 'emm-shared-asset:0:5' }), /원본/);
assert.throws(() => hydrate({ href: 'emm-shared-asset:1:99999999999999999999' }), /참조/);
assert.equal(JSON.stringify(hydrate(viewer)), before, 'legacy viewer data without references unchanged');
assert.equal(shareViewerAssets({ href: 'files/large.docx' }, '{"map":{}}').sharedCount, 0, 'ZIP file paths unchanged');

const htmlMeta = JSON.stringify({ map: { note: { html: `<p>사진</p><img alt="a>b" src="${image}">` } } });
const htmlPacked = shareViewerAssets({ notes: [{ html: `<p>사진</p><img alt="a>b" src="${image}">` }] }, htmlMeta);
assert.equal(htmlPacked.sharedCount, 1);
assert.ok(!htmlPacked.data.notes[0].html.includes(image));
assert.ok(htmlPacked.data.notes[0].html.includes('src="emm-shared-asset:'));
console.log('PASS shared viewer assets: metadata-only originals, all centers, binary/MD/image equality, legacy imports/viewers, Unicode offsets, corrupt-reference bounds, rich HTML image references');
