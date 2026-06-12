// File: src/layout/strategies/HierarchyStrategy.ts
// Version: MVP-HierarchyStrategy-CenteredRight-v2.0.0
// Description:
// - hierarchy-right: classic logic-chart layout.
//   Root sits at the left edge, vertically centered.
//   Children grow to the right; each subtree is vertically centered on its parent.
//   Edges are orthogonal elbows (EdgeRenderer.createHierarchyPath).
// - Distinct from tree-right, which is the indented outline layout.
// - layoutCenteredChildren() is shared with SubtreeStrategy so the same
//   placement can be applied below any selected node.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

const H_GAP = 56;
const V_GAP = 12;
const BRANCH_V_GAP = 16;
const ROOT_TO_BRANCH_GAP = 90;
const ROOT_X_OFFSET = 470;

interface MeasuredNode {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeH: number;
  children: MeasuredNode[];
}

function measureNode(node: MindNode, depth: number): MeasuredNode {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: depth <= 1 ? 150 : 130,
    maxW: depth <= 1 ? 240 : 320,
  });

  const children = (node.children ?? []).map((child) => measureNode(child, depth + 1));

  const childrenH =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeH, 0) +
        (children.length - 1) * V_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    subtreeH: Math.max(size.h, childrenH),
    children,
  };
}

function placeNode(
  measured: MeasuredNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  side: 'left' | 'right',
  tag: LayoutType,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  out.push({
    ...measured.node,
    layoutType: tag,
    x,
    y,
    w: measured.w,
    h: measured.h,
    _lines: measured.lines,
    _fontSize: measured.fontSize,
    _fontWeight: measured.fontWeight,
    _lineHeight: measured.lineHeight,
    depth,
    parent,
    side,
    parentColorKey: parentColorKey as any,
  });

  if (measured.children.length === 0) return;

  const childrenH =
    measured.children.reduce((sum, child) => sum + child.subtreeH, 0) +
    (measured.children.length - 1) * V_GAP;

  let cursorY = y - childrenH / 2;

  for (const child of measured.children) {
    const childY = cursorY + child.subtreeH / 2;

    const childX =
      side === 'right'
        ? x + measured.w / 2 + H_GAP + child.w / 2
        : x - measured.w / 2 - H_GAP - child.w / 2;

    placeNode(
      child,
      childX,
      childY,
      depth + 1,
      measured.node.id,
      side,
      tag,
      out,
      measured.node.colorKey,
    );

    cursorY += child.subtreeH + V_GAP;
  }
}

// Lays out `children` beside an arbitrary anchor node, subtree-centered.
// Used both for the whole-map hierarchy layout (anchor = root) and for
// per-node layout overrides (SubtreeStrategy).
export function layoutCenteredChildren(
  children: MindNode[],
  anchorX: number,
  anchorY: number,
  anchorW: number,
  anchorDepth: number,
  parentId: string,
  side: 'left' | 'right',
  tag: LayoutType,
  out: LaidOutNode[],
  parentColorKey?: string,
  gap: number = H_GAP,
): void {
  const measured = children.map((child) => measureNode(child, anchorDepth + 1));

  const totalH =
    measured.length === 0
      ? 0
      : measured.reduce((sum, item) => sum + item.subtreeH, 0) +
        (measured.length - 1) * BRANCH_V_GAP;

  let cursorY = anchorY - totalH / 2;

  for (const item of measured) {
    const y = cursorY + item.subtreeH / 2;

    const x =
      side === 'right'
        ? anchorX + anchorW / 2 + gap + item.w / 2
        : anchorX - anchorW / 2 - gap - item.w / 2;

    placeNode(item, x, y, anchorDepth + 1, parentId, side, tag, out, parentColorKey);

    cursorY += item.subtreeH + BRANCH_V_GAP;
  }
}

export function layoutHierarchyRight(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const rootX = CX - ROOT_X_OFFSET;

  out[0].x = rootX;
  out[0].y = CY;
  out[0].side = 'right';
  out[0].layoutType = 'hierarchy-right' as LayoutType;

  layoutCenteredChildren(
    branches,
    rootX,
    CY,
    rootW,
    0,
    'root',
    'right',
    'hierarchy-right' as LayoutType,
    out,
    undefined,
    ROOT_TO_BRANCH_GAP,
  );
}
