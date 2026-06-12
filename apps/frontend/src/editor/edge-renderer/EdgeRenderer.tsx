// File: src/editor/edge-renderer/EdgeRenderer.tsx
// Version: MVP-EdgeRenderer-TreeRight-As-Hierarchy-v1.0.0
// Description:
// - Radial layouts use curve edges.
// - Tree-right uses hierarchy-style orthogonal edges.
// - Hierarchy-right uses hierarchy-style orthogonal edges.
// - Tree-down uses vertical-down orthogonal edges.
// - Process-tree uses horizontal stage + vertical card edges.

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
    layoutType === 'radial-bidirectional'
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

function createHierarchyLikePath(from: LaidOutNode, to: LaidOutNode): string {
  const fromX = from.x - from.w / 2 + 12;
  const fromY = from.y + from.h / 2;

  const toX = to.x - to.w / 2;
  const toY = to.y;

  return `M ${fromX} ${fromY} V ${toY} H ${toX}`;
}

function createProcessPath(from: LaidOutNode, to: LaidOutNode): string {
  if (to.depth === 1) {
    const fromX = from.x + from.w / 2;
    const fromY = from.y;

    const toX = to.x - to.w / 2;
    const toY = to.y;

    return `M ${fromX} ${fromY} H ${toX}`;
  }

  const fromX = from.x;
  const fromY = from.y + from.h / 2;

  const toX = to.x;
  const toY = to.y - to.h / 2;

  return `M ${fromX} ${fromY} V ${toY}`;
}

export function EdgeRenderer({ from, to, t, layoutType }: Props) {
  const width = from.depth === 0 ? 2.3 : 1.6;

  const d = isRadialLayout(layoutType)
    ? createRadialPath(from, to)
    : isProcessLayout(layoutType)
      ? createProcessPath(from, to)
      : isTreeDownLayout(layoutType)
        ? createTreeDownPath(from, to)
        : isTreeRightLayout(layoutType) || isHierarchyLayout(layoutType)
          ? createHierarchyLikePath(from, to)
          : createHierarchyLikePath(from, to);

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