import assert from 'node:assert/strict';
import { readLibraryView, saveLibraryView, pruneLibraryView, libraryEdgeScroll } from './libraryViewState';
const original = { expanded: ['education','child','deleted'], selected: 'child', scrollTop: 745, scrollLeft: 18, query: '' };
saveLibraryView('A', original);
assert.deepEqual(readLibraryView('A'), original, 'unmount/remount retains expansion, selection and scroll');
assert.equal(readLibraryView('B').expanded.length, 0, 'accounts are isolated');
readLibraryView('A').expanded.push('mutation');
assert.deepEqual(readLibraryView('A'), original, 'reads cannot mutate saved state');
const pruned = pruneLibraryView(readLibraryView('A'), new Set(['education','child']));
assert.deepEqual(pruned.expanded, ['education','child']);
assert.equal(pruned.selected, 'child');
assert.equal(pruned.scrollTop, 745);
assert.equal(pruneLibraryView(pruned, new Set()).selected, null, 'deleted selection resets to root');
// Simulated loading and StrictMode re-read do not write or prune anything.
assert.deepEqual(readLibraryView('A'), original);
const box = { left: 100, right: 500, top: 200, bottom: 600 };
assert.ok(libraryEdgeScroll(300, 201, box) < 0);
assert.ok(libraryEdgeScroll(300, 599, box) > 0);
assert.equal(libraryEdgeScroll(300, 400, box), 0);
assert.equal(libraryEdgeScroll(99, 599, box), 0);
assert.equal(libraryEdgeScroll(300, 700, box), 0);
assert.equal(libraryEdgeScroll(300, 599, box, true), 0, 'root drop never scrolls');
// Simulate a reload: no module-memory entry exists for these account keys.
const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
const stored = new Map<string, string>();
const key = (account: string) => 'emm.library-view.v1:' + encodeURIComponent(account);
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
  getItem: (id: string) => stored.get(id) ?? null,
  setItem: (id: string, value: string) => stored.set(id, value),
} });
try {
  stored.set(key('reload'), JSON.stringify(original));
  assert.deepEqual(readLibraryView('reload'), original, 'a fresh module can restore tab storage');
  readLibraryView('reload').expanded.push('mutation');
  assert.deepEqual(readLibraryView('reload'), original, 'stored reads are isolated copies');
  stored.set(key('bad-json'), '{bad');
  assert.deepEqual(readLibraryView('bad-json').expanded, []);
  stored.set(key('bad-shape'), JSON.stringify({ ...original, expanded: [123] }));
  assert.deepEqual(readLibraryView('bad-shape').expanded, []);
  stored.set(key('negative-scroll'), JSON.stringify({ ...original, scrollTop: -1 }));
  assert.equal(readLibraryView('negative-scroll').scrollTop, 0);
  saveLibraryView('persist', original);
  assert.deepEqual(JSON.parse(stored.get(key('persist'))!), original, 'writes retain the whole UI snapshot');
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('storage denied'); } });
  assert.equal(readLibraryView('denied').scrollTop, 0, 'denied storage is safe');
  saveLibraryView('denied', original);
  assert.deepEqual(readLibraryView('denied'), original, 'memory fallback survives denied storage');
} finally {
  if (storageDescriptor) Object.defineProperty(globalThis, 'sessionStorage', storageDescriptor);
  else Reflect.deleteProperty(globalThis, 'sessionStorage');
}
console.log('PASS library view restore/account/pruning/storage/edge-scroll (22 assertions)');
