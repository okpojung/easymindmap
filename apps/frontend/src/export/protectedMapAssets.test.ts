import assert from 'node:assert/strict';
import type { SampleMap } from '@emm/model';
import { inlineProtectedMapAssets, validateProtectedMapImport, PROTECTED_ASSET_LIMIT, PROTECTED_RESOURCE_LIMIT } from './protectedMapAssets';
async function main() {
  const attachment = (id: string, url?: string) => ({ id, name: id + '.md', kind: 'file' as const, url });
  const map: SampleMap = {
    title: 'Private fixture',
    root: { id: 'root', text: 'Diary', colorKey: 'root', attachments: [attachment('root-note', 'blob:shared')], image: { src: 'https://example.invalid/image.png', w: 10, h: 10 } },
    branches: [{ id: 'month', text: 'Month', colorKey: 'l1A', side: 'right', children: [{ id: 'day', text: 'Day', attachments: [attachment('daily-note', 'blob:shared')], notes: [{ id: 'note', type: 'paragraph', text: 'photo', html: '<img alt="a>b" data-src="keep" src="https://example.invalid/rich.png">' }], images: [{ src: 'https://example.invalid/image.png', w: 20, h: 10, afterLine: 1 }] }] }],
    centers: [{ root: { id: 'extra', text: 'Other', colorKey: 'root', attachments: [attachment('extra-note', 'blob:extra')] }, branches: [] }],
  };
  const before = JSON.stringify(map);
  const requests: string[] = [];
  const result = await inlineProtectedMapAssets(map, async src => { requests.push(src); return { bytes: new TextEncoder().encode(src.startsWith('blob:') ? '# secret diary' : 'synthetic image'), mime: src.startsWith('blob:') ? 'text/markdown' : 'image/png' }; });
  assert.equal(result.attachments, 3); assert.equal(requests.length, 4); assert.equal(new Set(requests).size, requests.length);
  assert.equal(JSON.stringify(map), before, 'never mutate live map');
  assert.doesNotThrow(() => validateProtectedMapImport(result.map));
  assert.throws(() => validateProtectedMapImport(map), /형식/);
  assert.ok(result.map.root.attachments![0].url!.startsWith('data:text/markdown;base64,'));
  assert.ok(result.map.root.image!.src.startsWith('data:image/png;base64,'));
  assert.ok(result.map.branches[0].children![0].notes![0].html!.includes('src="data:image/png;base64,'));
  assert.ok(result.map.branches[0].children![0].notes![0].html!.includes('data-src="keep"'));
  assert.ok(result.map.centers![0].root.attachments![0].url!.startsWith('data:'));
  const missing = structuredClone(map); missing.root.attachments![0].url = undefined;
  await assert.rejects(inlineProtectedMapAssets(missing, async () => { throw Error('must not run'); }), /원본/);
  await assert.rejects(inlineProtectedMapAssets(map, async () => { throw Error('network failure with sensitive URL'); }), e => e instanceof Error && e.message.includes('원본') && !e.message.includes('sensitive'));
  await assert.rejects(inlineProtectedMapAssets(map, async () => ({ bytes: new Uint8Array(PROTECTED_ASSET_LIMIT + 1), mime: 'text/plain' })), /20MB/);
  const relative = structuredClone(map); relative.root.image!.src = 'files/stale.png';
  await assert.rejects(inlineProtectedMapAssets(relative, async () => { throw Error('must not run'); }), /원본/);
  const many = structuredClone(map); many.root.attachments = Array.from({ length: PROTECTED_RESOURCE_LIMIT + 1 }, (_, i) => attachment('many-' + i, 'blob:shared'));
  let fetched = false;
  await assert.rejects(inlineProtectedMapAssets(many, async () => { fetched = true; return { bytes: new Uint8Array(), mime: 'text/plain' }; }), /너무 많/);
  assert.equal(fetched, false, 'bound references before fetching');
  console.log('PASS protected assets: every center/root/descendant, MD/images/rich-note images, deduplication, immutability, missing bytes and size fail closed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
