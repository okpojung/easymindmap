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

  const distance = Math.abs(toX - fromX);
  const offset = Math.max(36, Math.min(120, distance * 0.45));

  const c1x = isLeft ? fromX - offset : fromX + offset;
  const c2x = isLeft ? toX + offset : toX - offset;

  return `M ${fromX} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${toX} ${toY}`;
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

function createProcessPath(from: LaidOutNode, to: LaidOutNode): string {
  const fromBottom = from.y + from.h / 2;
  const toTop = to.y - to.h / 2;

  // Root → stage row: drop from the root's bottom, run along a horizontal
  // spine, then drop into each stage's TOP edge.
  if (from.depth === 0) {
    if (Math.abs(to.x - from.x) < 1) {
      return `M ${from.x} ${fromBottom} V ${toTop}`;
    }

    const midY = fromBottom + (toTop - fromBottom) / 2;
    return `M ${from.x} ${fromBottom} V ${midY} H ${to.x} V ${toTop}`;
  }

  // Inside a stage column the descendants form a left-aligned outline.
  // Edge = vertical spine just inside the parent's left edge, then right
  // into the child's left edge (steps right for each deeper indent level).
  const spineX = from.x - from.w / 2 + 14;
  const childLeft = to.x - to.w / 2;

  if (toTop >= from.y) {
    return `M ${spineX} ${fromBottom} V ${to.y} H ${childLeft}`;
  }

  // Fallback (child beside the parent, e.g. nested process override):
  // horizontal elbow into the child's left edge.
  const fromRight = from.x + from.w / 2;
  const midX = fromRight + (childLeft - fromRight) / 2;

  return `M ${fromRight} ${from.y} H ${midX} V ${to.y} H ${childLeft}`;
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
