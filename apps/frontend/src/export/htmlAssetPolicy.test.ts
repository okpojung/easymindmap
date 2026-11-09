import assert from 'node:assert/strict';
import type { SampleMap } from '@emm/model';
import { collectNoteHtmlImageSrcs } from '@emm/note-images';
import {
  prepareHtmlAssets, layoutHtmlAssets, defaultSelectedHtmlAssets, releaseHtmlAssets,
  HTML_SELECTED_LIMIT, HTML_ALL_LIMIT, HTML_ASSET_LIMIT,
  type HtmlAsset, type PreparedHtmlAssets,
} from './htmlAssetPolicy';
import { buildZip, parseZip } from './zip';

const enc = new TextEncoder();
const att = (id: string, url?: string, name = '동명.md') => ({ id, name, url, kind: 'file' as const });
function fixture(): SampleMap {
  return {
    title: 'Asset policy synthetic fixture',
    root: { id: 'root', text: 'Root', colorKey: 'root', attachments: [att('a', 'blob:shared')], image: { src: 'https://example.invalid/photo?signature=never-copy', w: 10, h: 10 } },
    branches: [{ id: 'branch', text: 'Branch', colorKey: 'l1A', side: 'right', children: [{
      id: 'child', text: 'Child', attachments: [att('b', 'blob:shared')],
      images: [{ src: 'https://example.invalid/photo?signature=never-copy', w: 20, h: 10, afterLine: 1 }],
      notes: [{ id: 'note', type: 'paragraph', text: 'Photos', html: '<p>before</p><img alt="a>b" data-src="keep" src="https://example.invalid/rich"><img src=\'https://example.invalid/rich\'><p>after</p>' }],
    }] }],
    centers: [{
      root: { id: 'extra', text: 'Other', colorKey: 'root', attachments: [att('c', 'blob:other')] },
      branches: [{ id: 'extra-branch', text: 'Photo', colorKey: 'l1B', side: 'left', image: { src: 'data:image/png;base64,AQID', w: 3, h: 1 } }],
    }, {
      root: { id: 'last', text: 'Last', colorKey: 'root', notes: [{ id: 'last-note', type: 'paragraph', text: '', html: '<img src="https://example.invalid/photo?signature=never-copy">' }] }, branches: [],
    }],
  };
}
function smallMap(url: string | undefined = 'blob:one'): SampleMap {
  return { title: 'Small', root: { id: 'root', text: 'Root', colorKey: 'root', attachments: [att('a', url)] }, branches: [] };
}
// Boundary-only doubles never reach base64/ZIP encoding: no large allocation.
function virtualBytes(length: number): Uint8Array {
  const bytes = new Uint8Array();
  Object.defineProperty(bytes, 'length', { value: length });
  Object.defineProperty(bytes, 'byteLength', { value: length });
  return bytes;
}
function boundaryPrepared(sizes: number[]): PreparedHtmlAssets {
  const assets: HtmlAsset[] = sizes.map((size, i) => ({
    id: `asset-${i + 1}`, name: `${i}.bin`, kind: 'attachment', mime: 'application/octet-stream',
    bytes: virtualBytes(size), source: `blob:boundary-${i}`, references: 1,
  }));
  return { map: { title: 'Boundaries', root: { id: 'root', text: '', colorKey: 'root' }, branches: [] }, assets, attachmentCount: sizes.length, totalBytes: sizes.reduce((a, b) => a + b, 0) };
}

