import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { setTimeout as watchdog, clearTimeout as cancelWatchdog } from 'node:timers';
import { useAuthStore, authEnabled } from '@/stores/authStore';
import { createMdAutosaver, saveMd, type MdTarget } from './mdSession';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { openAttachment, setMdDockAvailable } from './openAttachment';
import { createMdFrameLoadGate, readMdFrameSnapshot } from './mdFrameLoad';
import { hasPendingMdEdits, flushMdExits } from './mdExitGuard';

// No real attachments, credentials, clocks, or HTTP endpoints are used.
const target: MdTarget = { kind: 'server', att: 'synthetic-md-autosave', name: 'synthetic.md' };
const originalFetch = globalThis.fetch;
const originalAuth = { session: useAuthStore.getState().session, guest: useAuthStore.getState().guest };
const authPersistence = useAuthStore.persist;
const originalAuthStorage = authPersistence?.getOptions().storage;
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalReadOnly = useCloudStore.getState().readOnlyInfo;
const originalSize = useDocumentStore.getState().setServerAttachmentSize;
const originalEpoch = useDocumentStore.getState().docEpoch;
const nextDocument = () => useDocumentStore.setState(state => ({ docEpoch: state.docEpoch + 1 }));
const timers = new Map<number, () => void>();
let timerId = 0;
let sizes = 0;
let requests: { body: string; base: string | null }[] = [];
let respond: () => Promise<Response> = async () => new Response('', { status: 200 });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const ok = () => new Response('', { status: 200 });
type State = 'saving' | 'saved' | { error: string };
const fixture = () => {
  requests = []; sizes = 0; timers.clear();
  const events: { state: State; markdown?: string }[] = [];
  const saver = createMdAutosaver(target, (state, markdown) => events.push({ state, markdown }), { markdown: 'baseline', base: 'initial-sha' });
  return { saver, events, acks: () => events.filter(e => e.state === 'saved').map(e => e.markdown) };
};
// Signals determine readiness. The real timer only diagnoses a deadlocked fixture;
// it is not a polling interval or a success criterion, and is separate from fake UI timers.
const observe = <T>(promise: Promise<T>, label: string): Promise<T> => new Promise((resolve, reject) => {
  const timer = watchdog(() => reject(new Error('Missing synthetic signal: ' + label)), 5000);
  promise.then(value => { cancelWatchdog(timer); resolve(value); }, error => { cancelWatchdog(timer); reject(error); });
});
const requestWaiters = new Set<{ count: number; resolve: () => void }>();
const requestStarted = (count: number): Promise<void> => {
  if (requests.length >= count) return Promise.resolve();
  const signal = deferred<void>();
  const waiter = { count, resolve: () => signal.resolve(undefined) };
  requestWaiters.add(waiter);
  return observe(signal.promise, 'attachment PUT ' + count).finally(() => requestWaiters.delete(waiter));
};
const targetChanged = (name: string): Promise<void> => {
  const signal = deferred<void>();
  const unsubscribe = useEditorUiStore.subscribe(state => { if (state.mdDock?.name === name) signal.resolve(undefined); });
  if (useEditorUiStore.getState().mdDock?.name === name) signal.resolve(undefined);
  return observe(signal.promise, 'MD target ' + name).finally(unsubscribe);
};
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
  setTimeout(fn: () => void) { const id = ++timerId; timers.set(id, fn); return id; },
  clearTimeout(id: number) { timers.delete(id); },
} });
// Explicitly isolate auth bootstrap even when VITE_SUPABASE_* is enabled in image builds.
// Node versions differ in browser storage availability; never use real persisted credentials.
authPersistence?.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
useAuthStore.setState({ session: null, guest: false });
assert.equal(useAuthStore.getState().session, null);
console.log('PASS isolated auth fixture (' + (authEnabled ? 'enabled' : 'disabled') + ')');
useCloudStore.getState().setReadOnlyInfo(null);
useDocumentStore.setState({ setServerAttachmentSize: () => { sizes++; } });
globalThis.fetch = async (input, init) => {
  assert(String(input).endsWith('/v1/attachments/synthetic-md-autosave/content'));
  assert.equal(init?.method, 'PUT');
  requests.push({ body: new TextDecoder().decode(init?.body as Uint8Array), base: new Headers(init?.headers).get('If-Match') });
  for (const waiter of requestWaiters) if (requests.length >= waiter.count) waiter.resolve();
  return respond();
};
try {
  {
    requests = []; timers.clear(); let captures = 0;
    const saver = createMdAutosaver(target, () => {}, { markdown: 'readonly original', readOnly: true }, () => { captures++; return 'readonly iframe draft'; });
    saver.change('readonly external change');
    assert.equal(await saver.now(), true);
    assert.equal(hasPendingMdEdits(), false);
    assert.equal(await flushMdExits(), true);
    assert.equal(captures, 0); assert.equal(requests.length, 0); assert.equal(timers.size, 0);
    assert.equal(saver.latest, 'readonly original'); saver.dispose();
    console.log('PASS readonly saver ignores change/capture, performs zero fetches and permits exit');
  }
  {
    requests = []; respond = async () => ok();
    const gate = createMdFrameLoadGate();
    const child = { MDE: { markdown: 'DEFAULT SAMPLE', getHostSnapshot(nonce: string) { return nonce === gate.nonce ? this.markdown : null; } } };
    const saver = createMdAutosaver(target, () => {}, { markdown: 'original attachment' }, () => readMdFrameSnapshot(gate, child));
    assert.equal(await saver.now(), true); assert.equal(requests.length, 0);
    const nonce = gate.begin('original attachment');
    assert.equal(await saver.now(), true); assert.equal(requests.length, 0);
    child.MDE.markdown = 'original attachment';
    assert.equal(gate.accept({ loadNonce: nonce, markdown: 'original attachment' }), true);
    assert.equal(await saver.now(), true); assert.equal(requests.length, 0);
    child.MDE.markdown = 'first real edit';
    assert.equal(await saver.now(), true); assert.deepEqual(requests.map(r => r.body), ['first real edit']);
    saver.dispose();
    console.log('PASS no sample/default capture is saved before exact initialization ACK');
  }
  {
    requests = []; respond = async () => ok();
    const gate = createMdFrameLoadGate();
    const nonce = gate.begin('original attachment');
    assert.equal(gate.accept({ loadNonce: nonce, markdown: 'original attachment' }), true);
    const child = { MDE: { getHostSnapshot: () => null, get markdown(): string { throw new Error('Protected plaintext must not be captured'); } }, flushPendingEdits() { throw new Error('Protected frame must not be directly flushed'); } };
    const saver = createMdAutosaver(target, () => {}, { markdown: 'original attachment' }, () => readMdFrameSnapshot(gate, child));
    assert.equal(await saver.now(), true);
    assert.equal(await flushMdExits(), true);
    assert.equal(requests.length, 0);
    assert.equal(saver.latest, 'original attachment');
    saver.dispose();
    console.log('PASS protected/detached frame capture never reads plaintext or PUTs it into the previous attachment');
  }

  for (const kind of ['dirty-protected', 'cached-without-safe-api'] as const) {
    requests = []; respond = async () => ok();
    const gate = createMdFrameLoadGate();
    const nonce = gate.begin('original attachment'); gate.accept({ loadNonce: nonce, markdown: 'original attachment' });
    const child = { MDE: { getHostSnapshot: kind === 'dirty-protected' ? () => { throw new Error('MD_FRAME_DETACHED_DIRTY'); } : undefined,
      get markdown(): string { throw new Error('Raw plaintext must not be read'); } }, flushPendingEdits() { throw new Error('Unsafe direct flush'); } };
    const events: State[] = [];
    const saver = createMdAutosaver(target, state => events.push(state), { markdown: 'original attachment' }, () => readMdFrameSnapshot(gate, child));
    assert.equal(await saver.now(), false); assert.equal(hasPendingMdEdits(), true); assert.equal(await flushMdExits(), false);
    assert.equal(requests.length, 0); assert.equal(saver.latest, 'original attachment'); assert.equal(events.includes('saved'), false);
    saver.dispose(); console.log('PASS ' + kind + ' preserves draft, blocks parent save/exit, reads no plaintext and performs zero PUTs');
  }

  {
    requests = []; respond = async () => ok();
    const saver = createMdAutosaver(target, () => {}, { markdown: 'baseline' }, () => 'typed before 400ms message');
    assert.equal(await saver.now(), true);
    assert.deepEqual(requests.map(r => r.body), ['typed before 400ms message']);
    saver.dispose();
    console.log('PASS direct now captures the latest iframe draft before close/move without waiting for change debounce');
  }
  {
    requests = []; respond = async () => { throw new TypeError('synthetic MD1 failure'); };
    const first = { kind: 'server' as const, att: 'synthetic-md-autosave', name: 'MD1.md' };
    useEditorUiStore.getState().setMdDock(first); setMdDockAvailable(true);
    let captureText = 'MD1 unsaved draft';
    const failed = deferred<void>();
    const saver = createMdAutosaver(first, state => { if (typeof state === 'object') failed.resolve(undefined); }, { markdown: 'baseline' }, () => captureText);
    openAttachment('MD2.md', '/v1/attachments/synthetic-md2');
    await requestStarted(1); await observe(failed.promise, 'failed MD1 save settled');
    assert.deepEqual(useEditorUiStore.getState().mdDock, first);
    assert.equal(saver.latest, 'MD1 unsaved draft');
    captureText = 'MD1 newest draft'; respond = async () => ok();
    const switched = targetChanged('MD2.md');
    openAttachment('MD2.md', '/v1/attachments/synthetic-md2');
    await switched;
    assert.deepEqual(requests.map(r => r.body), ['MD1 unsaved draft', 'MD1 newest draft']);
    assert.equal(requests.length, 2);
    saver.dispose(); setMdDockAvailable(false); useEditorUiStore.getState().setMdDock(null);
    console.log('PASS failed MD1 blocks MD2 target switch; restored retry saves MD1 newest text before switching');
  }
  {
    requests = []; sizes = 0; respond = async () => ok();
    // Even the isolated null-token helper yields at await. Switch documents
    // before its continuation, without real auth credentials or refresh calls.
    const saving = saveMd(target, 'old document before token', 'initial-sha');
    nextDocument();
    assert.deepEqual(await saving, { ok: false, error: 'gone' });
    assert.equal(requests.length, 0); assert.equal(sizes, 0);
    console.log('PASS document switch during token await prevents a late PUT and size update');
  }
  {
    requests = []; sizes = 0; timers.clear(); respond = async () => ok();
    const started = deferred<void>();
    const events: { state: State; markdown?: string }[] = [];
    const saver = createMdAutosaver(target, (state, markdown) => {
      events.push({ state, markdown });
      if (state === 'saving') started.resolve(undefined);
    }, { markdown: 'baseline' });
    saver.change('old token draft'); const saving = saver.now();
    await observe(started.promise, 'save entering token await');
    nextDocument();
    assert.equal(await saving, false);
    assert.equal(requests.length, 0); assert.equal(sizes, 0);
    assert.equal(saver.latest, 'old token draft');
    assert.deepEqual(events.filter(e => e.state === 'saved'), []);
    assert.deepEqual(events.at(-1)?.state, { error: 'gone' });
    assert.equal(timers.size, 0); assert.equal(await saver.now(), false);
    saver.dispose();
    console.log('PASS token-boundary abort keeps draft/error and never emits saved or retries');
  }
  for (const result of ['success', 'conflict', 'network'] as const) {
    const f = fixture(), blocked = deferred<Response>(); respond = () => blocked.promise;
    f.saver.change('old PUT draft'); const saving = f.saver.now();
    await requestStarted(1);
    assert.equal(requests[0].base, '"sha256:initial-sha"');
    f.saver.change('newest old document draft');
    nextDocument();
    if (result === 'network') blocked.reject(new TypeError('synthetic stale PUT rejection'));
    else blocked.resolve(result === 'success' ? ok() : new Response('', { status: 412 }));
    assert.equal(await saving, false);
    assert.equal(sizes, 0); assert.deepEqual(f.acks(), []);
    assert.equal(f.saver.latest, 'newest old document draft');
    assert.deepEqual(f.events.at(-1)?.state, { error: 'gone' });
    assert.equal(timers.size, 0);
    assert.equal(await f.saver.now(), false);
    f.saver.change('late old frame message');
    await turn(); assert.equal(requests.length, 1); assert.equal(timers.size, 0);
    assert.equal(f.saver.latest, 'newest old document draft');
    f.saver.dispose();
  }
  console.log('PASS late PUT success/failure cannot ACK or resize the next document, and preserves the newest failed draft');
  {
    const f = fixture(); respond = async () => ok();
    const hashing = deferred<void>(), blocked = deferred<ArrayBuffer>();
    const digestDescriptor = Object.getOwnPropertyDescriptor(crypto.subtle, 'digest');
    Object.defineProperty(crypto.subtle, 'digest', { configurable: true, value: () => {
      hashing.resolve(undefined); return blocked.promise;
    } });
    try {
      f.saver.change('old hash draft'); const saving = f.saver.now();
      await observe(hashing.promise, 'SHA-256 after successful PUT');
      nextDocument(); blocked.resolve(new ArrayBuffer(32));
      assert.equal(await saving, false);
      assert.equal(sizes, 0); assert.deepEqual(f.acks(), []);
      assert.equal(f.saver.latest, 'old hash draft');
      assert.deepEqual(f.events.at(-1)?.state, { error: 'gone' });
      assert.equal(await f.saver.now(), false);
      assert.equal(requests.length, 1); assert.equal(timers.size, 0);
    } finally {
      if (digestDescriptor) Object.defineProperty(crypto.subtle, 'digest', digestDescriptor);
      else Reflect.deleteProperty(crypto.subtle, 'digest');
      f.saver.dispose();
    }
    console.log('PASS document switch during deferred hash blocks size mutation and saved ACK');
  }
  {
    const f = fixture(); respond = async () => ok();
    // A synchronous store subscriber can change the epoch just as saveMd
    // finishes. The autosaver must also validate after awaiting saveMd.
    useDocumentStore.setState({ setServerAttachmentSize: () => { nextDocument(); } });
    try {
      f.saver.change('completion boundary');
      assert.equal(await f.saver.now(), false);
      assert.deepEqual(f.acks(), []); assert.equal(f.saver.latest, 'completion boundary');
      assert.deepEqual(f.events.at(-1)?.state, { error: 'gone' });
      assert.equal(timers.size, 0);
    } finally {
      useDocumentStore.setState({ setServerAttachmentSize: () => { sizes++; } });
      f.saver.dispose();
    }
    console.log('PASS autosaver rechecks epoch after saveMd before acknowledging its snapshot');
  }
  {
    const f = fixture(); f.saver.change('baseline'); nextDocument();
    assert.equal(await f.saver.now(), false);
    assert.deepEqual(f.acks(), []); assert.equal(requests.length, 0); assert.equal(sizes, 0);
    assert.deepEqual(f.events.at(-1)?.state, { error: 'gone' });
    assert.equal(timers.size, 0); f.saver.dispose();
    console.log('PASS old-document baseline shortcut cannot emit a fake clean ACK');
  }
  requests = []; sizes = 0;
  respond = async () => { throw new TypeError('synthetic network rejection'); };
  assert.deepEqual(await saveMd(target, 'network'), { ok: false, error: 'network' });
  assert.equal(sizes, 0);
  console.log('PASS rejected fetch returns network failure without success-side metadata changes');
  const fetchMock = globalThis.fetch;
  globalThis.fetch = () => { throw new TypeError('synthetic synchronous fetch throw'); };
  assert.deepEqual(await saveMd(target, 'sync network'), { ok: false, error: 'network' });
  globalThis.fetch = fetchMock;
  console.log('PASS synchronous fetch throws also return explicit network failure');

  {
    const f = fixture(); f.saver.change('retry me');
    assert.equal(await f.saver.now(), false);
    assert.equal(f.saver.latest, 'retry me');
    assert.deepEqual(f.acks(), []);
    assert.deepEqual(f.events.at(-1), { state: { error: 'network' }, markdown: undefined });
    assert.equal(timers.size, 0);
    await turn(); assert.equal(requests.length, 1);
    respond = async () => ok();
    assert.equal(await f.saver.now(), true);
    assert.deepEqual(requests.map(r => r.body), ['retry me', 'retry me']);
    assert.deepEqual(f.acks(), ['retry me']);
    assert.equal(sizes, 1);
    console.log('PASS failure releases busy, retains draft, stops auto-retry and permits explicit retry');
  }

  {
    const f = fixture(), blocked = deferred<Response>(); respond = () => blocked.promise;
    f.saver.change('older'); const first = f.saver.now();
    await requestStarted(1);
    assert.equal(f.saver.latest, 'older');
    f.saver.change('newest');
    blocked.reject(new TypeError('synthetic failure during newer input'));
    assert.equal(await first, false);
    assert.equal(f.saver.latest, 'newest'); assert.equal(timers.size, 0);
    assert.deepEqual(f.acks(), []);
    respond = async () => ok(); assert.equal(await f.saver.now(), true);
    assert.deepEqual(requests.map(r => r.body), ['older', 'newest']);
    assert.deepEqual(f.acks(), ['newest']);
    console.log('PASS newer queued draft wins over failed in-flight snapshot');
  }

  for (const status of [409, 412, 500]) {
    const f = fixture(); respond = async () => new Response('', { status });
    f.saver.change('held ' + status); assert.equal(await f.saver.now(), false);
    assert.equal(f.saver.latest, 'held ' + status); assert.equal(timers.size, 0);
    assert.deepEqual(f.acks(), []); assert.equal(requests.length, 1);
    assert.deepEqual(f.events.at(-1)?.state, { error: status === 500 ? '500' : 'conflict' });
    respond = async () => ok(); assert.equal(await f.saver.now(), true);
    assert.deepEqual(f.acks(), ['held ' + status]);
  }
  console.log('PASS conflicts and HTTP failure keep drafts without automatic retry or false ACK');

  {
    const f = fixture(); respond = async () => ok();
    useDocumentStore.setState({ setServerAttachmentSize: () => { throw new Error('synthetic post-fetch dependency failure'); } });
    f.saver.change('unexpected failure'); assert.equal(await f.saver.now(), false);
    assert.equal(f.saver.latest, 'unexpected failure'); assert.equal(timers.size, 0); assert.deepEqual(f.acks(), []);
    useDocumentStore.setState({ setServerAttachmentSize: () => { sizes++; } });
    assert.equal(await f.saver.now(), true); assert.deepEqual(f.acks(), ['unexpected failure']);
    console.log('PASS unexpected save dependency rejection also releases busy and remains retryable');
  }

  {
    const f = fixture(), a = deferred<Response>(), b = deferred<Response>();
    respond = () => requests.length === 1 ? a.promise : b.promise;
    f.saver.change('A'); const n1 = f.saver.now();
    await requestStarted(1);
    f.saver.change('B'); let completed = false;
    const n2 = f.saver.now().then(result => { completed = true; return result; });
    await turn(); assert.equal(completed, false); assert.equal(requests.length, 1);
    a.resolve(ok()); await requestStarted(2);
    assert.equal(completed, false); assert.equal(f.saver.latest, 'B');
    assert.deepEqual(f.acks(), ['A']);
    assert.notEqual(requests[1].base, '"sha256:initial-sha"');
    b.resolve(ok()); assert.deepEqual(await Promise.all([n1, n2]), [true, true]);
    assert.deepEqual(requests.map(r => r.body), ['A', 'B']);
    assert.deepEqual(f.acks(), ['A', 'B']); assert.equal(timers.size, 0);
    console.log('PASS concurrent now calls await serialized in-flight/newest saves with exact snapshot ACK and fresh base');
  }

  {
    const f = fixture(), blocked = deferred<Response>(); respond = () => blocked.promise;
    f.saver.change('will fail'); const first = f.saver.now();
    await requestStarted(1);
    f.saver.change('baseline'); blocked.reject(new TypeError('synthetic rejection'));
    assert.equal(await first, false); assert.equal(f.saver.latest, 'baseline');
    assert.equal(await f.saver.now(), true); assert.equal(requests.length, 1);
    assert.deepEqual(f.acks(), ['baseline']);
    console.log('PASS newer revert to known saved baseline is preserved and never replaced by failed draft');
  }
} finally {
  globalThis.fetch = originalFetch;
  useAuthStore.setState(originalAuth);
  authPersistence?.setOptions({ storage: originalAuthStorage });
  if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
  useCloudStore.getState().setReadOnlyInfo(originalReadOnly);
  useDocumentStore.setState({ setServerAttachmentSize: originalSize, docEpoch: originalEpoch });
}
