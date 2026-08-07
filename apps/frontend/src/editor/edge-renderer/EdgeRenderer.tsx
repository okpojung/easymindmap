// File: src/editor/edge-renderer/EdgeRenderer.tsx
// Version: MVP-EdgeRenderer-PerNodeLayout-v2.0.0
// Description:
// - Edge style is resolved per edge from the PARENT node's laid-out
//   layoutType (falling back to the map layoutType), so mixed layouts
//   (per-subtree overrides) render correctly.
// - Radial layouts use curve edges.
// - Tree-right uses outline-style orthogonal edges (parent bottom-left → child left).
// - Hierarchy-right uses centered orthogonal elbow edges (parent right → child left).
// - Tree-down uses vertical-down orthogonal edges.
// - Process-tree uses horizontal stage edges + vertical column edges,
//   chosen by geometry so subtree overrides also connect cleanly.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

interface Props {
  from: LaidOutNode;
  to: LaidOutNode;
  t: ThemeTokens;
  layoutType: LayoutType;
}

function isRadialLayout(layoutType?: LayoutType): boolean {
  return (
    layoutType === 'radial' ||
    layoutType === 'both-radial' ||
    layoutType === 'radial-right' ||
    layoutType === 'radial-left' ||
    layoutType === 'radial-bidirectional' ||
    layoutType === 'free' ||
    layoutType === 'freeform'
  );
}

function isTreeRightLayout(layoutType?: LayoutType): boolean {
  return layoutType === 'tree' || layoutType === 'tree-right';
}

function isTreeDownLayout(layoutType?: LayoutType): boolean {
  return layoutType === 'tree-down';
}

function isHierarchyLayout(layoutType?: LayoutType): boolean {
  return layoutType === 'hierarchy' || layoutType === 'hierarchy-right';
}

function isTimelineLayout(layoutType?: LayoutType): boolean {
  return layoutType === 'timeline' || layoutType === 'timeline-center';
}

function isProcessLayout(layoutType?: LayoutType): boolean {
  return (
    layoutType === 'progress-tree' ||
    layoutType === 'process-tree-right' ||
    layoutType === 'process-tree-right-a' ||
    layoutType === 'process-tree-right-b'
  );
}

function createRadialPath(from: LaidOutNode, to: LaidOutNode): string {
  const isLeft = to.side === 'left';

  const fromX = isLeft ? from.x - from.w / 2 : from.x + from.w / 2;
  const toX = isLeft ? to.x + to.w / 2 : to.x - to.w / 2;

  const fromY = from.y;
  const toY = to.y;

  // markmap-style link — d3.linkHorizontal() (= link(curveBumpX)): a cubic
  // Bézier whose BOTH control points sit at the horizontal MIDPOINT, giving a
  // smooth symmetric S-curve with horizontal tangents at each end (the markmap
  // connector look). Because the control points are exactly at the midpoint
  // they never pass the endpoints, so the curves never overshoot or overlap.
  const midX = (fromX + toX) / 2;

  return `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`;
}

function createTreeDownPath(from: LaidOutNode, to: LaidOutNode): string {
  const fromX = from.x;
  const fromY = from.y + from.h / 2;

  const toX = to.x;
  const toY = to.y - to.h / 2;

  const midY = fromY + (toY - fromY) / 2;

  return `M ${fromX} ${fromY} V ${midY} H ${toX} V ${toY}`;
}

// Outline (tree-right) edge: parent bottom-left → down → child left edge.
function createOutlinePath(from: LaidOutNode, to: LaidOutNode): string {
  const fromX = from.x - from.w / 2 + 12;
  const fromY = from.y + from.h / 2;

  const toX = to.x - to.w / 2;
  const toY = to.y;

  return `M ${fromX} ${fromY} V ${toY} H ${toX}`;
}

