import assert from 'node:assert/strict';
import { registerMdExitGuard, hasPendingMdEdits, flushMdExits, afterMdExit } from './mdExitGuard';
import { saveAndCloseMap, openMapHere, refreshFromServer } from '@/services/cloud/mapSession';
import { cloudApi } from '@/services/cloud/apiClient';
import { useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';

assert.equal(hasPendingMdEdits(), false);
let dirty = true, calls = 0;
let release!: (ok: boolean) => void;
const blocked = new Promise<boolean>(resolve => { release = resolve; });
const unregister = registerMdExitGuard({ pending: () => dirty, flush: async () => { calls++; const ok = await blocked; if (ok) dirty = false; return ok; } });
assert.equal(hasPendingMdEdits(), true);
let finished = false;
const waiting = flushMdExits().then(ok => { finished = true; return ok; });
await Promise.resolve(); assert.equal(finished, false); assert.equal(calls, 1);
release(true); assert.equal(await waiting, true); assert.equal(hasPendingMdEdits(), false);
unregister();
console.log('PASS registry awaits asynchronous flush and clears risk only after successful completion');

let prepared = false;
const prepareExit = registerMdExitGuard({ prepare: () => { prepared = true; dirty = true; }, pending: () => dirty, flush: async () => false });
assert.equal(hasPendingMdEdits(), true); assert.equal(prepared, true);
assert.equal(await flushMdExits(), false); prepareExit();
const rejectExit = registerMdExitGuard({ pending: () => true, flush: async () => { throw Error('synthetic failure'); } });
assert.equal(await flushMdExits(), false); rejectExit();
console.log('PASS captured/deferred edits and rejected flushes fail closed without automatic retries');

const before = JSON.stringify({ map: useDocumentStore.getState().map, epoch: useDocumentStore.getState().docEpoch, cloud: useCloudStore.getState().cloudMapId });
const preventExit = registerMdExitGuard({ pending: () => true, flush: async () => false });
const originalGet = cloudApi.getDocument;
let gets = 0;
cloudApi.getDocument = async () => { gets++; throw Error('must never request replacement'); };
try {
  const messages: string[] = [];
  assert.equal(await saveAndCloseMap(message => messages.push(message)), 'failed');
  assert.equal(messages.length, 1);
  await assert.rejects(() => openMapHere('synthetic-new-document'));
  assert.equal(await refreshFromServer('synthetic-current-document'), false);
  assert.equal(gets, 0);
  assert.equal(JSON.stringify({ map: useDocumentStore.getState().map, epoch: useDocumentStore.getState().docEpoch, cloud: useCloudStore.getState().cloudMapId }), before);
  console.log('PASS failed MD exit leaves map, document epoch and cloud linkage unchanged on close/current-tab open');
} finally { cloudApi.getDocument = originalGet; preventExit(); }
assert.equal(hasPendingMdEdits(), false);

let browserOpens = 0;
const keepEditor = registerMdExitGuard({ pending: () => true, flush: async () => false });
assert.equal(await afterMdExit(() => { browserOpens++; }), false);
assert.equal(browserOpens, 0);
keepEditor();
assert.equal(await afterMdExit(() => { browserOpens++; }), true);
assert.equal(browserOpens, 1);
console.log('PASS document library cannot hide an editor with a failed draft; clean exits still open it');
