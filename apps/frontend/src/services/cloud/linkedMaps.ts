// 연결 맵 (2026-10-14 사용자 요청) — 큰 맵의 노드 하나가 **다른 단독맵 하나를
// 가리키고**, 화면에는 그 맵의 내용이 그 노드 아래에 펼쳐져 보인다.
//
//   · 저장된 큰 맵(서버 문서)에는 연결 노드가 `linkMapId` 와 **이름만** 남는다 —
//     하위 노드는 들어 있지 않다. 내용의 정본은 연결된 맵이다.
//   · 열 때(`expandLinkedMaps`) 연결된 맵 문서를 읽어 그 노드 아래에 **붙여 보인다**
//     (그 맵의 중심주제 내용 = 연결 노드의 내용, 그 맵의 가지 = 연결 노드의 하위).
//   · 저장할 때(`splitLinkedMaps`) 다시 떼어 큰 맵에는 연결 노드만, 연결된 맵에는
//     그 아래 내용을 **각자 저장**한다 — 큰 맵 안에서 고친 것이 그 맵에 들어간다.
//   · 큰 맵을 편집하는 탭이 연결된 맵의 **편집 잠금**도 함께 쥔다 — 그동안 그 맵을
//     다른 브라우저(탭)에서 열면 읽기 전용이다(단일 세션 편집 잠금을 그대로 쓴다).
//     반대로 그 맵을 다른 곳에서 먼저 편집 중이면 큰 맵 안의 그 내용은 **보기만**
//     하고 저장하지 않는다(고쳤으면 저장할 때 알린다).
//
// 연결은 단독맵끼리만 한다. 연결된 맵 안에 또 연결이 있으면 깊이 4 까지 펼치고,
// 고리(A→B→A)는 펼치지 않는다.
import type { MindNode, SampleMap } from '@/editor/__samples__/types';
import { cloudApi } from './apiClient';
import { editSessionKey } from './editSession';
import { useLinkedMapStore, type LinkState, type LinkedEntry } from '@/stores/linkedMapStore';
import { LINK_PARENT_KEYS, linkContentOf as contentOf } from '@/utils/linkNode';

const PARENT_KEYS = LINK_PARENT_KEYS;
const MAX_DEPTH = 4;

export { useLinkedMapStore };
export type { LinkState, LinkedEntry };

// ── 트리 도우미 ───────────────────────────────────────────────

type CenterLike = { root: MindNode & { linkMapId?: string }; branches: MindNode[] };

function centersOf(map: SampleMap): CenterLike[] {
  return [{ root: map.root as never, branches: map.branches as never },
    ...((map.centers ?? []) as unknown as CenterLike[])];
}

function walk(nodes: MindNode[] | undefined, fn: (n: MindNode) => void): void {
  for (const n of nodes ?? []) { fn(n); walk(n.children, fn); }
}

function collectIds(map: SampleMap): Set<string> {
  const ids = new Set<string>();
  for (const c of centersOf(map)) { ids.add(c.root.id); walk(c.branches, (n) => ids.add(n.id)); }
  return ids;
}

/** 큰 맵 안에 있는 모든 연결 id (중심 연결 포함) */
export function collectLinkIds(map: SampleMap): string[] {
  const out = new Set<string>();
  for (const c of centersOf(map)) {
    if (c.root.linkMapId) out.add(c.root.linkMapId);
    walk(c.branches, (n) => { if (n.linkMapId) out.add(n.linkMapId); });
  }
  return [...out];
}

// ── 붙이기 (열 때) ─────────────────────────────────────────────

/**
 * 연결된 맵 문서를 읽어 큰 맵의 연결 노드 아래에 붙인다.
 *
 * @param lock 편집 잠금을 쥘까 — 큰 맵을 **편집하려고** 열 때만 true.
 *   읽기 전용으로 연 큰 맵이면 연결된 맵도 잠그지 않고 보기만 한다.
 * @param selfId 큰 맵 자신의 id — 자기를 연결한 고리를 막는다
 */
