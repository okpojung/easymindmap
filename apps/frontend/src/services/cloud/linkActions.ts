// 연결 맵 동작 (2026-10-14) — 노드 도구막대가 부른다. 원리는 linkedMaps.ts 머리말.
//
//   · extractNodeToMap   선택한 노드를 중심주제로 **새 단독맵**을 만들어 저장하고,
//                        그 노드를 연결 노드로 바꾼다(화면은 그대로 — 내용의 정본만 옮긴다)
//   · insertLinkedMap    저장된 단독맵을 골라 ① 선택한 노드에 붙이거나(노드의 내용이
//                        그 맵의 중심주제로 바뀌고 하위가 그 맵의 가지가 된다)
//                        ② 새 중심주제로 붙인다
//   · unlinkNode         연결을 끊는다 — 지금 보이는 내용은 이 맵의 보통 노드로 남는다
//                        (연결됐던 맵은 그대로 있다)
import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { findNodeInMap, isCenterRootId, useDocumentStore } from '@/stores/documentStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { tr } from '@/i18n';
import { linkContentOf } from '@/utils/linkNode';
import { cloudApi, CloudError } from './apiClient';
import { editSessionKey } from './editSession';
import {
  collectLinkIds, readLinkable, registerLinked, useLinkedMapStore, wouldCycle,
} from './linkedMaps';
import { saveCurrentMap } from './mapSession';

const BRANCH_KEYS = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'] as const;

export class LinkActionError extends Error {}

/** 지금 맵이 서버에 저장돼 있고 이 탭이 편집권을 쥐었나 — 연결은 그때만 */
export function linkAvailable(): boolean {
  const c = useCloudStore.getState();
  return !!c.cloudMapId && c.cloudKind !== 'collab'
    && useDocumentStore.getState().docOrigin === c.cloudMapId;
}

