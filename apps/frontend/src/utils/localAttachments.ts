import { isLocalAttachmentUrl, parseLocalAttachmentUrl, validLocalRootId, validLocalSegment, localScheme } from '@emm/localAttachmentUrl';
export { isLocalAttachmentUrl, localRootId, hasLocalScheme } from '@emm/localAttachmentUrl';
import { authEnabled, captureAuthIdentity, isAuthIdentityCurrent, useAuthStore, type AuthIdentity } from '@/stores/authStore';
export type LocalFolderState = Readonly<{
    status: 'loading' | 'connected' | 'disconnected' | 'unsupported';
    rootId?: string;
    name?: string;
}>;
type Reason = 'disconnected' | 'missing' | 'unsupported' | 'changed' | 'unapproved' | 'failed';
type Dir = FileSystemDirectoryHandle & {
    queryPermission(o: {
        mode: 'read';
    }): Promise<PermissionState>;
    keys(): AsyncIterableIterator<string>;
};
type Pickers = Window & {
    showDirectoryPicker(o: {
        mode: 'read';
    }): Promise<Dir>;
    showOpenFilePicker(o: {
        multiple: boolean;
        startIn: Dir;
    }): Promise<FileSystemFileHandle[]>;
};
type Root = {
    id: string;
    name: string;
    handle?: Dir;
    approvedPaths?: string[];
};
type RecordValue = {
    defaultId?: string;
    roots: Root[];
};
class LocalError extends Error {
    constructor(readonly reason: Reason, readonly identity = captureAuthIdentity()) {
        super(`LOCAL_ATTACHMENT_${reason.toUpperCase()}`);
    }
}
function check(id: AuthIdentity) {
    if (!isAuthIdentityCurrent(id))
        throw new LocalError('changed', id);
}
// Derived maps can contain plaintext instead of the original local reference.
// Retain their identity out-of-band; never serialize an owner or credentials.
const exportOwners = new WeakMap<object, AuthIdentity>();
export function captureExportGuard(source: object) {
    const id = exportOwners.get(source) ?? captureAuthIdentity();
    check(id);
    return (derived?: object) => { check(id); if (derived) exportOwners.set(derived,id); };
}
function scope(s: ReturnType<typeof useAuthStore.getState>) {
    return s.session?.userId ? 'user:' + s.session.userId : s.guest ? 'guest' : !authEnabled ? 'dev' : undefined;
}
function supported() {
    return typeof window !== 'undefined' && typeof indexedDB !== 'undefined' && typeof (window as unknown as Pickers).showDirectoryPicker === 'function' && typeof (window as unknown as Pickers).showOpenFilePicker === 'function';
}
const loading: LocalFolderState = { status: 'loading' }, disconnected: LocalFolderState = { status: 'disconnected' }, unsupported: LocalFolderState = { status: 'unsupported' };
let record: RecordValue = { roots: [] };
const states = new Map<string, LocalFolderState>();
const listeners = new Set<() => void>();
let initialized = false, started = false, pending: Promise<void> | undefined;
const emit = () => {
    for (const fn of listeners)
        fn();
};
export function subscribeLocalFolders(cb: () => void) {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}
export function getLocalFolderState(rootId?: string): LocalFolderState {
    return !supported() ? unsupported : states.get((rootId ?? record.defaultId ?? '').toLowerCase()) ?? (initialized ? disconnected : loading);
}
function state(r: Root, ok: boolean) {
    const status = ok ? 'connected' : 'disconnected';
    const prev = states.get(r.id);
    if (prev?.status !== status || prev.name !== r.name) {
        states.set(r.id, Object.freeze({ status, rootId: r.id, name: r.name }));
        emit();
    }
}
// Serialize the entire IDB transaction, including commit and identity cleanup.
let tail = Promise.resolve();
function queue<T>(op: () => Promise<T>): Promise<T> {
    const result = tail.then(op);
    tail = result.then(() => {
    }, () => {
    });
    return result;
}
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
    return dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open('emm.local-folders.v1', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('accounts');
        r.onsuccess = () => {
            const db = r.result;
            db.onversionchange = () => {
                db.close();
                dbPromise = undefined;
            };
            resolve(db);
        };
        r.onerror = () => reject(r.error);
    }).catch(e => {
        dbPromise = undefined;
        throw e;
    });
}
async function storage(key: string, action: 'get' | 'put' | 'delete', value?: RecordValue, id?: AuthIdentity): Promise<RecordValue | undefined> {
    const db = await database();
    if (id)
        check(id);
    return new Promise((resolve, reject) => {
        const tx = db.transaction('accounts', action === 'get' ? 'readonly' : 'readwrite'), s = tx.objectStore('accounts');
        const req = action === 'get' ? s.get(key) : action === 'put' ? s.put(value, key) : s.delete(key);
        tx.oncomplete = () => resolve(action === 'get' ? req.result : undefined);
        tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('LOCAL_FOLDER_STORAGE'));
    });
}
const find = (rid?: string) => record.roots.find(r => r.id === rid);
function bound(id: AuthIdentity, r: Root) {
    check(id);
    if (!r.handle || find(r.id) !== r)
        throw new LocalError('disconnected', id);
}
async function permission(r: Root, id: AuthIdentity) {
    bound(id, r);
    let ok = false;
    try {
        ok = await r.handle!.queryPermission({ mode: 'read' }) === 'granted';
    }
    catch {
    }
    bound(id, r);
    state(r, ok);
    if (!ok)
        throw new LocalError('disconnected', id);
}
function start() {
    if (started)
        return;
    started = true;
    useAuthStore.subscribe((now, prev) => {
        if (now.generation === prev.generation && scope(now) === scope(prev))
            return;
        const old = scope(prev);
        record = { roots: [] };
        states.clear();
        pending = undefined;
        initialized = false;
        if (old && typeof indexedDB !== 'undefined')
            void queue(() => storage(old, 'delete')).catch(() => {
            });
        emit();
        void initializeLocalFolders().catch(() => {
        });
    });
    if (typeof document !== 'undefined')
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                const id = captureAuthIdentity();
                for (const r of record.roots)
                    if (r.handle)
                        void permission(r, id).catch(() => {
                        });
            }
        });
}
export function initializeLocalFolders(): Promise<void> {
    start();
    if (initialized)
        return Promise.resolve();
    if (pending)
        return pending;
    const id = captureAuthIdentity(), key = scope(useAuthStore.getState());
    if (!key || !supported()) {
        initialized = true;
        emit();
        return Promise.resolve();
    }
    pending = (async () => {
        try {
            const saved = await queue(() => storage(key, 'get', undefined, id));
            check(id);
            record = { defaultId: saved?.defaultId, roots: (saved?.roots ?? []).filter(r => validLocalRootId(r.id)) };
            for (const r of record.roots) {
                check(id);
                if (!r.handle)
                    state(r, false);
                else
                    try {
                        await permission(r, id);
                    }
                    catch {
                        check(id);
                    }
            }
        }
        finally {
            if (isAuthIdentityCurrent(id)) {
                initialized = true;
                pending = undefined;
                emit();
            }
        }
    })();
    return pending;
}
function editable() {
    start();
    if (!supported())
        throw new LocalError('unsupported');
    const key = scope(useAuthStore.getState());
    if (!key)
        throw new LocalError('disconnected');
    return { id: captureAuthIdentity(), key };
}
export async function connectLocalFolder(rootId?: string): Promise<LocalFolderState> {
    const { id, key } = editable();
    if (rootId !== undefined && !validLocalRootId(rootId))
        throw new LocalError('failed', id);
    const dir = await (window as unknown as Pickers).showDirectoryPicker({ mode: 'read' });
    check(id);
    await initializeLocalFolders();
    check(id);
    const ok = await dir.queryPermission({ mode: 'read' });
    check(id);
    if (ok !== 'granted')
        throw new LocalError('disconnected', id);
    const result = await queue(async () => {
        check(id);
        let rid = rootId?.toLowerCase();
        const old = find(rid ?? record.defaultId);
        let approvedPaths: string[] = [];
        if (old) {
            const same = old.handle ? await old.handle.isSameEntry(dir) : old.name === dir.name;
            check(id);
            if (rid && !same)
                throw new LocalError('changed', id);
            if (same) {
                rid = old.id;
                if (old.handle) approvedPaths = old.approvedPaths ?? [];
            }
        }
        rid ??= crypto.randomUUID();
        const r = { id: rid, name: dir.name, handle: dir, approvedPaths };
        const next = { defaultId: rid, roots: [...record.roots.filter(x => x.id !== rid), r] };
        await storage(key, 'put', next, id);
        check(id);
        record = next;
        state(r, true);
        emit();
        return getLocalFolderState(rid);
    });
    check(id);
    return result;
}
export async function disconnectLocalFolder(rootId?: string): Promise<void> {
    const { id, key } = editable();
    await initializeLocalFolders();
    check(id);
    await queue(async () => {
        check(id);
        const old = find(rootId?.toLowerCase() ?? record.defaultId);
        if (!old)
            return;
        const r = { id: old.id, name: old.name };
        record = { ...record, roots: record.roots.map(x => x === old ? r : x) };
        state(r, false);
        await storage(key, 'put', record, id);
        check(id);
    });
    check(id);
}
// A directory permits lookup, not arbitrary disclosure. Each file path must have
// been explicitly picked on this device, under this account and directory.
async function grantPaths(id: AuthIdentity, key: string, root: Root, paths: string[]) {
    await queue(async () => {
        bound(id,root);
        const approvedPaths = [...new Set([...(root.approvedPaths ?? []), ...paths])];
        const next = { ...record, roots: record.roots.map(r => r === root ? {...root, approvedPaths} : r) };
        await storage(key,'put',next,id);
        bound(id,root);
        // Keep this handle binding's object identity stable for concurrent reads.
        root.approvedPaths = approvedPaths;
    });
    bound(id,root);
}
export async function approveLocalAttachment(url: string): Promise<void> {
    const {id,key} = editable(), ref = parseLocalAttachmentUrl(url);
    if (!ref) throw new LocalError('failed',id);
    const root = find(ref.root);
    if (!root?.handle || getLocalFolderState(root.id).status !== 'connected') throw new LocalError('disconnected',id);
    const picks = await (window as unknown as Pickers).showOpenFilePicker({multiple:false,startIn:root.handle});
    bound(id,root);
    if (picks.length !== 1) throw new LocalError('unapproved',id);
    await permission(root,id); bound(id,root);
    const actual = await root.handle.resolve(picks[0]); bound(id,root);
    if (actual?.length !== ref.path.length || !actual.every((part,i) => part === ref.path[i])) throw new LocalError('unapproved',id);
    await grantPaths(id,key,root,[ref.path.join('/')]); bound(id,root);
}
export async function pickLocalAttachments(): Promise<Array<{
    name: string;
    url: string;
    size: number;
    kind: 'file' | 'audio' | 'video';
}>> {
    const { id, key } = editable(), root = find(record.defaultId);
    if (!root?.handle || getLocalFolderState().status !== 'connected')
        throw new LocalError('disconnected', id);
    const handles = await (window as unknown as Pickers).showOpenFilePicker({ multiple: true, startIn: root.handle });
    bound(id, root);
    await permission(root, id);
    bound(id, root);
    const result = [];
    for (const h of handles) {
        const path = await root.handle.resolve(h);
        bound(id, root);
        if (!path?.length || !path.every(validLocalSegment))
            throw new LocalError('failed', id);
        const f = await h.getFile();
        bound(id, root);
        if (f.name !== path[path.length - 1])
            throw new LocalError('changed', id);
        const url = localScheme + root.id + '/' + path.map(encodeURIComponent).join('/');
        if (!isLocalAttachmentUrl(url))
            throw new LocalError('failed', id);
        const kind = f.type.startsWith('audio/') ? 'audio' : f.type.startsWith('video/') ? 'video' : 'file';
        result.push({ name: f.name, url, size: f.size, kind } as const);
    }
    await grantPaths(id,key,root,result.map(a => parseLocalAttachmentUrl(a.url)!.path.join('/')));
    bound(id,root);
    return result;
}
export async function readLocalAttachment(url: string): Promise<File> {
    const { id } = editable(), ref = parseLocalAttachmentUrl(url);
    if (!ref)
        throw new LocalError('failed', id);
    await initializeLocalFolders();
    check(id);
    const root = find(ref.root);
    if (!root?.handle)
        throw new LocalError('disconnected', id);
    await permission(root, id);
    bound(id, root);
    if (!root.approvedPaths?.includes(ref.path.join('/'))) throw new LocalError('unapproved',id);
    try {
        let dir: FileSystemDirectoryHandle = root.handle;
        for (const part of ref.path.slice(0, -1)) {
            dir = await dir.getDirectoryHandle(part);
            bound(id, root);
        }
        const handle = await dir.getFileHandle(ref.path[ref.path.length - 1]);
        bound(id, root);
        const f = await handle.getFile();
        bound(id, root);
        return f;
    }
    catch (e) {
        bound(id, root);
        const name = (e as DOMException)?.name;
        if (name === 'NotFoundError' || name === 'TypeMismatchError') {
            // Probe just one entry on lookup failure, never enumerate or index a tree.
            try {
                const keys = root.handle.keys();
                try {
                    await keys.next();
                }
                finally {
                    await keys.return?.();
                }
            }
            catch {
                bound(id, root);
                state(root, false);
                throw new LocalError('disconnected', id);
            }
            bound(id, root);
            throw new LocalError('missing', id);
        }
        if (name === 'NotAllowedError' || name === 'SecurityError') {
            state(root, false);
            throw new LocalError('disconnected', id);
        }
        throw new LocalError('failed', id);
    }
}
export async function readLocalAttachmentBytes(url: string, remaining = 20 * 1024 * 1024, signal?: AbortSignal) {
    const id = captureAuthIdentity();
    signal?.throwIfAborted();
    const f = await readLocalAttachment(url);
    check(id);
    signal?.throwIfAborted();
    if (!Number.isSafeInteger(remaining) || remaining < 0 || f.size > Math.min(remaining, 20 * 1024 * 1024))
        throw new Error('PROTECTED_ASSET_LIMIT');
    const b = await f.arrayBuffer();
    check(id);
    signal?.throwIfAborted();
    return { bytes: new Uint8Array(b), mime: f.type || 'application/octet-stream' };
}
export function notifyLocalAttachmentError(error: unknown, url: string, retry?: () => void): void {
    const id = error instanceof LocalError ? error.identity : captureAuthIdentity();
    if (!isAuthIdentityCurrent(id) || typeof window === 'undefined' || (error as DOMException)?.name === 'AbortError')
        return;
    const reason = error instanceof LocalError ? error.reason : 'failed';
    window.dispatchEvent(new CustomEvent('emm:local-attachment-error', { detail: { reason, url, retry: retry ? () => {
                if (isAuthIdentityCurrent(id))
                    retry();
            } : undefined } }));
}