export async function expandLinkedMaps(
  map: SampleMap, { lock, selfId }: { lock: boolean; selfId: string | null },
): Promise<SampleMap> {
  // 앞 맵에서 쥐었던 연결 잠금은 놓는다 — 새로 연 맵이 다시 쥔다
  releaseLinkedLocks();
  useLinkedMapStore.getState().reset();
  if (collectLinkIds(map).length === 0) return map;
  const out = JSON.parse(JSON.stringify(map)) as SampleMap;
  const taken = collectIds(out);
  const fetched = new Map<string, Awaited<ReturnType<typeof fetchLinked>>>();

  type Holder = { node: MindNode; setChildren: (c: MindNode[]) => void; isCenter: boolean };
  const graftInto = async (holder: Holder, chain: string[], depth: number): Promise<void> => {
    const id = holder.node.linkMapId!;
    const st = useLinkedMapStore.getState();
    if (chain.includes(id) || depth > MAX_DEPTH) {
      // 바깥에서 이미 펼친 같은 맵(A→B→C→B 의 첫 B)의 상태는 덮어쓰지 않는다 (Codex #640)
      if (!st.entries[id]) st.set({ mapId: id, title: holder.node.text, state: 'skipped' });
      holder.setChildren([]);
      return;
    }
    // ★ 같은 맵이 큰 맵 안에 두 번 연결돼 있으면 **처음 것만** 고칠 수 있다 —
    //   둘 다 펼쳐 고치면 저장할 때 어느 쪽이 정본인지 알 수 없다
    if (fetched.has(id)) {
      holder.setChildren([]);
      (holder.node as MindNode & { _linkDup?: boolean })._linkDup = true;
      return;
    }
    const got = await fetchLinked(id, lock);
    fetched.set(id, got);
    if (!got) {
      st.set({ mapId: id, title: holder.node.text, state: 'missing' });
      holder.setChildren([]);
      return;
    }
    const child = got.map;
    // ★ 노드 id 가 큰 맵과 겹치면 붙이는 쪽을 새 id 로 바꾼다(그 맵의 연결선도 함께)
    const rename = new Map<string, string>();
    rename.set('root', holder.node.id); // 그 맵의 중심주제 = 이 연결 노드
    const branches = JSON.parse(JSON.stringify(child.branches ?? [])) as MindNode[];
    walk(branches, (n) => {
      if (taken.has(n.id)) {
        const nid = `${n.id}-l${Math.random().toString(36).slice(2, 7)}`;
        rename.set(n.id, nid); n.id = nid;
      }
      taken.add(n.id);
    });
    const baseMap: SampleMap = {
      ...child,
      connectors: (child.connectors ?? []).map((c) => ({
        ...c, from: rename.get(c.from) ?? c.from, to: rename.get(c.to) ?? c.to,
      })),
    };
    // 연결 노드 = 큰 맵의 칸(id·색·좌우·접힘…) + 그 맵 중심주제의 내용
    for (const k of Object.keys(holder.node)) if (!PARENT_KEYS.has(k)) delete (holder.node as never as Record<string, unknown>)[k];
    Object.assign(holder.node, contentOf(child.root));
    holder.setChildren(branches);
    st.set({
      mapId: id, title: got.title, state: got.state, updatedAt: got.updatedAt,
      base: { map: baseMap, editor: got.editor },
    });
    // 붙인 내용 안의 연결도 펼친다
    const nextChain = [...chain, id];
    const inner: Holder[] = [];
    walk(branches, (n) => {
      if (n.linkMapId) inner.push({ node: n, setChildren: (c) => { n.children = c; }, isCenter: false });
    });
    for (const h of inner) await graftInto(h, nextChain, depth + 1);
  };

  const top: Holder[] = [];
  const chain = selfId ? [selfId] : [];
  for (const c of centersOf(out)) {
    if (c.root.linkMapId) {
      top.push({ node: c.root, setChildren: (b) => { c.branches.splice(0, c.branches.length, ...b); }, isCenter: true });
    }
    walk(c.branches, (n) => {
      if (n.linkMapId) top.push({ node: n, setChildren: (ch) => { n.children = ch; }, isCenter: false });
    });
  }
  for (const h of top) await graftInto(h, chain, 1);
  // 지금 내용을 '저장된 것'으로 기억한다 — 고친 맵만 저장하려고. **저장할 때와 같은
  // 떼기**로 만든다: 연결 안의 연결은 그 맵에 이름만 남으므로, 펼친 내용 그대로
  // 비교하면 고치지 않은 맵도 매번 바뀐 것으로 보인다
  for (const c of splitLinkedMaps(out).children) {
    const e = useLinkedMapStore.getState().entries[c.mapId];
    if (e) useLinkedMapStore.getState().set({ ...e, savedJson: JSON.stringify(c.map) });
  }
  // centersOf 가 만든 첫 중심 객체는 out.root/branches 를 그대로 가리킨다
  return out;
}

