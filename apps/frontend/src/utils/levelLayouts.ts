// levelLayouts — "레벨별 서브트리 레이아웃"을 노드에 박는 **단 하나의 규칙**.
//
// 이 파일이 있는 이유는 규칙이 두 벌이 될 뻔했기 때문이다. 레벨별 레이아웃을
// 노드에 적용하는 곳이 둘이다 —
//   · 설정 패널에서 고를 때        (documentStore.setLevelLayout)
//   · EMM 선언이 있는 문서를 불러올 때 (importMapFile)
// 두 곳이 각자 순회하면 "4레벨은 그 이상 전부"나 edgeType 같은 세부가 언젠가
// 어긋난다. 그래서 순회를 여기 한 벌만 둔다.
//
// ── 색인 기준 (2026-09-03 통일) ──────────────────────────────────────
//
//   levelLayouts[k] 의 k 는 **branches 기준 depth** 다.
//
//     k=0  미사용 — 1레벨(중심)은 맵 전체 레이아웃이 맡는다
//     k=1  branches (설정 패널 라벨 "2레벨")
//     k=2  그 자식     ("3레벨")
//     k=3               ("4레벨")
//     k=4  **그 이상 전부** ("5레벨+")
//
//   `levelShapes` 와 같은 칸이 같은 레벨을 뜻한다(둘 다 [1]=2레벨). 다만
//   `levelShapes[0]` 은 1레벨이고 `levelLayouts[0]` 은 쓰이지 않는다 —
//   1레벨 레이아웃은 노드가 아니라 맵이 갖기 때문이다.

import type { EdgeType, LayoutType, MindNode } from '@/editor/__samples__/types';

/** 마지막 칸이 "그 레벨 이상"을 뜻한다. emmDeclaration 의 CAP 과 같은 값. */
export const LEVEL_LAYOUT_CAP = 4;

export function resolveEdgeType(layoutType: LayoutType): EdgeType {
  if (layoutType === 'radial' || layoutType === 'both-radial') {
    return 'curve-line';
  }
  return 'tree-line';
}

/** 한 노드에 레이아웃을 박는다 — null 이면 오버라이드를 지운다. */
function withLayout(node: MindNode, layoutType: LayoutType | null | undefined): MindNode {
  return {
    ...node,
    layoutType: layoutType ?? undefined,
    edgeType: layoutType ? resolveEdgeType(layoutType) : undefined,
  };
}

/**
 * **한 레벨**에 일괄 적용/해제 — 설정 패널에서 고른 그대로.
 *
 * `layoutType` 이 null 이면 그 레벨의 오버라이드를 **지운다**. 개별 노드가
 * 따로 갖고 있던 오버라이드도 이 레벨에 한해 덮어쓴다 — 패널의 한 칸이
 * 그 레벨 전체를 말하기 때문이다.
 */
export function applyLevelLayout(
  nodes: MindNode[],
  level: number,
  layoutType: LayoutType | null,
): MindNode[] {
  const walk = (list: MindNode[], depth: number): MindNode[] =>
    list.map((n) => {
      const match = level === LEVEL_LAYOUT_CAP ? depth >= LEVEL_LAYOUT_CAP : depth === level;
      const next: MindNode = { ...n, children: walk(n.children ?? [], depth + 1) };
      return match ? { ...withLayout(next, layoutType), children: next.children } : next;
    });
  return walk(nodes, 1);
}

/**
 * **배열 전체**를 한 번에 적용 — 불러오기가 쓴다.
 *
 * 위 함수를 레벨마다 부르는 것과 결과가 같다(`min(depth, CAP)` 이 "마지막
 * 칸은 그 이상 전부" 규칙을 그대로 편다). 다른 점은 **선언하지 않은 레벨을
 * 건드리지 않는다**는 것뿐이다 — 빈 칸은 "지워라"가 아니라 "말한 적 없다"다.
 * 패널은 사용자가 그 칸을 직접 비운 것이라 지우는 게 맞고, 문서 선언은
 * 적히지 않은 레벨에 대해 아무 말도 하지 않은 것이라 두는 게 맞다.
 */
export function applyLevelLayouts(
  nodes: MindNode[],
  levelLayouts: (LayoutType | null | undefined)[],
): MindNode[] {
  const walk = (list: MindNode[], depth: number): MindNode[] =>
    list.map((n) => {
      const lt = levelLayouts[Math.min(depth, LEVEL_LAYOUT_CAP)];
      const next: MindNode = { ...n, children: walk(n.children ?? [], depth + 1) };
      return lt ? { ...withLayout(next, lt), children: next.children } : next;
    });
  return walk(nodes, 1);
}
