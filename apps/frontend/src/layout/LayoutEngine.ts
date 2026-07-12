// File: src/layout/LayoutEngine.ts
// Version: MVP-LayoutEngine-SubtreeOverrides-v2.0.0
// Description:
// - Dispatches each layout type to its own strategy.
// - tree-right      -> layoutTreeRight()
// - tree-down       -> layoutTreeDown()
// - hierarchy-right -> layoutHierarchyRight()
// - process-tree    -> layoutProcessTreeRight()
// - radial layouts  -> radial strategies
// - After the base layout, per-node layoutType overrides stored in the
//   document are applied via applyLayoutOverrides(): any node whose
//   layoutType differs from its parent's effective layout gets its subtree
//   re-laid-out in that style around the node's position.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, SampleMap, SampleBranch, MindNode } from '@/editor/__samples__/types';
import type { LaidOutNode } from './types';
import { normalizeLayoutType } from './normalizeLayoutType';

// Hides children of collapsed nodes from the layout, while recording the
// original child count on `_childCount` so the canvas can still draw a
// collapse/expand toggle on a collapsed node.
function pruneCollapsed<T extends MindNode>(nodes: T[]): T[] {
  return nodes.map((node) => {
    const childCount = node.children?.length ?? 0;
    if (node.collapsed) {
      return { ...node, _childCount: childCount, children: [] };
    }
    return { ...node, _childCount: childCount, children: pruneCollapsed(node.children ?? []) };
  });
}

import { layoutRadial, layoutRadialOneSide } from './strategies/RadialStrategy';
import { layoutTreeRight, layoutTreeDown } from './strategies/TreeStrategy';
import { layoutHierarchyRight } from './strategies/HierarchyStrategy';
import { layoutProcessTreeRight } from './strategies/ProcessStrategy';
import { applyLayoutOverrides } from './strategies/SubtreeStrategy';

// 간격 조정 (08-layout.md §6.8 MVP): 레이아웃·오버라이드 계산이 모두 끝난
// 좌표에 루트 위치 기준 축별 배율을 적용한다. 노드 박스 크기는 그대로 두고
// 노드 사이 거리만 늘리거나 줄이므로 어떤 레이아웃/오버라이드 조합에도
// 동일하게 동작하며, 전략 코드를 건드리지 않는다. (배율 ≥ 1은 겹침을 만들
// 수 없고, 하한 0.9는 editorUiStore에서 강제 — 그 아래는 촘촘한 레이아웃
// (트리·아래/진행트리)에서 노드 겹침이 생기는 것을 측정으로 확인)
export interface LayoutSpacing {
  x: number; // 가로 간격 배율 (1 = 기본)
  y: number; // 세로 간격 배율
}

function applySpacing(out: LaidOutNode[], spacing: LayoutSpacing): void {
  if (out.length === 0) return;
  if (Math.abs(spacing.x - 1) < 0.01 && Math.abs(spacing.y - 1) < 0.01) return;

  const rootX = out[0].x;
  const rootY = out[0].y;

  for (const n of out) {
    n.x = rootX + (n.x - rootX) * spacing.x;
    n.y = rootY + (n.y - rootY) * spacing.y;
  }
}

export function computeLayout(
  sample: SampleMap,
  layoutType: LayoutType,
  CX: number,
  CY: number,
  spacing?: LayoutSpacing,
): LaidOutNode[] {
  const activeLayoutType = normalizeLayoutType(layoutType);

  if (activeLayoutType === 'kanban') {
    return [];
  }

  const rootSize = sizeNodeForText(sample.root.text, 0, {
    minW: 170,
    maxW: 260,
  });

  const out: LaidOutNode[] = [
    {
      ...sample.root,
      layoutType: activeLayoutType,
      x: CX,
      y: CY,
      w: rootSize.w,
      h: rootSize.h,
      _lines: rootSize.lines,
      _fontSize: rootSize.fontSize,
      _fontWeight: rootSize.fontWeight,
      _lineHeight: rootSize.lineHeight,
      depth: 0,
      parent: null,
      side: 'center',
    },
  ];

  const rootW = rootSize.w;
  const branches = pruneCollapsed(sample.branches) as SampleBranch[];

  switch (activeLayoutType) {
    case 'tree-right':
      layoutTreeRight(branches, CX, CY, rootW, out);
      break;

    case 'tree-down':
      layoutTreeDown(branches, CX, CY, rootW, out);
      break;

    case 'hierarchy-right':
      layoutHierarchyRight(branches, CX, CY, rootW, out);
      break;

    case 'process-tree-right':
      layoutProcessTreeRight(branches, CX, CY, rootW, out);
      break;

    case 'radial-left':
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'left');
      break;

    case 'radial-bidirectional':
      layoutRadial(branches, CX, CY, rootW, out);
      break;

    case 'freeform':
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'right');
      break;

    case 'radial-right':
    default:
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'right');
      break;
  }

  // Per-node layout overrides (e.g. a level-2 node whose subtree uses a
  // different layout than the map).
  applyLayoutOverrides(branches, activeLayoutType, out);

  // 사용자 간격 조정 — 항상 마지막에, 최종 좌표 기준으로.
  if (spacing) applySpacing(out, spacing);

  return out;
}