async function fetchLinked(id: string, lock: boolean): Promise<{
  map: SampleMap; title: string; updatedAt: string; editor?: unknown; state: LinkState;
} | null> {
  try {
    const r = await cloudApi.getDocument(id, lock ? editSessionKey() : undefined);
    const doc = r.doc as { map?: SampleMap; editor?: unknown };
    if (!doc?.map) return null;
    const editable = lock && r.kind === 'solo' && r.editLock === 'acquired'
      && !r.published && !r.dashboard && r.role !== 'viewer';
    // 쥐었는데 고칠 수 없는 맵이면(공개·대시보드 등) 바로 놓는다
    if (lock && r.editLock === 'acquired' && !editable) {
      void cloudApi.editRelease(id, editSessionKey()).catch(() => { /* TTL 로도 풀린다 */ });
    }
    return { map: doc.map, title: r.title, updatedAt: r.updatedAt, editor: doc.editor, state: editable ? 'editable' : 'readonly' };
  } catch {
    return null;
  }
}

// ── 떼기 (저장할 때) ───────────────────────────────────────────

function childDocFromHolder(node: MindNode, branches: MindNode[], entry: LinkedEntry | undefined): SampleMap {
  const base = entry?.base?.map;
  const ids = new Set<string>();
  walk(branches, (n) => ids.add(n.id));
  ids.add(node.id);
  const back = (x: string) => (x === node.id ? 'root' : x);
  return {
    ...(base ?? { title: entry?.title ?? node.text }),
    title: entry?.title ?? base?.title ?? node.text,
    // 중심주제 = 연결 노드의 내용 칸 그대로 (큰 맵에서 지운 노트·태그가 그 맵에도 지워지게)
    root: { ...contentOf(node), id: 'root', colorKey: 'root' } as SampleMap['root'],
    branches: branches as SampleMap['branches'],
    // 그 맵 안에서 사라진 노드를 가리키는 연결선은 버린다
    connectors: (base?.connectors ?? [])
      .filter((c) => ids.has(c.from) && ids.has(c.to))
      .map((c) => ({ ...c, from: back(c.from), to: back(c.to) })),
  } as SampleMap;
}

/** 연결 노드를 **저장되는 꼴**로 — 하위를 비우고 이름만 남긴다 */
function stubOf(n: MindNode & { linkMapId?: string }): MindNode {
  const keep: Record<string, unknown> = {};
  for (const k of PARENT_KEYS) if (k !== 'children' && (n as never as Record<string, unknown>)[k] !== undefined) keep[k] = (n as never as Record<string, unknown>)[k];
  return { ...keep, id: n.id, text: n.text, linkMapId: n.linkMapId } as MindNode;
}

export interface SplitResult {
  parent: SampleMap;
  children: { mapId: string; map: SampleMap }[];
}

/**
 * 화면의 큰 맵을 **저장되는 꼴**로 나눈다: 큰 맵(연결 노드는 이름만) + 연결된
 * 맵마다 그 아래 내용. 연결 노드가 없으면 그대로 돌려준다(복사하지 않는다).
 */
export function splitLinkedMaps(map: SampleMap): SplitResult {
  if (collectLinkIds(map).length === 0) return { parent: map, children: [] };
  const entries = useLinkedMapStore.getState().entries;
  const children: SplitResult['children'] = [];
  const seen = new Set<string>();
  const cut = (nodes: MindNode[] | undefined): MindNode[] | undefined => nodes?.map((n) => {
    if (n.linkMapId) {
      const e = entries[n.linkMapId];
      // 등록되지 않은 연결(되돌리기로 되살아난 연결 등)은 떼지 않고 그대로 둔다 —
      // 떼면 그 아래 내용이 어디에도 저장되지 않는다. 다음에 열 때 그 맵 내용으로 붙는다
      if (!e) return n.children ? { ...n, children: cut(n.children) } : n;
      // 펼쳐서 고칠 수 있는 첫 연결만 그 맵으로 간다 (중복·고리·없는 맵은 버린다)
      if (e && (e.state === 'editable' || e.state === 'readonly') && !seen.has(n.linkMapId)
        && !(n as MindNode & { _linkDup?: boolean })._linkDup) {
        seen.add(n.linkMapId);
        const inner = cut(n.children) ?? [];
        children.push({ mapId: n.linkMapId, map: childDocFromHolder(n, inner, e) });
      }
      return stubOf(n);
    }
    return n.children ? { ...n, children: cut(n.children) } : n;
  });
  const cs = centersOf(map).map((c) => {
    if (c.root.linkMapId && entries[c.root.linkMapId]) {
      const e = entries[c.root.linkMapId];
      if (e && (e.state === 'editable' || e.state === 'readonly') && !seen.has(c.root.linkMapId)) {
        seen.add(c.root.linkMapId);
        children.push({ mapId: c.root.linkMapId, map: childDocFromHolder(c.root, cut(c.branches) ?? [], e) });
      }
      return { ...c, root: { ...stubOf(c.root), colorKey: 'root' } as never, branches: [] };
    }
    return { ...c, branches: cut(c.branches) ?? [] };
  });
  const [first, ...rest] = cs;
  const parent: SampleMap = {
    ...map,
    root: first.root as never,
    branches: first.branches as never,
    ...(map.centers ? { centers: rest.map((c, i) => ({ ...map.centers![i], root: c.root as never, branches: c.branches as never })) } : {}),
  };
  return { parent, children };
}