async function main() {
  const map = fixture(), before = JSON.stringify(map);
  const calls: { src: string; remaining: number }[] = [];
  const progress: number[][] = [];
  const originals = new Map<string, Uint8Array>();
  const p = await prepareHtmlAssets(map, async (src, remaining) => {
    calls.push({ src, remaining });
    const bytes = enc.encode(src.startsWith('blob:') ? '# original ' + src : 'synthetic-image:' + src);
    originals.set(src, bytes);
    return { bytes, mime: src.startsWith('blob:') ? 'Text/Markdown; charset=utf-8' : 'image/png' };
  }, (done, total) => progress.push([done, total]));
  assert.equal(calls.length, 5, 'one load per unique URL across every center and content kind');
  assert.equal(new Set(calls.map(x => x.src)).size, calls.length);
  assert.equal(p.attachmentCount, 3);
  assert.equal(p.assets.length, 5);
  assert.equal(p.assets.reduce((n, a) => n + a.references, 0), 9, 'duplicate note img references count');
  assert.equal(p.assets.find(a => a.source === 'blob:shared')!.references, 2);
  assert.equal(p.assets.find(a => a.source.includes('signature'))!.references, 3);
  assert.deepEqual(progress, Array.from({ length: 6 }, (_, done) => [done, 5]));
  assert.equal(calls[0].remaining, HTML_ASSET_LIMIT);
  assert.equal(calls[1].remaining, HTML_ASSET_LIMIT - p.assets[0].bytes.length);
  assert.equal(p.totalBytes, p.assets.reduce((n, a) => n + a.bytes.length, 0));
  assert.equal(JSON.stringify(map), before);
  assert.equal(JSON.stringify(p.map), before);
  assert.ok(p.assets.filter(a => a.kind === 'image').every(a => /^사진-\d+\.png$/.test(a.name)));

  const all = layoutHtmlAssets(p, { mode: 'all' });
  assert.equal(all.embedded, 5); assert.equal(all.embeddedBytes, p.totalBytes); assert.equal(all.files.length, 0);
  assert.equal(all.hrefById.size, 3);
  assert.ok(all.map.root.attachments![0].url!.startsWith('data:text/markdown;base64,'));
  assert.ok(all.map.root.image!.src.startsWith('data:image/png;base64,'));
  assert.ok(all.map.centers![0].branches[0].image!.src.startsWith('data:image/png;base64,'));
  assert.ok(all.map.centers![1].root.notes![0].html!.includes('data:image/png;base64,'));
  assert.equal(collectNoteHtmlImageSrcs(all.map.branches[0].children![0].notes![0].html).length, 1);
  assert.ok(all.map.branches[0].children![0].notes![0].html!.includes('data-src="keep"'));

  const selected = layoutHtmlAssets(p, { mode: 'selected', selectedIds: [p.assets[0].id, p.assets[2].id] });
  assert.equal(selected.embedded, 2); assert.equal(selected.files.length, 3);
  assert.ok(selected.map.root.attachments![0].url!.startsWith('data:'));
  assert.equal(selected.map.root.attachments![0].url, selected.map.branches[0].children![0].attachments![0].url);
  assert.ok(selected.map.root.image!.src.startsWith('files/'));
  const selectedPaths = new Set(selected.files.map(f => f.path));
  assert.ok(selectedPaths.has(selected.map.root.image!.src));
  assert.ok(selectedPaths.has(selected.map.centers![0].root.attachments![0].url!));
  assert.ok(!selectedPaths.has(selected.map.root.attachments![0].url!));
  assert.equal(selected.files.reduce((n, f) => n + f.data.length, 0) + selected.embeddedBytes, p.totalBytes, 'each asset stored either inline or as one file, never both');
  const zipped = await parseZip(buildZip(selected.files));
  assert.equal(zipped.length, selected.files.length);
  for (const entry of zipped) assert.deepEqual(entry.data, selected.files.find(f => f.path === entry.path)!.data);

  const none = layoutHtmlAssets(p, { mode: 'none' });
  assert.equal(none.embedded, 0); assert.equal(none.embeddedBytes, 0); assert.equal(none.files.length, 5);
  assert.equal(new Set(none.files.map(f => f.path)).size, 5);
  assert.notEqual(none.map.root.attachments![0].url, none.map.centers![0].root.attachments![0].url, 'same-name different originals retain distinct paths');
  assert.ok(none.files.every(f => /^files\/asset-\d+-[^/\\]+$/.test(f.path)));
  assert.ok(none.files.every(f => !f.path.includes('never-copy') && !f.path.includes('?')));
  assert.equal(none.files.reduce((n, f) => n + f.data.length, 0), p.totalBytes);
  const duplicateRich = none.map.branches[0].children![0].notes![0].html!;
  const richPath = none.files.find(f => f.path.includes('사진-2'))!.path;
  assert.ok(duplicateRich.includes('src="' + richPath + '"') && duplicateRich.includes("src='" + richPath + "'"));
  assert.equal(JSON.stringify(map), before); assert.equal(JSON.stringify(p.map), before, 'layouts are repeatable and do not rewrite the prepared snapshot');
  assert.deepEqual(defaultSelectedHtmlAssets(p), p.assets.map(a => a.id));
  assert.equal(layoutHtmlAssets(p, { mode: 'selected' }).embedded, 5);

  for (const policy of [
    { mode: 'bad' }, { mode: 'none', selectedIds: [] }, { mode: 'all', unexpected: true },
    { mode: 'selected', selectedIds: ['unknown'] },
    { mode: 'selected', selectedIds: [p.assets[0].id, p.assets[0].id] },
    { mode: 'selected', selectedIds: 'not-an-array' },
  ]) assert.throws(() => layoutHtmlAssets(p, policy as never), /정책|목록|자산/);
  assert.throws(() => layoutHtmlAssets(boundaryPrepared([HTML_ALL_LIMIT + 1]), { mode: 'all' }), /40MiB/);
  const justOverSelected = boundaryPrepared([HTML_SELECTED_LIMIT + 1]);
  assert.throws(() => layoutHtmlAssets(justOverSelected, { mode: 'selected', selectedIds: ['asset-1'] }), /20MiB/);
  assert.deepEqual(defaultSelectedHtmlAssets(boundaryPrepared([HTML_SELECTED_LIMIT, 1])), ['asset-1'], '20MiB exact boundary is allowed');
  assert.deepEqual(defaultSelectedHtmlAssets(boundaryPrepared([HTML_SELECTED_LIMIT + 1, 2, 0])), ['asset-2', 'asset-3'], 'greedy skips a large first item, not all later items');
  assert.deepEqual(defaultSelectedHtmlAssets(boundaryPrepared([HTML_ALL_LIMIT])), [], '40MiB can be prepared without allocating its bytes in boundary tests');
  assert.deepEqual(defaultSelectedHtmlAssets(boundaryPrepared([HTML_ASSET_LIMIT])), [], '100MiB exact total is valid');
  assert.throws(() => defaultSelectedHtmlAssets(boundaryPrepared([HTML_ASSET_LIMIT + 1])), /100MiB/);
  await assert.rejects(prepareHtmlAssets(smallMap(), async () => ({ bytes: virtualBytes(HTML_ASSET_LIMIT + 1), mime: 'text/plain' })), /100MiB/);

  let fetched = false;
  for (const url of [undefined, 'files/missing', 'javascript:alert(1)', 'file:///secret', 'data:no-comma', 'https://']) {
    const invalid = smallMap(); invalid.root.attachments![0].url = url;
    await assert.rejects(prepareHtmlAssets(invalid, async () => { fetched = true; throw new Error('should not fetch'); }), /원본/);
  }
  assert.equal(fetched, false);
  await assert.rejects(prepareHtmlAssets(smallMap(), async () => { throw Error('sensitive token URL must not escape'); }), e => e instanceof Error && !e.message.includes('sensitive') && e.message.includes('원본'));
  for (const mime of ['', 'not-a-mime', 'text/plain\nx-evil']) await assert.rejects(prepareHtmlAssets(smallMap(), async () => ({ bytes: new Uint8Array(), mime })), /원본/);
  await assert.rejects(prepareHtmlAssets(smallMap(), async () => ({ bytes: new Uint16Array() as unknown as Uint8Array, mime: 'text/plain' })), /원본/);
  const conflict = smallMap(); conflict.branches = [{ id: 'b', text: '', colorKey: 'l1A', side: 'right', attachments: [att('a', 'blob:different')] }];
  await assert.rejects(prepareHtmlAssets(conflict, async () => { throw Error('not reached'); }), /식별자/);
  const many = smallMap(); many.root.attachments = Array.from({ length: 4097 }, (_, i) => att('many-' + i, 'blob:same'));
  await assert.rejects(prepareHtmlAssets(many, async () => { throw Error('not reached'); }), /4096/);
  const repeatedNote = smallMap(); repeatedNote.root.attachments = [];
  repeatedNote.root.notes = [{ id: 'n', type: 'paragraph', text: '', html: '<img src="blob:same">'.repeat(4097) }];
  await assert.rejects(prepareHtmlAssets(repeatedNote, async () => { throw Error('not reached'); }), /4096/);
  const cycle = smallMap(); (cycle.root as unknown as { children: unknown[] }).children = [cycle.root];
  await assert.rejects(prepareHtmlAssets(cycle, async () => { throw Error('not reached'); }), /50000/);
  const missingNote = smallMap(); missingNote.root.attachments = []; missingNote.root.notes = [{ id: 'n', type: 'paragraph', text: '', html: '<img src="">' }];
  await assert.rejects(prepareHtmlAssets(missingNote, async () => { throw Error('not reached'); }), /원본/);

  const originalBuffer = new Uint8Array([1, 2, 3]);
  const live = smallMap();
  const pending = prepareHtmlAssets(live, async () => ({ bytes: originalBuffer, mime: 'text/plain' }));
  live.root.text = 'changed after export began'; live.root.attachments![0].url = 'blob:later';
  const snapshot = await pending;
  assert.equal(snapshot.map.root.text, 'Root'); assert.equal(snapshot.map.root.attachments![0].url, 'blob:one');
  releaseHtmlAssets(snapshot);
  assert.deepEqual([...snapshot.assets[0].bytes], [0, 0, 0]);
  assert.deepEqual([...originalBuffer], [1, 2, 3], 'release owns its buffers and must not wipe loader cache/original');
  assert.throws(() => layoutHtmlAssets(snapshot, { mode: 'none' }), /해제/);
  assert.doesNotThrow(() => releaseHtmlAssets(snapshot));
  const malicious = smallMap('blob:name'); malicious.root.attachments![0].name = '../evil\\path?#.md';
  const safe = await prepareHtmlAssets(malicious, async () => ({ bytes: new Uint8Array(), mime: 'application/octet-stream' }));
  const safeLayout = layoutHtmlAssets(safe, { mode: 'none' });
  assert.equal(safeLayout.files.length, 1); assert.match(safeLayout.files[0].path, /^files\/asset-1-[^/\\?#]+$/);
  const empty = await prepareHtmlAssets({ title: 'Empty', root: { id: 'root', text: '', colorKey: 'root' }, branches: [] }, async () => { throw Error('not reached'); });
  assert.equal(layoutHtmlAssets(empty, { mode: 'all' }).embedded, 0);
  for (const prepared of [p, safe, empty]) releaseHtmlAssets(prepared);
  console.log('PASS HTML asset policy: immutable all-center snapshots, exact note references, URL deduplication, three policies, limits, safe distinct paths, ZIP single-storage and owned-buffer release');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
