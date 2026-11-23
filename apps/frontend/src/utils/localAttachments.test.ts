import { fetchServerImageDataUrls } from '@/export/serverImages';
import { buildMarkdownExportPackage } from '@/export/exportMarkdown';
import assert from 'node:assert/strict';
import * as local from './localAttachments';
import { useAuthStore } from '@/stores/authStore';
import { localPreviewMime, openAttachment } from './openAttachment';
import { downloadAttachment } from './downloadAttachment';
import { loadHtmlExportResource } from '@/export/htmlAssetExport';
import { parseHtmlMapFile } from '@/utils/importMapFile';
import { inlineProtectedMapAssets } from '@/export/protectedMapAssets';
import { downloadMapAsEncryptedHtml } from '@/export/encryptedMap';
import { buildPreparedHtmlExport } from '@/export/htmlAssetExport';
import { buildExportPackage, buildStandaloneHtml } from '@/export/exportHtml';
import { prepareHtmlAssets, layoutHtmlAssets } from '@/export/htmlAssetPolicy';
const stored = new Map(), logs: string[] = [];
let onPut: (() => void) | undefined;
const db = { createObjectStore() {
    }, transaction() {
        const tx: any = { objectStore() {
                return { get(k: string) {
                        const req = { result: stored.get(k) };
                        queueMicrotask(() => tx.oncomplete());
                        return req;
                    },
                    put(v: any, k: string) {
                        queueMicrotask(() => {
                            onPut?.();
                            stored.set(k, v);
                            logs.push('put:' + k);
                            tx.oncomplete();
                        });
                        return {};
                    },
                    delete(k: string) {
                        queueMicrotask(() => {
                            stored.delete(k);
                            logs.push('del:' + k);
                            tx.oncomplete();
                        });
                        return {};
                    } };
            } };
        return tx;
    } };
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open() {
            const r: any = { result: db };
            queueMicrotask(() => r.onsuccess());
            return r;
        } } });
const win: any = new EventTarget();
const timers: Function[] = [], clicks: string[] = [];
let blank: any;
win.setInterval = () => 42; win.clearInterval = () => {};
win.setTimeout = (fn: Function) => timers.push(fn);
win.open = () => blank = { location: { href: '' }, closed: false, close() {
        this.closed = true;
    } };
Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
const doc: any = new EventTarget();
doc.createElement = () => ({ getContext: () => null, style: {}, click() {
        clicks.push(this.download);
    }, remove() {
    } });
doc.body = { appendChild() {
    } };
Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
let requests = 0;
globalThis.fetch = async () => {
    requests++;
    throw Error('no network allowed');
};
let selected = 0, opened = 0, reads = 0, probes = 0, path: string[] | null = ['子', '문서.md'], ok = true, removed = false, missing = false;
let file: any = new File(['# a'], '문서.md', { type: 'text/markdown' });
let get = async () => file;
const fh = { getFile: () => {
        reads++;
        return get();
    } };
const notFound = () => new DOMException('', 'NotFoundError');
const root: any = { name: 'chosen', queryPermission: async ({ mode }: any) => {
        assert.equal(mode, 'read');
        return ok ? 'granted' : 'denied';
    }, isSameEntry: async (d: any) => d === root, resolve: async () => path,
    getDirectoryHandle: async () => {
        if (removed)
            throw notFound();
        return root;
    }, getFileHandle: async () => {
        if (missing)
            throw notFound();
        return fh;
    },
    keys() {
        return { async next() {
                probes++;
                if (removed)
                    throw notFound();
                return { done: true };
            }, async return() {
            } };
    } };
win.showDirectoryPicker = (o: any) => {
    selected++;
    assert.deepEqual(o, { mode: 'read' });
    return Promise.resolve(root);
};
win.showOpenFilePicker = (o: any) => {
    opened++;
    assert.equal(typeof o.multiple, "boolean"); assert.equal(o.startIn,root);
    return Promise.resolve([fh]);
};
function login(user: string) {
    useAuthStore.setState(s => ({ generation: s.generation + 1, session: { userId: user } as any, guest: false }));
}
useAuthStore.persist.setOptions({ storage: { getItem: () => null, setItem: () => {
        }, removeItem: () => {
        } } });
