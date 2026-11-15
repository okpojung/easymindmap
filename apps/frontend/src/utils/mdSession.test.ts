import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
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
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalReadOnly = useCloudStore.getState().readOnlyInfo;
const originalSize = useDocumentStore.getState().setServerAttachmentSize;
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
const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 100 && !predicate(); i++) await turn();
  assert(predicate(), 'synthetic asynchronous operation should start');
};
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: {
  setTimeout(fn: () => void) { const id = ++timerId; timers.set(id, fn); return id; },
  clearTimeout(id: number) { timers.delete(id); },
} });
useCloudStore.getState().setReadOnlyInfo(null);
useDocumentStore.setState({ setServerAttachmentSize: () => { sizes++; } });
globalThis.fetch = async (input, init) => {
  assert(String(input).endsWith('/v1/attachments/synthetic-md-autosave/content'));
  assert.equal(init?.method, 'PUT');
  requests.push({ body: new TextDecoder().decode(init?.body as Uint8Array), base: new Headers(init?.headers).get('If-Match') });
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
    const child = { MDE: { markdown: 'DEFAULT SAMPLE' } };
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
    const saver = createMdAutosaver(first, () => {}, { markdown: 'baseline' }, () => captureText);
    openAttachment('MD2.md', '/v1/attachments/synthetic-md2');
    await waitFor(() => requests.length === 1); await turn();
    assert.deepEqual(useEditorUiStore.getState().mdDock, first);
    assert.equal(saver.latest, 'MD1 unsaved draft');
    captureText = 'MD1 newest draft'; respond = async () => ok();
    openAttachment('MD2.md', '/v1/attachments/synthetic-md2');
    await waitFor(() => useEditorUiStore.getState().mdDock?.name === 'MD2.md');
    assert.deepEqual(requests.map(r => r.body), ['MD1 unsaved draft', 'MD1 newest draft']);
    assert.equal(requests.length, 2);
    saver.dispose(); setMdDockAvailable(false); useEditorUiStore.getState().setMdDock(null);
    console.log('PASS failed MD1 blocks MD2 target switch; restored retry saves MD1 newest text before switching');
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
    await waitFor(() => requests.length === 1);
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
    await waitFor(() => requests.length === 1);
    f.saver.change('B'); let completed = false;
    const n2 = f.saver.now().then(result => { completed = true; return result; });
    await turn(); assert.equal(completed, false); assert.equal(requests.length, 1);
    a.resolve(ok()); await waitFor(() => requests.length === 2);
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
    await waitFor(() => requests.length === 1);
    f.saver.change('baseline'); blocked.reject(new TypeError('synthetic rejection'));
    assert.equal(await first, false); assert.equal(f.saver.latest, 'baseline');
    assert.equal(await f.saver.now(), true); assert.equal(requests.length, 1);
    assert.deepEqual(f.acks(), ['baseline']);
    console.log('PASS newer revert to known saved baseline is preserved and never replaced by failed draft');
  }
} finally {
  globalThis.fetch = originalFetch;
  if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
  useCloudStore.getState().setReadOnlyInfo(originalReadOnly);
  useDocumentStore.setState({ setServerAttachmentSize: originalSize });
}
