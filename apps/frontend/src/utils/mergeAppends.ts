// mergeAppends — 서버 맵의 **덧붙여진 노드만** 편집 중인 로컬 맵에 합친다.
//
// 자리: AI 대화(MCP `append_to_map`)가 열려 있는 맵에 가지를 붙였는데, 이
// 탭에는 저장되지 않은 편집이 있을 때(mapSession.refreshFromServer). 통째로
// 다시 읽으면 내 편집이 사라지고, 무시하면 저장 때 STALE 로 튕긴다. AI 는
// **덧붙이기만** 하므로 "서버에만 있는 노드를 같은 부모 아래 맨 뒤에 끼운다"
// 가 안전한 합치기다. 그 이상은 하지 않는다 — mcp-connector.md §9.8.
//
//   npx tsx src/utils/mergeAppends.test.ts

import type { MindNode, SampleMap } from '@/editor/__samples__/types';

/**
 * 서버 맵에서 **로컬에 없는 노드**를 찾아 같은 부모 아래(맨 뒤)에 끼워 넣는다.
 * AI 덧붙이기(`append_to_map`)를 편집 중인 화면에 합치는 용도라, 그 이상은
 * 하지 않는다: 새 노드가 하나도 없으면 **null** — 서버가 바뀐 이유를 모른다
 * (텍스트 수정·삭제 등은 이 함수의 몫이 아니다; 저장 때 STALE 로 걸린다).
 * 로컬에만 있는 노드(내가 만든 것)는 그대로 둔다.
 */
export function mergeServerAppends(
  local: SampleMap, server: SampleMap,
): { map: SampleMap; added: number } | null {
  const localIds = new Set<string>();
  const walkIds = (nodes: MindNode[]) => {
    for (const n of nodes) { localIds.add(n.id); walkIds((n.children ?? []) as MindNode[]); }
  };
  walkIds(local.branches as MindNode[]);

  // 부모 id('root' = 최상위) → 붙일 서브트리들. 아는 노드 아래로만 내려가므로
  // 새 노드는 언제나 **아는 부모 바로 아래**에서 만난다(그 아래는 통째로 새 것).
  // 로컬에만 있는 노드(내 편집)는 건드리지 않는다 — 잠금 덕에 이 맵을 함께
  // 쓰는 것은 덧붙이기만 하는 MCP 뿐이라, 서버에 없는 로컬 노드는 곧 내 것이다.
  const inserts = new Map<string, MindNode[]>();
  const walkServer = (nodes: MindNode[], parentId: string) => {
    for (const n of nodes) {
      if (localIds.has(n.id)) { walkServer((n.children ?? []) as MindNode[], n.id); continue; }
      const list = inserts.get(parentId) ?? [];
      list.push(n);
      inserts.set(parentId, list);
    }
  };
  walkServer(server.branches as MindNode[], 'root');
  if (inserts.size === 0) return null;

  let added = 0;
  const count = (nodes: MindNode[]): number =>
    nodes.reduce((a, n) => a + 1 + count((n.children ?? []) as MindNode[]), 0);
  const graft = (nodes: MindNode[]): MindNode[] => nodes.map((n) => {
    const extra = inserts.get(n.id);
    const kids = graft((n.children ?? []) as MindNode[]);
    if (extra) added += count(extra);
    return { ...n, children: extra ? [...kids, ...extra] : kids };
  });
  const branches = graft(local.branches as MindNode[]) as SampleMap['branches'];
  const top = inserts.get('root');
  if (top) added += count(top);
  return {
    map: { ...local, branches: top ? [...branches, ...(top as SampleMap['branches'])] : branches },
    added,
  };
}