login('A');
await local.initializeLocalFolders();
const p = local.connectLocalFolder();
assert.equal(selected, 1);
const connected = await p;
const rid = connected.rootId!, base = 'emm-local://' + rid + '/';
assert.equal(connected.status, 'connected');
assert.equal(connected, local.getLocalFolderState());
assert.deepEqual(Object.keys(connected).sort(), ['name', 'rootId', 'status']);
const picks = local.pickLocalAttachments();
assert.equal(opened, 1);
const [att] = await picks;
assert.deepEqual(att, { name: file.name, url: base + path!.map(encodeURIComponent).join('/'), size: 3, kind: 'file' });
for (const invalid of ['', '.', '..', 'x//y', 'x/', '%2e%2e', '%252e%252e', '%2F', '%5C', '%00', 'file%3Afoo', 'raw?query', 'raw#fragment'])
    assert.equal(local.isLocalAttachmentUrl(base + invalid), false, invalid);
assert.equal(local.localRootId(att.url), rid);
assert.equal(local.isLocalAttachmentUrl('emm-local://not-uuid/name'), false);
assert.equal(local.isLocalAttachmentUrl('https://' + rid + '/filename'), false);
path = null;
const before = reads;
await assert.rejects(local.pickLocalAttachments(), /FAILED/);
assert.equal(reads, before);
assert.equal(await local.readLocalAttachment(att.url), file);
missing = true;
await assert.rejects(local.readLocalAttachment(att.url), /MISSING/);
assert.equal(local.getLocalFolderState().status, 'connected');
removed = true;
await assert.rejects(local.readLocalAttachment(att.url), /DISCONNECTED/);
assert.equal(local.getLocalFolderState().status, 'disconnected');
assert.equal(probes, 2);
missing = removed = false;
ok = false;
await assert.rejects(local.readLocalAttachment(att.url), /DISCONNECTED/);
ok = true;
await local.disconnectLocalFolder();
assert.equal(stored.get('user:A').roots[0].handle, undefined);
await assert.rejects(local.readLocalAttachment(att.url), /DISCONNECTED/);
await local.connectLocalFolder(rid);
const sibling = base+'unpicked.txt';
const beforeApproval = reads;
await assert.rejects(local.readLocalAttachment(att.url),/UNAPPROVED/);
await assert.rejects(local.readLocalAttachmentBytes(sibling),/UNAPPROVED/);
path=['wrong.txt']; await assert.rejects(local.approveLocalAttachment(att.url),/UNAPPROVED/);
assert.equal(reads,beforeApproval);
path=['子','문서.md']; const priorPicker = opened; const approval = local.approveLocalAttachment(att.url); assert.equal(opened,priorPicker+1); await approval;
await local.connectLocalFolder(rid); // isSameEntry proven: keep approvals.
const map: any = { title: 't', root: { id: 'r', text: 'root', attachments: [{ id: 'a', ...att }] }, branches: [] };
const hostile = structuredClone(map); hostile.root.attachments.push({...att,id:'forged',url:sibling});
await assert.rejects(buildExportPackage(hostile),/UNAPPROVED/); // no partial export containing just the approved file
const beforeSource = reads;
const sourcePackage = await buildMarkdownExportPackage(map);
assert.equal(sourcePackage.packaged, 0); assert.ok((await sourcePackage.blob.text()).includes(att.url));
assert.equal(reads, beforeSource);
for (const url of [base+'../x', 'EmM-LoCal://bad/foo', '\x00emm-local://bad/root']) {
    const previous = blank;
    openAttachment('x',url); assert.equal(blank,previous);
    await assert.rejects(downloadAttachment('x',url,{resolveUrl:()=>{throw Error('must not resolve');}}));
}
const html = buildStandaloneHtml(map);
assert.ok(html.includes('localOnly'));
assert.ok(!html.includes('"href":"emm-local:'));
assert.ok(html.includes(att.url));
const prepared = await prepareHtmlAssets(map, loadHtmlExportResource);
assert.equal(layoutHtmlAssets(prepared, { mode: 'all' }).map.root.attachments![0].url, 'data:text/markdown;base64,IyBh');
assert.equal(layoutHtmlAssets(prepared, { mode: 'none' }).files.length, 1);
const mixed = structuredClone(map); mixed.root.attachments.push({...att,id:'again'});
let allocations = 0; const normalGet = get;
get = async () => ++allocations === 1 ? new File(['a'],'one.txt',{type:'text/plain'}) : {size:20*1024*1024,arrayBuffer(){throw Error('forbidden allocation');}};
await assert.rejects(buildExportPackage(mixed),/PROTECTED_ASSET_LIMIT/); get = normalGet;
for (const [name,mime] of [['active.html','text/html'],['vector.svg','image/svg+xml'],['trick.pdf','application/xhtml+xml']]) {
    file = new File(['inert fixture'],name,{type:mime});
    const fixture = structuredClone(map); fixture.root.attachments[0].name = name;
    const all = await buildPreparedHtmlExport(await prepareHtmlAssets(fixture,loadHtmlExportResource),{mode:'all'},{});
    const restored = parseHtmlMapFile(await all.blob.text())!.map.root.attachments![0];
    const oldWin = blank; openAttachment(restored.name,restored.url); assert.equal(clicks.pop(),name); assert.equal(blank,oldWin);
}
file = { size: 20 * 1024 * 1024 + 1, arrayBuffer() {
        throw Error('should never allocate');
    } };