/** 이 노드가 연결 노드인가(연결 id) */
export function linkIdOf(nodeId: string | null): string | null {
  if (!nodeId) return null;
  const n = findNodeInMap(useDocumentStore.getState().map, nodeId) as (MindNode & { linkMapId?: string }) | null;
  return n?.linkMapId ?? null;
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('|') && !l.startsWith('```')) ?? '';
  return line.replace(/[\\/:*?"<>|#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || tr('cloud.untitled');
}

function asBranches(children: MindNode[]): SampleMap['branches'] {
  return children.map((c, i) => ({
    ...c,
    colorKey: (c.colorKey ?? BRANCH_KEYS[i % BRANCH_KEYS.length]) as never,
    side: c.side === 'left' || c.side === 'right' ? c.side : i % 2 === 0 ? 'right' : 'left',
  })) as SampleMap['branches'];
}

/** 같은 폴더에 같은 이름이 있으면 `이름 (2)`… 로 피해 만든다 */
async function createUnique(title: string, folderId: string | null): Promise<{ mapId: string; title: string }> {
  for (let i = 1; i <= 20; i++) {
    const t = i === 1 ? title : `${title} (${i})`;
    try {
      const r = await cloudApi.createMap(t, { folderId, kind: 'solo' });
      return { mapId: r.mapId, title: r.title };
    } catch (e) {
      if (e instanceof CloudError && e.status === 409) continue;
      throw e;
    }
  }
  throw new LinkActionError(tr('cloud.linked.nameTaken'));
}

/**
 * ① 선택한 노드를 중심주제로 새 단독맵을 만들어 저장하고, 그 노드를 그 맵에 연결한다.
 * 큰 맵은 곧바로 저장한다 — 그래야 서버의 큰 맵에서도 그 내용이 빠지고 연결로 바뀐다.
 */
export async function extractNodeToMap(nodeId: string): Promise<{ mapId: string; title: string }> {
  if (!linkAvailable()) throw new LinkActionError(tr('cloud.linked.needSaved'));
  const map = useDocumentStore.getState().map;
  if (nodeId === 'root') throw new LinkActionError(tr('cloud.linked.notRoot'));
  const node = findNodeInMap(map, nodeId) as (MindNode & { linkMapId?: string }) | null;
  if (!node) throw new LinkActionError(tr('cloud.linked.noNode'));
  if (node.linkMapId) throw new LinkActionError(tr('cloud.linked.already'));
  const isCenter = isCenterRootId(map, nodeId);
  const children: MindNode[] = isCenter
    ? ((map.centers ?? []).find((c) => c.root.id === nodeId)?.branches ?? []) as MindNode[]
    : node.children ?? [];
  const title = firstLine(node.text);
  const created = await createUnique(title, useCloudStore.getState().cloudFolderId);
  const ui = useEditorUiStore.getState();
  const childMap: SampleMap = {
    title: created.title,
    root: { ...linkContentOf(node), id: 'root', colorKey: 'root', text: node.text } as SampleMap['root'],
    branches: asBranches(JSON.parse(JSON.stringify(children)) as MindNode[]),
    ...(map.settings ? { settings: map.settings } : {}),
  };
  try {
    await cloudApi.saveDocument(created.mapId,
      { v: 2, map: childMap, editor: { layoutType: ui.layoutType, spacingX: ui.spacingX, spacingY: ui.spacingY } },
      created.title, true, editSessionKey());
  } catch (e) {
    await cloudApi.deleteMap(created.mapId).catch(() => { /* 원래 오류를 알린다 */ });
    throw e;
  }
  useDocumentStore.getState().setNodeLink(nodeId, created.mapId);
  const now = findNodeInMap(useDocumentStore.getState().map, nodeId) as MindNode;
  await registerLinked(created.mapId, now, children);
  await saveCurrentMap({ keepVersion: true });
  return created;
}

/** 붙일 수 있는 맵인가 — 고리·중복을 미리 막는다 */
export async function checkLinkable(mapId: string): Promise<string | null> {
  const self = useCloudStore.getState().cloudMapId;
  if (mapId === self) return tr('cloud.linked.self');
  if (collectLinkIds(useDocumentStore.getState().map).includes(mapId)) return tr('cloud.linked.dup');
  if (await wouldCycle(mapId, self)) return tr('cloud.linked.cycle');
  return null;
}

/**
 * ② 저장된 단독맵을 붙인다. `mode='node'` 면 선택한 노드가 그 맵이 되고(노드의 하위는
 * 그 맵의 가지로 바뀐다), `mode='center'` 면 새 중심주제로 붙인다.
 * @returns 새로 연결된 노드 id
 */
export async function insertLinkedMap(
  mapId: string, mode: 'node' | 'center', nodeId: string | null,
): Promise<string> {
  if (!linkAvailable()) throw new LinkActionError(tr('cloud.linked.needSaved'));
  const why = await checkLinkable(mapId);
  if (why) throw new LinkActionError(why);
  const got = await readLinkable(mapId);
  if (!got) throw new LinkActionError(tr('cloud.linked.cantRead'));
  const st = useDocumentStore.getState();
  // 붙일 내용의 노드 id 가 이 맵과 겹치면 새 id 로 (붙인 맵의 연결선은 그 맵에 그대로 남는다)
  const taken = new Set<string>();
  const walk = (ns: MindNode[] | undefined, fn: (n: MindNode) => void) => { for (const n of ns ?? []) { fn(n); walk(n.children, fn); } };
  for (const c of [{ root: st.map.root, branches: st.map.branches }, ...(st.map.centers ?? [])]) {
    taken.add(c.root.id); walk(c.branches as MindNode[], (n) => taken.add(n.id));
  }
  const branches = JSON.parse(JSON.stringify(got.map.branches ?? [])) as MindNode[];
  walk(branches, (n) => { if (taken.has(n.id)) n.id = `${n.id}-l${Math.random().toString(36).slice(2, 7)}`; taken.add(n.id); });
  const content = { ...linkContentOf(got.map.root), text: got.map.root.text };

  let targetId: string;
  if (mode === 'center') {
    targetId = st.addCenter(got.map.root.text);
  } else {
    if (!nodeId || nodeId === 'root') throw new LinkActionError(tr('cloud.linked.notRoot'));
    targetId = nodeId;
  }
  if (!useDocumentStore.getState().setNodeLink(targetId, mapId, { content, children: branches })) {
    throw new LinkActionError(tr('cloud.linked.noNode'));
  }
  const now = findNodeInMap(useDocumentStore.getState().map, targetId) as MindNode;
  const isCenter = isCenterRootId(useDocumentStore.getState().map, targetId);
  const kids = isCenter
    ? ((useDocumentStore.getState().map.centers ?? []).find((c) => c.root.id === targetId)?.branches ?? []) as MindNode[]
    : now.children ?? [];
  await registerLinked(mapId, now, kids);
  return targetId;
}

/** 연결을 끊는다 — 보이는 내용은 이 맵의 보통 노드로 남고, 그 맵의 잠금은 놓는다 */
export function unlinkNode(nodeId: string): void {
  const id = linkIdOf(nodeId);
  if (!id) return;
  useDocumentStore.getState().setNodeLink(nodeId, null);
  const e = useLinkedMapStore.getState().entries[id];
  if (e?.state === 'editable') void cloudApi.editRelease(id, editSessionKey()).catch(() => { /* TTL */ });
  const rest = { ...useLinkedMapStore.getState().entries };
  delete rest[id];
  useLinkedMapStore.setState({ entries: rest });
}
