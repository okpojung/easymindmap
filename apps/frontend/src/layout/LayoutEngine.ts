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
import { nodeSizingOpts } from '@/editor/node-renderer/nodeContent';
import type {
  LayoutType,
  SampleMap,
  SampleBranch,
  SampleRoot,
  MindNode,
} from '@/editor/__samples__/types';
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
import { layoutTimeline, layoutTimelineCenter } from './strategies/TimelineStrategy';
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

// 여러 중심주제 (2026-09-15, mmd 표준 세션 결정) — 두 번째 이후의 중심은
// 앞 중심들의 오른쪽에, 이 간격을 두고 놓는다 (사용자가 옮긴 자리
// `pos` 가 있으면 그 자리). 중심마다 자기 레이아웃으로 따로 배치하므로
// 전략 코드는 중심이 여럿인 것을 모른다.
export const CENTER_GAP = 160;

interface Box { minX: number; maxX: number; minY: number; maxY: number }

function boxOf(nodes: LaidOutNode[]): Box {
  const b: Box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const n of nodes) {
    b.minX = Math.min(b.minX, n.x - n.w / 2);
    b.maxX = Math.max(b.maxX, n.x + n.w / 2);
    b.minY = Math.min(b.minY, n.y - n.h / 2);
    b.maxY = Math.max(b.maxY, n.y + n.h / 2);
  }
  return b;
}

/**
 * 맵 전체 배치 — 첫 중심(root/branches)은 (CX, CY) 에, 두 번째 이후의
 * 중심(`sample.centers`)은 각각 자기 자리에. 돌려주는 배열은 중심 순서대로
 * 이어 붙인 것이고, 중심 루트는 모두 `depth 0 · parent null` 이다.
 */
export function computeLayout(
  sample: SampleMap,
  layoutType: LayoutType,
  CX: number,
  CY: number,
  spacing?: LayoutSpacing,
): LaidOutNode[] {
  if (normalizeLayoutType(layoutType) === 'kanban') {
    return [];
  }

  const out = computeCenterLayout(sample.root, sample.branches, layoutType, CX, CY, spacing);
  const extra = sample.centers ?? [];
  if (extra.length === 0) return out;

  // 지금까지 놓인 것의 테두리 — 다음 자동 배치 중심은 그 오른쪽에
  let box = boxOf(out);
  for (const c of extra) {
    // 중심마다 자기 루트의 레이아웃(없으면 맵 레이아웃). 원점(0,0)에
    // 배치한 뒤 통째로 옮긴다 — 간격 배율도 그 안에서 루트 기준으로 적용됐다.
    const part = computeCenterLayout(
      c.root, c.branches, c.root.layoutType ?? layoutType, 0, 0, spacing,
    );
    if (part.length === 0) continue;
    let dx: number;
    let dy: number;
    if (c.pos) {
      // 사용자가 옮긴 자리 — 첫 중심 루트 기준 상대 좌표
      dx = CX + c.pos.dx;
      dy = CY + c.pos.dy;
    } else {
      const pb = boxOf(part);
      dx = box.maxX + CENTER_GAP - pb.minX; // 왼쪽 끝이 앞 테두리 + 간격
      dy = CY; // 루트 높이는 첫 중심과 나란히
    }
    for (const n of part) {
      n.x += dx;
      n.y += dy;
    }
    out.push(...part);
    const pb = boxOf(part);
    box = {
      minX: Math.min(box.minX, pb.minX),
      maxX: Math.max(box.maxX, pb.maxX),
      minY: Math.min(box.minY, pb.minY),
      maxY: Math.max(box.maxY, pb.maxY),
    };
  }
  return out;
}

/** 중심주제 하나(루트 + 가지들)의 배치 — 루트를 (CX, CY) 에 놓는다. */
function computeCenterLayout(
  root: SampleRoot,
  rawBranches: SampleBranch[],
  layoutType: LayoutType,
  CX: number,
  CY: number,
  spacing?: LayoutSpacing,
): LaidOutNode[] {
  const activeLayoutType = normalizeLayoutType(layoutType);

  if (activeLayoutType === 'kanban') {
    return [];
  }

  const rootSize = sizeNodeForText(root.text, 0, {
    ...nodeSizingOpts(root),
    minW: 170,
    maxW: 260,
  });

  const out: LaidOutNode[] = [
    {
      ...root,
      layoutType: activeLayoutType,
      x: CX,
      y: CY,
      w: rootSize.w,
      h: rootSize.h,
      _lines: rootSize.lines,
      _manualStarts: rootSize.manualStarts,
      _fontSize: rootSize.fontSize,
      _fontWeight: rootSize.fontWeight,
      _lineHeight: rootSize.lineHeight,
      depth: 0,
      parent: null,
      side: 'center',
    },
  ];

  const rootW = rootSize.w;
  const branches = pruneCollapsed(rawBranches) as SampleBranch[];

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

    case 'timeline':
      layoutTimeline(branches, CX, CY, rootW, out);
      break;

    case 'timeline-center':
      layoutTimelineCenter(branches, CX, CY, rootW, out);
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

  // ★ 전략들은 최상위 가지의 부모를 글자 그대로 `'root'` 로 박는다
  //   (Radial·Tree·Hierarchy·Process·Timeline). 두 번째 이후의 중심은 루트
  //   id 가 다르므로 여기서 바꿔 준다 — 안 바꾸면 캔버스가 그 가지의
  //   연결선을 **첫 중심에서** 긋고, 포커스·서브트리 순회가 중심을 넘나든다
  //   (PR #490 Codex 지적). 전략 코드는 중심이 여럿인 것을 몰라도 된다.
  if (root.id !== 'root') {
    for (const n of out) if (n.parent === 'root') n.parent = root.id;
  }

  return out;
}
