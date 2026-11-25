// 첨부할 때 Cloud(서버) / 이 PC 폴더 중 어디에 둘지 (2026-11-25 사용자 승인 설계).
//
//   · PC 폴더가 연결돼 있지 않으면 묻지 않고 Cloud 로 간다(예전과 같다).
//   · 연결돼 있으면 묻는다. "다음부터 묻지 않기" 를 고르면 이 브라우저에 기억한다
//     (계정 메뉴 → 첨부 폴더에서 다시 바꿀 수 있다).
//   · MD 문서는 웹 편집기가 서버에 저장하므로 항상 Cloud 다.
//   · 이 PC 폴더에 둘 때: 폴더 안 파일은 위치만 연결, 밖의 파일은 `<맵 이름>/` 에 복사.
import { attachmentFetchUrl, cloudApi, serverAttachmentId } from '@/services/cloud/apiClient';
import { useCloudStore } from '@/stores/cloudStore';
import { useDocumentStore } from '@/stores/documentStore';
import { attachFileWithProgress } from '@/utils/attachmentFile';
import {
  getLocalFolderState, hasLocalWritePermission, localErrorReason, readLocalAttachment,
  safeLocalName, storeFileInLocalFolder,
} from '@/utils/localAttachments';
import { isMarkdownName } from '@/utils/mdEditorUrl';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import { tr } from '@/i18n';

export type AttachTarget = 'cloud' | 'local';
export type AttachPref = 'ask' | 'cloud' | 'local';
const PREF_KEY = 'emm.attachTarget.v1';

export function readAttachPref(): AttachPref {
  try { const v = localStorage.getItem(PREF_KEY); return v === 'cloud' || v === 'local' ? v : 'ask'; } catch { return 'ask'; }
}
export function writeAttachPref(p: AttachPref): void {
  try { if (p === 'ask') localStorage.removeItem(PREF_KEY); else localStorage.setItem(PREF_KEY, p); } catch { /* blocked storage: ask every time */ }
  emit();
}

export interface AttachAsk { names: string[]; resolve: (r: { target: AttachTarget; remember: boolean } | null) => void }
let current: AttachAsk | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const f of subs) f(); };
export function subscribeAttachAsk(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; }
export function getAttachAsk(): AttachAsk | null { return current; }

function ask(names: string[]): Promise<{ target: AttachTarget; remember: boolean } | null> {
  current?.resolve(null);
  return new Promise((resolve) => {
    current = { names, resolve: (r) => { current = null; emit(); resolve(r); } };
    emit();
  });
}

/** 복사해 둘 하위 폴더 이름 — 맵 제목 */
export function mapFolderName(): string {
  const map = useDocumentStore.getState().map;
  const title = useCloudStore.getState().cloudTitle || flattenNodeText(map.root?.text) || 'EasyMindMap';
  return safeLocalName(title.replace(/\s+/g, ' ').slice(0, 60), 'EasyMindMap');
}

/** 협업맵 — 다른 참여자가 열 수 있어야 하므로 PC 폴더 첨부를 쓰지 않는다 (2026-11-26 사용자 요청) */
export function isCollabMap(): boolean { return useCloudStore.getState().cloudKind === 'collab'; }

export async function chooseAttachTarget(files: File[]): Promise<AttachTarget | null> {
  if (isCollabMap()) return 'cloud';
  if (!files.length || files.every((f) => isMarkdownName(f.name))) return 'cloud';
  if (getLocalFolderState().status !== 'connected') return 'cloud';
  const pref = readAttachPref();
  if (pref === 'cloud') return 'cloud';
  if (pref === 'local' && await hasLocalWritePermission()) return 'local';
  const r = await ask(files.map((f) => f.name));
  if (!r) return null;
  if (r.remember) writeAttachPref(r.target);
  return r.target;
}

export function localAttachMessage(e: unknown): string {
  const why = localErrorReason(e);
  return tr(why === 'permission' ? 'localAtt.store.permission' : why === 'disconnected' ? 'localAtt.host.disconnected' : 'localAtt.store.failed');
}

export type AttachOne = (f: File, i: number) => Promise<{ url: string; name: string; size: number }>;

