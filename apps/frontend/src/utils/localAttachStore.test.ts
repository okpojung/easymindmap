// PC 폴더에 두기 (2026-11-25): 폴더 밖 파일은 `<맵 이름>/` 에 복사, 폴더 안 파일은 위치만 연결.
import assert from 'node:assert/strict';

const kv = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => kv.get(k) ?? null, setItem: (k: string, v: string) => { kv.set(k, String(v)); },
  removeItem: (k: string) => { kv.delete(k); }, clear: () => kv.clear(), key: (i: number) => [...kv.keys()][i] ?? null, get length() { return kv.size; },
} satisfies Storage });
const stored = new Map<string, unknown>();
const db = { createObjectStore() {}, transaction() {
  const tx: { oncomplete: () => void; objectStore: () => unknown } = { oncomplete: () => {}, objectStore() {
    return {
      get(k: string) { const req = { result: stored.get(k) }; queueMicrotask(() => tx.oncomplete()); return req; },
      put(v: unknown, k: string) { queueMicrotask(() => { stored.set(k, v); tx.oncomplete(); }); return {}; },
      delete(k: string) { queueMicrotask(() => { stored.delete(k); tx.oncomplete(); }); return {}; },
    };
  } };
  return tx;
} };
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() { const r: { result: unknown; onsuccess?: () => void } = { result: db }; queueMicrotask(() => r.onsuccess?.()); return r; } } });

let writeGranted = false;
class FakeFile {
  kind = 'file' as const;
  constructor(public name: string, public data: Blob) {}
  async getFile() { return new File([this.data], this.name); }
  async createWritable() { let next: Blob = new Blob([]); return { write: async (b: Blob) => { next = b; }, close: async () => { this.data = next; }, abort: async () => {} }; }
  async isSameEntry(o: unknown) { return o === this; }
}
class FakeDir {
  kind = 'directory' as const;
  entries = new Map<string, FakeDir | FakeFile>();
  constructor(public name: string) {}
  async queryPermission({ mode }: { mode: string }) { return mode === 'read' || writeGranted ? 'granted' : 'prompt'; }
  async requestPermission({ mode }: { mode: string }) { if (mode === 'readwrite') writeGranted = true; return 'granted'; }
  async isSameEntry(o: unknown) { return o === this; }
  async getDirectoryHandle(n: string, o?: { create?: boolean }) {
    const e = this.entries.get(n);
    if (e instanceof FakeDir) return e;
    if (e) throw new DOMException('x', 'TypeMismatchError');
    if (!o?.create) throw new DOMException('x', 'NotFoundError');
    if (!writeGranted) throw new DOMException('x', 'NotAllowedError');
    const d = new FakeDir(n); this.entries.set(n, d); return d;
  }
  async getFileHandle(n: string, o?: { create?: boolean }) {
    const e = this.entries.get(n);
    if (e instanceof FakeFile) return e;
    if (e) throw new DOMException('x', 'TypeMismatchError');
    if (!o?.create) throw new DOMException('x', 'NotFoundError');
    if (!writeGranted) throw new DOMException('x', 'NotAllowedError');
    const f = new FakeFile(n, new Blob([])); this.entries.set(n, f); return f;
  }
  async resolve(h: unknown): Promise<string[] | null> {
    for (const [k, v] of this.entries) {
      if (v === h) return [k];
      if (v instanceof FakeDir) { const p = await v.resolve(h); if (p) return [k, ...p]; }
    }
    return null;
  }
  async *keys() { yield* this.entries.keys(); }
}
const root = new FakeDir('EMM첨부');
const inside = new FakeFile('계약서.pdf', new Blob(['INSIDE']));
root.entries.set('계약서.pdf', inside);
const win = Object.assign(new EventTarget(), {
  showDirectoryPicker: async () => root,
  showOpenFilePicker: async () => [],
  setTimeout, clearTimeout,
});
Object.defineProperty(globalThis, 'window', { configurable: true, value: win });

const local = await import('./localAttachments');

assert.equal(local.safeLocalName('a/b:c*?.pdf'), 'a_b_c__.pdf');
assert.equal(local.safeLocalName('  보고서.  '), '보고서');
assert.equal(local.safeLocalName('CON.txt'), '_CON.txt');
assert.equal(local.safeLocalName('50%af.txt'), '50\uFF05af.txt', 'percent escapes are never valid local URL segments');
assert.equal(local.safeLocalName(''), 'file');
assert.ok(local.safeLocalName('x'.repeat(300) + '.pptx').endsWith('.pptx') && local.safeLocalName('x'.repeat(300) + '.pptx').length === 120);

await local.connectLocalFolder();
assert.equal(local.getLocalFolderState().status, 'connected');
assert.equal(await local.hasLocalWritePermission(), false);

// 쓰기 허용 전: 밖의 파일은 복사하지 않고 'permission'
await assert.rejects(local.storeFileInLocalFolder(new File(['A'], '발표.pptx'), '바이오'), (e) => local.localErrorReason(e) === 'permission');
assert.equal(root.entries.has('바이오'), false);

// 폴더 안 파일: 쓰기 허용 없이도 위치만 연결(복사 없음)
const linked = await local.storeFileInLocalFolder(await inside.getFile(), '바이오', inside as unknown as FileSystemHandle);
assert.equal(linked.copied, false);
assert.equal(linked.name, '계약서.pdf');
assert.deepEqual(local.isLocalAttachmentUrl(linked.url), true);
assert.equal(root.entries.size, 1, 'no copy for files already inside the folder');
assert.equal(await (await local.readLocalAttachment(linked.url)).text(), 'INSIDE');

// 쓰기 허용 후: `<맵 이름>/` 에 복사, 같은 이름은 (2)
assert.equal(await local.requestLocalWritePermission(), true);
const a = await local.storeFileInLocalFolder(new File(['ONE'], '발표.pptx'), '바이오');
const b = await local.storeFileInLocalFolder(new File(['TWO'], '발표.pptx'), '바이오');
assert.equal(a.copied, true);
assert.equal(a.name, '발표.pptx');
assert.equal(b.name, '발표 (2).pptx');
const sub = root.entries.get('바이오') as FakeDir;
assert.deepEqual([...sub.entries.keys()], ['발표.pptx', '발표 (2).pptx']);
assert.equal(await (await local.readLocalAttachment(a.url)).text(), 'ONE');
assert.equal(await (await local.readLocalAttachment(b.url)).text(), 'TWO');
assert.ok(decodeURIComponent(b.url).endsWith('/바이오/발표 (2).pptx'));

// 위험한 맵 이름도 안전한 하위 폴더로
const c = await local.storeFileInLocalFolder(new File(['3'], 'x.txt'), 'A/B: 회의?');
assert.ok(root.entries.has('A_B_ 회의_'));
assert.equal(await (await local.readLocalAttachment(c.url)).text(), '3');

console.log('PASS local attach store: permission gate, link-in-place without copy, copy into map folder, (2) names, safe names, read-back');
