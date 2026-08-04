// nodeClipboard — 노드 복사/붙여넣기 내부 클립보드 (2026-08-04).
//
// 배경: Ctrl+C 에 노드 복사 구현이 없어서, 복사 후 붙여넣기가 텍스트
// 경로(클립보드의 잡탕 텍스트 → 하위 노드 생성)로 빠져 "이상한 내용"이
// 붙었다 (사용자 보고). 노드 서브트리는 이미지·노트까지 담고 있어
// 시스템 클립보드에 통째로 싣는 대신 **메모리에 보관**하고, 시스템
// 클립보드에는 토큰만 써서 붙여넣기 때 이 스택을 찾게 한다.
// (같은 탭 안에서만 동작 — 다른 탭/앱으로는 붙지 않는 것이 의도)

import type { MindNode, SampleMap } from '@/editor/__samples__/types';

export const NODE_CLIP_PREFIX = 'EMM-NODES::';

let stash: { token: string; nodes: MindNode[] } | null = null;

/** 선택 id 들의 서브트리를 문서 순서로 수집 — 조상이 이미 선택된 노드는
 *  제외한다(중복 복사 방지). 루트('root')는 복사 대상이 아니다. */
export function collectSubtrees(map: SampleMap, ids: string[]): MindNode[] {
  const idSet = new Set(ids.filter((id) => id !== 'root'));
  const out: MindNode[] = [];
  const walk = (nodes: MindNode[]) => {
    for (const n of nodes) {
      if (idSet.has(n.id)) {
        out.push(n); // 서브트리째 — 하위는 내려가지 않는다
      } else if (n.children?.length) {
        walk(n.children);
      }
    }
  };
  walk(map.branches as MindNode[]);
  return out;
}

/** 서브트리들을 내부 클립보드에 보관하고 식별 토큰을 돌려준다 */
export function stashNodes(nodes: MindNode[]): string {
  const token = NODE_CLIP_PREFIX + Math.random().toString(36).slice(2, 10);
  stash = { token, nodes: JSON.parse(JSON.stringify(nodes)) as MindNode[] };
  return token;
}

/** 붙여넣은 텍스트가 우리 토큰이면 보관된 서브트리의 복제본, 아니면 null */
export function takeStashed(text: string): MindNode[] | null {
  if (!stash || text.trim() !== stash.token) return null;
  return JSON.parse(JSON.stringify(stash.nodes)) as MindNode[];
}

/** 우리 토큰 형태인가 — 토큰인데 스택이 없으면(새로고침 등) 텍스트
 *  경로로 흘리지 말고 조용히 무시하기 위한 판별 */
export function isNodeClipToken(text: string): boolean {
  return text.trim().startsWith(NODE_CLIP_PREFIX);
}