/**
 * 큰 맵을 저장한 **뒤에** 부른다 — 연결된 맵 가운데 고친 것만 각자 저장한다.
 * @returns `blocked` = 보기만 하는 연결이라 저장할 수 없는 것(다른 곳에서 편집 중),
 *   `failed` = 저장을 시도했는데 실패한 것(네트워크·STALE 등) — **다시 시도해야 한다.**
 *   부르는 쪽은 failed 가 있으면 저장이 끝났다고 말하면 안 된다(닫기·초안 지우기 금지).
 */
export async function saveLinkedChildren(
  map: SampleMap, { keepVersion }: { keepVersion: boolean },
): Promise<{ saved: number; blocked: string[]; failed: string[] }> {
  const { children } = splitLinkedMaps(map);
  const blocked: string[] = [];
  const failed: string[] = [];
  let saved = 0;
  for (const c of children) {
    const e = useLinkedMapStore.getState().entries[c.mapId];
    if (!e) continue;
    const json = JSON.stringify(c.map);
    if (json === e.savedJson) continue;
    if (e.state !== 'editable') { blocked.push(e.title); continue; }
    try {
      const res = await cloudApi.saveDocument(
        c.mapId, { v: 2, map: c.map, editor: e.base?.editor ?? undefined },
        e.title, keepVersion, editSessionKey(), false, e.updatedAt);
      useLinkedMapStore.getState().set({ ...e, savedJson: json, updatedAt: res.updatedAt });
      saved++;
    } catch {
      failed.push(e.title);
    }
  }
  return { saved, blocked, failed };
}

// ── 잠금 유지 · 해제 ───────────────────────────────────────────

/** 하트비트 — 큰 맵의 하트비트와 같은 주기로 부른다. 잃었으면 보기만으로 바꾼다 */
export async function heartbeatLinkedLocks(): Promise<string[]> {
  const lost: string[] = [];
  const entries = Object.values(useLinkedMapStore.getState().entries).filter((e) => e.state === 'editable');
  await Promise.all(entries.map(async (e) => {
    try {
      const r = await cloudApi.editHeartbeat(e.mapId, editSessionKey());
      if (!r.held) {
        useLinkedMapStore.getState().set({ ...e, state: 'readonly' });
        lost.push(e.title);
      }
    } catch { /* 다음 주기에 다시 */ }
  }));
  return lost;
}

export function releaseLinkedLocks(): void {
  for (const e of Object.values(useLinkedMapStore.getState().entries)) {
    if (e.state === 'editable') void cloudApi.editRelease(e.mapId, editSessionKey()).catch(() => { /* TTL */ });
  }
}

/**
 * 방금 만든 연결(노드 → 새 맵, 저장된 맵 붙이기)을 등록한다 — 그 맵의 잠금을 쥐고,
 * 지금 화면 내용을 '저장된 것'으로 기억한다.
 */
export async function registerLinked(mapId: string, node: MindNode, branches: MindNode[]): Promise<LinkState> {
  const got = await fetchLinked(mapId, true);
  if (!got) { useLinkedMapStore.getState().set({ mapId, title: node.text, state: 'missing' }); return 'missing'; }
  const entry: LinkedEntry = {
    mapId, title: got.title, state: got.state, updatedAt: got.updatedAt,
    base: { map: got.map, editor: got.editor },
  };
  entry.savedJson = JSON.stringify(childDocFromHolder(node, branches, entry));
  useLinkedMapStore.getState().set(entry);
  return got.state;
}

/** 붙여 넣을 그 맵 문서를 읽는다 (연결하기 전에 내용·고리 검사용) */
export async function readLinkable(mapId: string): Promise<{ map: SampleMap; title: string } | null> {
  const got = await fetchLinked(mapId, false);
  return got ? { map: got.map, title: got.title } : null;
}

/** 그 맵(과 그 안의 연결들)이 지금 맵을 다시 가리키는가 — 고리 검사 */
export async function wouldCycle(candidateId: string, selfId: string | null): Promise<boolean> {
  if (!selfId) return false;
  if (candidateId === selfId) return true;
  const seen = new Set<string>();
  const queue = [candidateId];
  while (queue.length && seen.size < 50) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const got = await readLinkable(id);
    if (!got) continue;
    for (const l of collectLinkIds(got.map)) {
      if (l === selfId) return true;
      queue.push(l);
    }
  }
  return false;
}