/**
 * 한 번 묻고 파일마다 붙이는 함수를 돌려준다. null = 사용자가 취소.
 * `handles` 는 드롭 이벤트 안에서 동기로 얻은 `captureDropHandles(dt)` — 폴더 안 파일 판별용.
 */
export async function beginAttachBatch(files: File[], handles?: Promise<(FileSystemHandle | null)[]>): Promise<AttachOne | null> {
  const target = await chooseAttachTarget(files);
  if (!target) return null;
  const cloud: AttachOne = async (f) => ({ url: await attachFileWithProgress(f), name: f.name, size: f.size });
  if (target === 'cloud') return cloud;
  const hs = handles ? await handles.catch(() => [] as (FileSystemHandle | null)[]) : [];
  const folder = mapFolderName();
  return async (f, i) => {
    if (isMarkdownName(f.name)) return cloud(f, i);
    try {
      const r = await storeFileInLocalFolder(f, folder, hs[i] ?? null);
      return { url: r.url, name: r.name, size: r.size };
    } catch (e) { throw new Error(localAttachMessage(e)); }
  };
}

// ── 이미 붙인 첨부를 옮기기 ──────────────────────────────────────────────

function findAttachment(nodeId: string, attachmentId: string) {
  let hit: { name: string; url?: string; size?: number } | undefined;
  const walk = (n: { id: string; attachments?: { id: string; name: string; url?: string; size?: number }[]; children?: unknown[] }) => {
    if (n.id === nodeId) hit = n.attachments?.find((a) => a.id === attachmentId) ?? hit;
    for (const c of (n.children ?? []) as typeof n[]) walk(c);
  };
  const map = useDocumentStore.getState().map as unknown as { root: never; branches: never[]; centers?: { root: never; branches: never[] }[] };
  const all = [{ root: map.root, branches: map.branches }, ...(map.centers ?? [])];
  for (const c of all) { if (c.root) walk(c.root); for (const b of c.branches ?? []) walk(b); }
  return hit;
}

/** 서버/맵 내장 첨부 → 이 PC 폴더. 쓰기 권한은 호출 전에 클릭 핸들러에서 요청해 둔다. */
export async function moveAttachmentToPc(nodeId: string, attachmentId: string): Promise<{ name: string; deletedServer: boolean }> {
  const epoch = useDocumentStore.getState().docEpoch;
  const att = findAttachment(nodeId, attachmentId);
  if (!att?.url) throw new Error(tr('localAtt.store.failed'));
  const res = await fetch(await attachmentFetchUrl(att.url), { credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(tr('localAtt.move.fetchFailed'));
  const blob = await res.blob();
  const file = new File([blob], att.name, { type: blob.type });
  let stored;
  try { stored = await storeFileInLocalFolder(file, mapFolderName()); } catch (e) { throw new Error(localAttachMessage(e)); }
  if (useDocumentStore.getState().docEpoch !== epoch) throw new Error(tr('localAtt.changed'));
  const s = useDocumentStore.getState();
  if (!s.replaceEmbeddedAttachment(nodeId, attachmentId, stored.url, stored.size)) throw new Error(tr('localAtt.changed'));
  if (stored.name !== att.name) s.renameNodeAttachment(nodeId, attachmentId, stored.name);
  const serverId = serverAttachmentId(att.url);
  if (serverId) await cloudApi.deleteAttachment(serverId).catch(() => undefined);
  return { name: stored.name, deletedServer: !!serverId };
}

/** 이 PC 첨부 → Cloud(서버). PC 파일은 그대로 둔다. */
export async function moveAttachmentToCloud(nodeId: string, attachmentId: string): Promise<{ name: string }> {
  const epoch = useDocumentStore.getState().docEpoch;
  const att = findAttachment(nodeId, attachmentId);
  if (!att?.url) throw new Error(tr('localAtt.store.failed'));
  let file: File;
  try { file = await readLocalAttachment(att.url); } catch (e) { throw new Error(localAttachMessage(e)); }
  const url = await attachFileWithProgress(new File([file], att.name, { type: file.type }));
  if (useDocumentStore.getState().docEpoch !== epoch) throw new Error(tr('localAtt.changed'));
  if (!useDocumentStore.getState().replaceEmbeddedAttachment(nodeId, attachmentId, url, file.size)) throw new Error(tr('localAtt.changed'));
  return { name: att.name };
}