await assert.rejects(loadHtmlExportResource(att.url, 100 * 1024 * 1024), /PROTECTED_ASSET_LIMIT/);
for (const [name, type] of [['a.html', 'text/html'], ['a.svg', 'image/svg+xml'], ['a.pdf', 'text/html'], ['a.js', 'text/javascript'], ['a.docx', '']])
    assert.equal(localPreviewMime({ name, type }), undefined);
assert.equal(localPreviewMime({ name: 'a.md', type: 'text/markdown' }), 'text/plain');
file = new File(['svg'], 'danger.svg', { type: 'image/svg+xml' });
openAttachment('fake.pdf', att.url);
await new Promise(r => setTimeout(r, 5));
assert.equal(blank.closed, true);
assert.equal(clicks.pop(), 'danger.svg');
await downloadAttachment('safe.svg', att.url, { resolveUrl: () => {
        throw Error('not local');
    } });
assert.equal(clicks.pop(), 'safe.svg');
timers.splice(0).forEach(fn => fn());
// An open PDF remains owned even after the 60-second object URL cleanup.
file = new File(['fixture'],'test.pdf',{type:'application/pdf'}); openAttachment('test.pdf',att.url); await new Promise(r=>setTimeout(r,5));
const livePreview=blank; assert.ok(livePreview.location.href.startsWith('blob:')); timers.splice(0).forEach(fn=>fn()); assert.equal(livePreview.closed,false);
let release!: () => void, entered!: () => void;
const waiting = new Promise<void>(r => entered = r);
get = () => new Promise(r => {
    entered();
    release = () => r(file);
});
let notices = 0;
win.addEventListener('emm:local-attachment-error', () => notices++);
openAttachment('x', att.url);
await waiting;
login('B');
assert.equal(blank.closed, true); assert.equal(livePreview.closed,true);
release();
await local.initializeLocalFolders();
assert.equal(notices, 0);
assert.throws(()=>layoutHtmlAssets(prepared,{mode:'all'}),/CHANGED/);
assert.ok(!stored.has('user:A'));
get = async () => file;
await local.connectLocalFolder(rid);
onPut = () => {
    onPut = undefined;
    login('B');
};
await assert.rejects(local.connectLocalFolder(rid), /CHANGED/);
await local.initializeLocalFolders();
await local.connectLocalFolder(rid);
assert.equal(stored.get('user:B').roots[0].handle, root);
assert.equal(logs.slice(-3).join(','), 'put:user:B,del:user:B,put:user:B');
await local.approveLocalAttachment(att.url);
const remote = structuredClone(map); remote.root.attachments.push({...att,id:'s',url:'/v1/attachments/test-later'});
let callbackCalls=0; const unbounded=async()=>{callbackCalls++; return {bytes:new Uint8Array([1]),mime:'image/png'};};
await assert.rejects(buildExportPackage(remote,undefined,undefined,undefined,unbounded),/BOUNDED_LOADER/);
const mixedImage=structuredClone(map); mixedImage.root.image={src:'/v1/attachments/photo'};
await assert.rejects(buildExportPackage(mixedImage,undefined,undefined,undefined,unbounded),/BOUNDED_LOADER/);
await assert.rejects(fetchServerImageDataUrls(mixedImage,unbounded,{remaining:1,guard(){}}),/BOUNDED_LOADER/);
assert.equal(callbackCalls,0);
const previousFetch=globalThis.fetch;
// Leave exactly one byte in the 20 MiB cumulative budget. Neither browser
// fetch (which would decode) nor atob may be reached for a two-byte input.
const large=new Uint8Array(20*1024*1024-1); get=async()=>({size:large.length,type:'application/octet-stream',arrayBuffer:async()=>large.buffer});
const actualAtob=globalThis.atob; let decodeCalls=0;
globalThis.atob=(...args)=>{decodeCalls++;return actualAtob(...args);};
try {
    for (const inline of ['data:text/plain;base64,QUI=','data:text/plain,%41%42','data:text/plain,é']) {
        const inlineMap=structuredClone(map); inlineMap.root.attachments.push({...att,id:'over',url:inline});
        await assert.rejects(buildExportPackage(inlineMap),/PROTECTED_ASSET_LIMIT/);
    }
    assert.equal(decodeCalls,0); assert.equal(requests,0);
} finally {globalThis.atob=actualAtob;get=async()=>file;}
globalThis.fetch=async()=>{login('B');return new Response(new Uint8Array([1]));};
// Use a synthetic external URL, not an authenticated endpoint, for this race.
remote.root.attachments[1].url='https://example.invalid/test-later';
try {await assert.rejects(buildExportPackage(remote),/CHANGED/);} finally {globalThis.fetch=previousFetch;}
async function reconnectB() { await local.initializeLocalFolders(); await local.connectLocalFolder(rid); await local.approveLocalAttachment(att.url); }
await reconnectB(); const protectedMap=structuredClone(map); protectedMap.root.attachments.push({...att,id:'s',url:'blob:later'});
await assert.rejects(inlineProtectedMapAssets(protectedMap,async()=>{login('B');return {bytes:new Uint8Array([1]),mime:'text/plain'};}),/CHANGED/);
await reconnectB(); const snapshot=await inlineProtectedMapAssets(map,async()=>{throw Error('no fetch');});
const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle); const startClicks=clicks.length;
Object.defineProperty(crypto.subtle,'encrypt',{configurable:true,value:async (...args:any[])=>{const cipher=await realEncrypt(...args);login('B');return cipher;}});
try { await assert.rejects(downloadMapAsEncryptedHtml(map,'SyntheticPassword9!'),/CHANGED/); }
finally { delete (crypto.subtle as any).encrypt; }
assert.equal(clicks.length,startClicks); assert.throws(()=>buildStandaloneHtml(snapshot.map),/CHANGED/);
assert.equal(requests, 0);
console.log('PASS local attachments: canonical paths, gesture pickers, membership, missing/revoked roots, reconnect, no network, readonly viewer, account races, bounded export, round-trip notice');
