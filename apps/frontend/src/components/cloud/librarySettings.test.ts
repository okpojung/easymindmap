import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PublishStatus } from '@/services/cloud/apiClient';
import { libraryDraft, libraryMeta, libraryUnavailable, LibrarySaveError, LibraryTargetChanged, saveLibrarySettings, shouldLockLibraryMap } from './librarySettings';

const blank: PublishStatus = { available: true, canManageLibrary: true, publishId: null, publishedAt: null, dashboard: false,
  publishable: true, canSetVisibility: true, canSetListed: true, canSetMeta: true, tags: [], commentsEnabled: false };
const registered: PublishStatus = { ...blank, publishId: 'id', visibility: 'private', listed: false, priceKrw: null };
const paid: PublishStatus = { ...registered, visibility: 'paid', priceKrw: 4500, listed: true };
const target = 'row-map';
function fake(original: PublishStatus) {
  let state = { ...original };
  const writes: string[] = [];
  const log = (id: string, op: string) => { assert.equal(id, target); writes.push(op); };
  const api = {
    publishStatus: async (id: string) => { assert.equal(id, target); return { ...state }; },
    publishMap: async (id: string, vis: string) => { log(id, vis); assert.equal(vis, 'private'); state = { ...registered }; return { ...state }; },
    setPublishMeta: async (id: string, meta: ReturnType<typeof libraryMeta>) => {
      log(id, 'meta'); assert.ok(state.publishId); state = { ...state, ...meta }; return meta;
    },
    setMapListed: async (id: string, listed: boolean, expectedPublishId?: string) => {
      assert.equal(expectedPublishId, state.publishId, "listing mutation must be bound to the reviewed registration");
      log(id, listed ? 'list' : 'unlist'); assert.ok(state.publishId); state = { ...state, listed,
        visibility: listed && state.visibility === 'private' ? 'public' : state.visibility };
      // Mutation responses do not include canSetMeta, publishable, description, etc.
      return { publishId: state.publishId, available: true, listed, publishedAt: null, visibility: state.visibility, priceKrw: state.priceKrw };
    },
  };
  const draft = { ...libraryDraft(original), description: 'map notes', tags: 'Cafe\u0301, #CAFE\u0301, 한글，Tag', commentsEnabled: true };
  const busy = { current: false };
  const save = (listed: boolean, current = () => true) => saveLibrarySettings(api, target, original, { ...draft, listed }, current, busy);
  return { api, writes, draft, busy, save, get actual() { return state; } };
}
function failMeta(f: ReturnType<typeof fake>) {
  f.api.setPublishMeta = async () => { f.writes.push('meta'); throw new Error('offline metadata failure'); };
}
{
  const f = fake(blank);
  const loaded = libraryDraft(await f.api.publishStatus(target));
  const changed = { ...loaded, listed: !loaded.listed }; libraryMeta(changed);
  assert.deepEqual(f.writes, [], 'opening, toggling, validating and discarding the draft never write');
  assert.deepEqual(libraryMeta(f.draft).tags, ['café', '한글', 'tag']);
  for (const tags of [Array.from({ length: 11 }, (_, i) => String(i)).join(','), 'x'.repeat(31)])
    assert.throws(() => libraryMeta({ ...f.draft, tags }), /tagLimit/);
  assert.throws(() => libraryMeta({ ...f.draft, description: 'x'.repeat(501) }), /descriptionLimit/);
  const edited = await f.save(true);
  assert.deepEqual(f.writes, ['private', 'meta', 'list']); assert.equal(edited?.canSetMeta, true); assert.equal(edited?.visibility, 'public');
  const privateOnly = fake(blank); await privateOnly.save(false);
  assert.deepEqual(privateOnly.writes, ['private', 'meta']); assert.equal(privateOnly.actual.visibility, 'private');
}
{
  const f = fake(blank); failMeta(f);
  await assert.rejects(f.save(true), (e: LibrarySaveError) => e instanceof LibrarySaveError && e.completed.join() === 'registered' && e.actual?.visibility === 'private');
  assert.deepEqual(f.writes, ['private', 'meta']); assert.equal(f.actual.listed, false);
}
{
  const f = fake(paid); failMeta(f);
  await assert.rejects(f.save(false), (e: LibrarySaveError) => e instanceof LibrarySaveError && e.completed.join() === 'unlisted' && e.actual?.listed === false);
  assert.deepEqual(f.writes, ['unlist', 'meta']); assert.equal(f.actual.publishId, 'id'); assert.equal(f.actual.visibility, 'paid'); assert.equal(f.actual.priceKrw, 4500);
  const normal = fake(paid); const result = await normal.save(false);
  assert.equal(result?.visibility, 'paid'); assert.equal(result?.priceKrw, 4500); assert.equal(result?.listed, false);
}
assert.equal(libraryUnavailable({ ...blank, available: false, canManageLibrary: false }), 'publish.unavailable');
for (const [permission, message] of [[false, 'publish.library.ownerOnly'], [undefined, 'publish.library.unsupported']] as const) {
  for (const base of [blank, registered, paid]) {
    const before = { ...base, canManageLibrary: permission };
    assert.equal(libraryUnavailable(before), message);
    const f = fake(before); await assert.rejects(f.save(!before.listed), (e: LibrarySaveError) => e.message === message);
    assert.deepEqual(f.writes, [], 'no registration, metadata or listing changes without confirmed ownership');
  }
}
for (const unavailable of [{ available: false }, { publishable: false }, { publishable: undefined }, { dashboard: true }, { canSetMeta: undefined }, { canSetListed: false }, { canSetVisibility: undefined }]) {
  const f = fake({ ...blank, ...unavailable }); await assert.rejects(f.save(true), LibrarySaveError); assert.deepEqual(f.writes, []);
}
{
  const f = fake(blank); const work = f.save(true); assert.equal(f.busy.current, true);
  assert.equal(await f.save(true), null); await work; assert.deepEqual(f.writes, ['private', 'meta', 'list']);
}
for (const step of ['status', 'private', 'meta', 'list']) {
  let active = true; const f = fake(blank);
  const key = ({ status: 'publishStatus', private: 'publishMap', meta: 'setPublishMeta', list: 'setMapListed' } as const)[step];
  const op = f.api[key]; f.api[key] = async (...args) => { const result = await op(...args); active = false; return result; };
  await assert.rejects(f.save(true, () => active), LibraryTargetChanged);
  const all = ['status', 'private', 'meta', 'list']; assert.deepEqual(f.writes, all.slice(1, all.indexOf(step) + 1));
}
{
  const f = fake(blank); const read = f.api.publishStatus; let n = 0;
  f.api.publishStatus = async id => (++n === 2 ? blank : read(id));
  await assert.rejects(f.save(true), LibrarySaveError); assert.deepEqual(f.writes, ['private', 'meta'], 'registration removed before list: no public recreation');
}
{
  const f = fake(registered); f.api.setMapListed = async () => { throw new Error('listing failed'); };
  await assert.rejects(f.save(true), (e: LibrarySaveError) => e.completed.includes('metadata') && e.actual?.listed === false);
  assert.deepEqual(f.writes, ['meta']);
}
for (const visibility of ['public', 'paid'] as const) {
  const s = { ...paid, listed: false, visibility };
  assert.equal(shouldLockLibraryMap(target, s, { cloudMapId: target, readOnlyInfo: null }), true, 'public or paid still locks when unlisted');
  assert.equal(shouldLockLibraryMap(target, s, { cloudMapId: 'other', readOnlyInfo: null }), false);
  assert.equal(shouldLockLibraryMap(target, s, { cloudMapId: null, readOnlyInfo: { mapId: 'other' } }), false);
  assert.equal(shouldLockLibraryMap(target, s, { cloudMapId: null, readOnlyInfo: { mapId: target } }), false, 'never overwrite an existing lock');
  assert.equal(shouldLockLibraryMap(target, { ...s, dashboard: true }, { cloudMapId: target, readOnlyInfo: null }), false);
}
// UI contracts: neither entry point writes, the dialog binds edits to its draft and saves only on the explicit button.
const source = (f: string) => readFileSync('src/components/cloud/' + f, 'utf8');
const browser = source('MapBrowser.tsx'), dialog = source('LibrarySettingsDialog.tsx');
assert.doesNotMatch(browser, /toggleListed|cloudApi\.setMapListed/); assert.match(browser, /onSelect: \(\) => setLibraryMap\(m\)/); assert.match(browser, /onClick=\{\(\) => setLibraryMap\(r.map\)\}/);
assert.match(dialog, /role="switch"/); assert.match(dialog, /onChange=\{e => update\(\{ listed: e.target.checked \}\)\}/); assert.equal(dialog.match(/saveLibrarySettings\(/g)?.length, 1);
assert.match(dialog, /onClick=\{\(\) => void save\(\)\}/); assert.doesNotMatch(dialog, /upload|putPublishPreview|setPublishVisibility|setMapPrice|unpublishMap/);
console.log('librarySettings: all offline workflow, race, eligibility, normalization, lock and entry-point checks passed');
