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

export function EdgeRenderer({ from, to, t, layoutType }: Props) {
  const width = from.depth === 0 ? 2.3 : 1.6;

  // The parent's layout determines how its outgoing edges are drawn, so
  // subtrees with their own layoutType render with matching edges.
  const effectiveType = from.layoutType ?? to.layoutType ?? layoutType;

  const d = isRadialLayout(effectiveType)
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
