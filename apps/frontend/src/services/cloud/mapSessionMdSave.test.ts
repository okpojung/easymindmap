import assert from 'node:assert/strict';
import { saveCurrentMap, saveNewMap } from './mapSession';
import { cloudApi, CloudError } from './apiClient';
import { registerMdExitGuard, hasPendingMdEdits } from '@/utils/mdExitGuard';
import { useDocumentStore, setViewerLocked } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAutosaveStore } from '@/stores/autosaveStore';
import type { SampleMap } from '@/editor/__samples__/types';

// Node-only synthetic documents; no browser/storage/credentials/server are used.
const oldWindow = (globalThis as any).window;
const oldFetch = globalThis.fetch;
let httpCalls = 0;
globalThis.fetch = async () => { httpCalls++; throw Error('HTTP forbidden'); };
(globalThis as any).window = {
  clearTimeout, location: { search: '' }, confirm: () => true,
  sessionStorage: { getItem: () => 'synthetic-edit-session' },
};
const originals = { saveDocument: cloudApi.saveDocument, createMap: cloudApi.createMap, deleteMap: cloudApi.deleteMap };
const sample = (text = 'before MD'): SampleMap => ({
  title: 'synthetic document', root: { id: 'root', text: 'Root', colorKey: 'root' },
  branches: [{ id: 'md-node', text, colorKey: 'l1A', side: 'right', children: [] }],
});
const opts = { title: 'new server title', folderId: 'synthetic-folder', kind: 'solo' as const };
let puts: any[][] = [], posts: any[][] = [], deletes: string[] = [];
let unregister: (() => void) | undefined;
const reset = (existing: boolean) => {
  unregister?.(); unregister = undefined;
  setViewerLocked(false);
  useDocumentStore.getState().loadMap(sample(), { resetHistory: true, serverMapId: existing ? 'old-map' : undefined });
  useCloudStore.getState().unlink();
  if (existing) useCloudStore.getState().link('old-map', 'old-version-time', { title: 'server title', folderId: 'old-folder', kind: 'solo' });
  useCloudStore.getState().setBusy('idle');
  useAutosaveStore.setState({ saveState: 'dirty', pendingEdits: 3, lastSavedAt: 0 });
  puts = []; posts = []; deletes = [];
  cloudApi.saveDocument = async (...args: any[]) => {
    puts.push(args);
    return { mapId: args[0], updatedAt: 'saved-time', version: 7, unchanged: false } as any;
  };
  cloudApi.createMap = async (...args: any[]) => { posts.push(args); return { mapId: 'created-map' } as any; };
  cloudApi.deleteMap = async (id: string) => { deletes.push(id); return undefined as any; };
};
const save = (existing: boolean) => existing ? saveCurrentMap({ keepVersion: false }) : saveNewMap(opts);
const noWrites = () => { assert.equal(puts.length, 0); assert.equal(posts.length, 0); assert.equal(deletes.length, 0); };
const notSaved = () => {
  assert.equal(useAutosaveStore.getState().saveState, 'dirty');
  assert.equal(useAutosaveStore.getState().pendingEdits, 3);
  assert.equal(useAutosaveStore.getState().lastSavedAt, 0);
};
let passed = 0;
const pass = (name: string) => { passed++; console.log('PASS ' + name); };
try {
  for (const existing of [true, false]) {
    const name = existing ? 'current' : 'new';
    reset(existing);
    let captured = false, pending = false, flushes = 0;
    // Focused MD is only captured by prepare. No blur/event is dispatched.
    unregister = registerMdExitGuard({
      prepare: () => { if (!captured) { captured = true; pending = true; } },
      pending: () => pending,
      flush: async () => { flushes++; useDocumentStore.getState().updateNodeText('md-node', 'latest unblurred MD'); pending = false; return true; },
    });
    const result = await save(existing);
    assert.equal(flushes, 1); assert.equal(hasPendingMdEdits(), false);
    assert.equal(puts.length, 1); assert.equal(posts.length, existing ? 0 : 1);
    assert.equal(puts[0][1].map.branches[0].text, 'latest unblurred MD');
    assert.equal(puts[0][0], existing ? 'old-map' : 'created-map');
    assert.equal(puts[0][2], existing ? 'server title' : opts.title);
    assert.equal(puts[0][3], !existing); assert.equal(puts[0][4], 'synthetic-edit-session');
    if (existing) { assert.equal(puts[0][6], 'old-version-time'); assert.equal(useCloudStore.getState().lastSavedVersion, 7); }
    else assert.deepEqual(posts[0], [opts.title, { folderId: opts.folderId, kind: opts.kind }]);
    assert.equal(result.mapId, existing ? 'old-map' : 'created-map');
    assert.equal(useCloudStore.getState().cloudMapId, result.mapId);
    assert.equal(useDocumentStore.getState().docOrigin, result.mapId);
    assert.equal(useAutosaveStore.getState().saveState, 'saved');
    assert.equal(useCloudStore.getState().busy, 'idle');
    pass(name + ': focused MD committed before payload');

    for (const failure of ['false', 'throw', 'capture']) {
      reset(existing);
      const before = JSON.stringify(useDocumentStore.getState().map);
      const draft = 'still pending MD';
      unregister = registerMdExitGuard({
        prepare: () => { if (failure === 'capture') throw Error('protected capture'); },
        pending: () => !!draft,
        flush: async () => { if (failure === 'throw') throw Error('flush failure'); return false; },
      });
      await assert.rejects(() => save(existing), CloudError);
      noWrites(); notSaved();
      assert.equal(JSON.stringify(useDocumentStore.getState().map), before);
      assert.equal(useCloudStore.getState().cloudMapId, existing ? 'old-map' : null);
      assert.equal(hasPendingMdEdits(), true);
      assert.equal(useCloudStore.getState().busy, 'idle');
      pass(name + ': ' + failure + ' preserves draft, forbids writes/false saved');
    }

    for (const transition of ['epoch', 'mapId']) {
      reset(existing);
      let release!: () => void;
      const wait = new Promise<void>(resolve => { release = resolve; });
      let pending = true;
      unregister = registerMdExitGuard({ pending: () => pending, flush: async () => { await wait; pending = false; return true; } });
      const waiting = save(existing);
      assert.equal(useCloudStore.getState().busy, 'saving'); noWrites();
      if (transition === 'epoch') useDocumentStore.getState().loadMap(sample('replacement document'), { resetHistory: true });
      else useCloudStore.getState().link('replacement-map', 'replacement-time', { title: 'replacement title' });
      const expectedMap = JSON.stringify(useDocumentStore.getState().map);
      const expectedId = useCloudStore.getState().cloudMapId;
      const expectedOrigin = useDocumentStore.getState().docOrigin;
      const expectedTitle = useCloudStore.getState().cloudTitle;
      release(); await assert.rejects(() => waiting, CloudError);
      noWrites(); notSaved();
      assert.equal(JSON.stringify(useDocumentStore.getState().map), expectedMap);
      assert.equal(useCloudStore.getState().cloudMapId, expectedId);
      assert.equal(useDocumentStore.getState().docOrigin, expectedOrigin);
      assert.equal(useCloudStore.getState().cloudTitle, expectedTitle);
      pass(name + ': ' + transition + ' during flush aborts without relinking');
    }

    reset(existing);
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    let duplicatePending = true, calls = 0;
    unregister = registerMdExitGuard({ pending: () => duplicatePending, flush: async () => { calls++; await wait; duplicatePending = false; return true; } });
    const first = save(existing);
    await assert.rejects(() => save(existing), CloudError);
    await assert.rejects(() => save(!existing), CloudError);
    assert.equal(calls, 1); noWrites();
    assert.equal(useCloudStore.getState().busy, 'saving');
    release(); await first;
    assert.equal(puts.length, 1); assert.equal(posts.length, existing ? 0 : 1);
    assert.equal(useCloudStore.getState().busy, 'idle');
    pass(name + ': duplicates cannot clear busy or issue duplicate writes');
  }

  reset(true); setViewerLocked(true);
  let prepared = 0;
  unregister = registerMdExitGuard({ prepare: () => { prepared++; }, pending: () => true, flush: async () => true });
  await assert.rejects(() => saveCurrentMap(), (error: any) => error instanceof CloudError && error.status === 403);
  assert.equal(prepared, 0); noWrites(); notSaved();
  pass('readonly current save still rejects before touching drafts');

  reset(true);
  unregister = registerMdExitGuard({ pending: () => false, prepare: () => { setViewerLocked(true); }, flush: async () => true });
  await assert.rejects(() => saveCurrentMap(), (error: any) => error.status === 403);
  noWrites(); notSaved();
  pass('readonly acquired during flush still forbids current save');

  reset(false); useDocumentStore.getState().closeMap();
  await assert.rejects(() => saveNewMap(opts), CloudError); noWrites();
  pass('empty new document remains unsaveable');

  reset(true);
  unregister = registerMdExitGuard({ pending: () => false, prepare: () => { useCloudStore.getState().setBusy('opening'); }, flush: async () => true });
  cloudApi.saveDocument = async () => { throw Error('synthetic PUT failure'); };
  await assert.rejects(() => saveCurrentMap(), /synthetic PUT failure/);
  assert.equal(useCloudStore.getState().busy, 'opening'); notSaved();
  pass('finally does not clear another opening operation');
  assert.equal(httpCalls, 0);
  console.log('PASS mapSessionMdSave: ' + passed + ' cases; HTTP requests 0');
} finally {
  unregister?.(); setViewerLocked(false);
  Object.assign(cloudApi, originals);
  globalThis.fetch = oldFetch;
  if (oldWindow === undefined) delete (globalThis as any).window;
  else (globalThis as any).window = oldWindow;
}
