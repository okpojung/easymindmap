import assert from 'node:assert/strict';
import type { SampleMap } from '@emm/model';
import { prepareHtmlAssets, layoutHtmlAssets, hasSeparatedHtmlAssets, releaseHtmlAssets } from './htmlAssetPolicy';

const photo = '/v1/attachments/photo-123?v=2';
const document = '/v1/attachments/document-123/content?v=2';
const fixture: SampleMap = {
  title: 'server-relative fixture',
  root: { id: 'root', text: 'root', colorKey: 'root', side: 'center', image: { src: photo, w: 1, h: 1 }, notes: [{ id: 'note', html: `<img src="${photo}">` }] },
  branches: [{ id: 'branch', text: 'branch', colorKey: 'l1A', side: 'right', attachments: [{ id: 'doc', name: 'report.md', kind: 'file', url: document }] }],
} as SampleMap;
const original = JSON.stringify(fixture);
const loaded: string[] = [];
const snapshot = await prepareHtmlAssets(fixture, async source => {
  loaded.push(source);
  return { bytes: new Uint8Array([1, 2, 3]), mime: source === photo ? 'image/png' : 'text/markdown' };
});
assert.deepEqual(new Set(loaded), new Set([photo, document]), 'existing loader receives recognized API-relative URLs unchanged');
assert.equal(loaded.length, 2, 'same stored photo in node and note is fetched once');
for (const policy of [{ mode: 'all' }, { mode: 'selected' }, { mode: 'none' }] as const) {
  const layout = layoutHtmlAssets(snapshot, policy);
  assert.equal(hasSeparatedHtmlAssets(layout.map), policy.mode === 'none');
  assert.ok(layout.map.root.image!.src.startsWith(policy.mode === 'none' ? 'files/' : 'data:image/png;base64,'));
  assert.ok(layout.map.branches[0].attachments![0].url!.startsWith(policy.mode === 'none' ? 'files/' : 'data:text/markdown;base64,'));
  assert.ok(layout.map.root.notes![0].html!.includes(policy.mode === 'none' ? 'files/' : 'data:image/png;base64,'));
}
assert.equal(JSON.stringify(fixture), original);
releaseHtmlAssets(snapshot);
for (const invalid of ['/v1/attachments/../settings', '/v1/attachments/id/../../auth', '/v1/attachments//id', '//other.example/file', '/other/file', '/v1/attachments/id#fragment']) {
  let called = false;
  await assert.rejects(prepareHtmlAssets({ ...fixture, root: { ...fixture.root, image: { src: invalid }, notes: [] }, branches: [] } as SampleMap,
    async () => { called = true; return { bytes: new Uint8Array([1]), mime: 'image/png' }; }));
  assert.equal(called, false, 'unrecognized or traversing relative sources never reach authenticated loader');
}
console.log('PASS recognized server-relative attachments and photos; reject other relative/traversing URLs');