// Centered hierarchy edge: parent right edge → elbow → child left edge.
function createHierarchyPath(from: LaidOutNode, to: LaidOutNode): string {
  const goesLeft = to.side === 'left';

  const fromX = goesLeft ? from.x - from.w / 2 : from.x + from.w / 2;
  const toX = goesLeft ? to.x + to.w / 2 : to.x - to.w / 2;

  const fromY = from.y;
  const toY = to.y;

  const midX = fromX + (toX - fromX) / 2;

  return `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;
}

// Process-tree edge (every level): drop from just inside the parent's LEFT
// edge, run right along a horizontal spine, then drop into the child's TOP-LEFT
// (same left inset), so the connector runs down each node's left side — the
// 진행트리오른쪽 reference connector.
const PROCESS_SPINE_INSET = 14;

function createProcessPath(from: LaidOutNode, to: LaidOutNode): string {
  const fromBottom = from.y + from.h / 2;
  const toTop = to.y - to.h / 2;
  const fromSpineX = from.x - from.w / 2 + PROCESS_SPINE_INSET;
  const toSpineX = to.x - to.w / 2 + PROCESS_SPINE_INSET;

  if (Math.abs(toSpineX - fromSpineX) < 1) {
    return `M ${fromSpineX} ${fromBottom} V ${toTop}`;
  }

  const midY = fromBottom + (toTop - fromBottom) / 2;
  return `M ${fromSpineX} ${fromBottom} V ${midY} H ${toSpineX} V ${toTop}`;
}

// 시간배치: 루트→주제는 시간축(루트 중앙 높이 수평선)을 따라가다 주제로
// 꺾이고, 주제 이하는 왼쪽 스파인 세로 아웃라인(위/아래 방향)이다.
function createTimelinePath(from: LaidOutNode, to: LaidOutNode): string {
  // **축의 시작점 → 축 위 노드**: 축을 따라가다 그 노드로 꺾인다.
  //
  // 판정은 `to._timelineRole === 'axis'` 다 — `from.depth === 0` 이 아니다.
  // 시간배치를 **서브트리에 걸면** 축의 시작점이 중심 주제가 아니라 고른
  // 노드라, depth 로 보면 이 경로를 못 찾고 아래의 세로 스파인이 걸렸다.
  // 그래서 연결선이 노드 오른쪽이 아니라 위/아래에서 나갔다 (2026-08-07
  // 보고 1·3·4번).
  //
  // 시간배치(중앙노드)에서는 이 경로 자체를 쓰지 않는다 — 시작점과 축
  // 노드가 모두 축 위에 있어 **시간축 토막이 곧 연결선**이고, Canvas 가
  // 이 엣지를 그리지 않는다.
  if (to._timelineRole === 'axis') {
    // **언제나 시작점의 오른쪽 변에서 출발한다** (사용자 요청 4번).
    const fromX = from.x + from.w / 2;
    const toEdgeY = to.y > from.y ? to.y - to.h / 2 : to.y + to.h / 2;
    return `M ${fromX} ${from.y} H ${to.x} V ${toEdgeY}`;
  }
  const spineX = from.x - from.w / 2 + 12;
  const goesUp = to.side === 'up';
  const fromY = goesUp ? from.y - from.h / 2 : from.y + from.h / 2;
  const toX = to.x - to.w / 2;
  return `M ${spineX} ${fromY} V ${to.y} H ${toX}`;
}

export function EdgeRenderer({ from, to, t, layoutType }: Props) {
  const width = from.depth === 0 ? 2.3 : 1.6;

  // The parent's layout determines how its outgoing edges are drawn, so
  // subtrees with their own layoutType render with matching edges.
  const effectiveType = from.layoutType ?? to.layoutType ?? layoutType;

  // **배치가 남긴 사실이 먼저다.** `to._timelineRole` 이 있으면 그 노드는
  // 시간배치가 놓은 것이므로 시간배치 엣지를 쓴다 — 서브트리에 걸었을 때
  // 축 노드의 **자식**은 `from.layoutType` 이 비어 있어 맵 레이아웃
  // (예: 진행트리)이 잡히고, 그래서 연결선이 엉뚱한 데서 나갔다
  // (2026-08-07 보고 3번).
  const d = (to._timelineRole !== undefined || isTimelineLayout(effectiveType))
    ? createTimelinePath(from, to)
    : isRadialLayout(effectiveType)
    ? createRadialPath(from, to)
    : isProcessLayout(effectiveType)
      ? createProcessPath(from, to)
      : isTreeDownLayout(effectiveType)
        ? createTreeDownPath(from, to)
        : isHierarchyLayout(effectiveType)
          ? createHierarchyPath(from, to)
          : isTreeRightLayout(effectiveType)
            ? createOutlinePath(from, to)
            : createOutlinePath(from, to);

  return (
    <path
      d={d}
      fill="none"
      stroke={t.edge}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}
