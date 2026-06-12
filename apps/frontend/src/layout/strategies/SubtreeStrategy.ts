// File: src/layout/strategies/SubtreeStrategy.ts
// Version: MVP-SubtreeStrategy-v1.1.0
// Description:
// - Applies per-node layout overrides on top of the base map layout.
// - A node whose document layoutType differs from its parent's effective
//   layout becomes a "subtree root": its descendants are removed from the
//   base layout result and re-laid-out around the node's current position
//   using the node's own layout style.
// - Supported per-subtree styles: radial (left/right), tree-right (outline),
//   tree-down, hierarchy-right, process-tree-right.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { normalizeLayoutType } from '../normalizeLayoutType';
import { layoutHierarchyChildren } from './HierarchyStrategy';
import { layoutProcessChildren } from './ProcessStrategy';

const SUBTREE_SUPPORTED = new Set<LayoutType>([
  'radial-right' as LayoutType,
  'radial-left' as LayoutType,
  'radial-bidirectional' as LayoutType,
  'tree-right' as LayoutType,
  'tree-down' as LayoutType,
  'hierarchy-right' as LayoutType,
  'process-tree-right' as LayoutType,
]);

export function applyLayoutOverrides(
  branches: SampleBranch[],
  mapLayoutType: LayoutType,
  out: LaidOutNode[],
): void {
  const rootEffective = normalizeLayoutType(mapLayoutType);

  for (const branch of branches) {
    walk(branch, rootEffective, out);
  }
}

function walk(node: MindNode, parentEffective: LayoutType, out: LaidOutNode[]): void {
  const effective = node.layoutType
    ? normalizeLayoutType(node.layoutType)
    : parentEffective;

  if (effective !== parentEffective && SUBTREE_SUPPORTED.has(effective)) {
    relayoutSubtree(node, effective, out);
  }

  for (const child of node.children ?? []) {
    walk(child, effective, out);
  }
}

function collectDescendantIds(node: MindNode, ids: Set<string>): void {
  for (const child of node.children ?? []) {
    ids.add(child.id);
    collectDescendantIds(child, ids);
  }
}

function relayoutSubtree(node: MindNode, effective: LayoutType, out: LaidOutNode[]): void {
  const anchor = out.find((laid) => laid.id === node.id);
  if (!anchor) return;

  // Tag the anchor so EdgeRenderer draws its outgoing edges in the new style.
  anchor.layoutType = effective;

  const descendantIds = new Set<string>();
  collectDescendantIds(node, descendantIds);

  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (descendantIds.has(out[i].id)) out.splice(i, 1);
  }

  const children = node.children ?? [];
  if (children.length === 0) return;

  switch (effective) {
    case 'radial-left':
      layoutCenteredChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.depth,
        node.id, 'left', 'radial-left' as LayoutType, out, node.colorKey,
      );
      break;

    case 'radial-right':
    case 'radial-bidirectional':
      layoutCenteredChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.depth,
        node.id, 'right', 'radial-right' as LayoutType, out, node.colorKey,
      );
      break;

    case 'hierarchy-right':
      layoutHierarchyChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.depth,
        node.id, out, node.colorKey,
      );
      break;

    case 'process-tree-right':
      layoutProcessChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.h, anchor.depth,
        node.id, out, node.colorKey,
      );
      break;

    case 'tree-down':
      layoutSubtreeDown(children, anchor, node, out);
      break;

    case 'tree-right':
      layoutSubtreeOutline(children, anchor, node, out);
      break;

    default:
      break;
  }
}

// --- radial (curved edges, subtree vertically centered) ---------------------

const RADIAL_H_GAP = 42;
const RADIAL_V_GAP = 10;
const RADIAL_BRANCH_V_GAP = 16;

interface MeasuredCentered {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeH: number;
  children: MeasuredCentered[];
}

function measureCentered(node: MindNode, depth: number): MeasuredCentered {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: depth <= 1 ? 150 : 130,
    maxW: depth <= 1 ? 240 : 320,
  });

  const children = (node.children ?? []).map((child) => measureCentered(child, depth + 1));

  const childrenH =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeH, 0) +
        (children.length - 1) * RADIAL_V_GAP;

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

function placeCentered(
  measured: MeasuredCentered,
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
    (measured.children.length - 1) * RADIAL_V_GAP;

  let cursorY = y - childrenH / 2;

  for (const child of measured.children) {
    const childY = cursorY + child.subtreeH / 2;

    const childX =
      side === 'right'
        ? x + measured.w / 2 + RADIAL_H_GAP + child.w / 2
        : x - measured.w / 2 - RADIAL_H_GAP - child.w / 2;

    placeCentered(
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

    cursorY += child.subtreeH + RADIAL_V_GAP;
  }
}

function layoutCenteredChildren(
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
): void {
  const measured = children.map((child) => measureCentered(child, anchorDepth + 1));

  const totalH =
    measured.length === 0
      ? 0
      : measured.reduce((sum, item) => sum + item.subtreeH, 0) +
        (measured.length - 1) * RADIAL_BRANCH_V_GAP;

  let cursorY = anchorY - totalH / 2;

  for (const item of measured) {
    const y = cursorY + item.subtreeH / 2;

    const x =
      side === 'right'
        ? anchorX + anchorW / 2 + RADIAL_H_GAP + item.w / 2
        : anchorX - anchorW / 2 - RADIAL_H_GAP - item.w / 2;

    placeCentered(item, x, y, anchorDepth + 1, parentId, side, tag, out, parentColorKey);

    cursorY += item.subtreeH + RADIAL_BRANCH_V_GAP;
  }
}

// --- tree-right (indented outline) below an anchor -------------------------

const OUTLINE_INDENT = 36;
const OUTLINE_ROW_GAP = 8;
const OUTLINE_SECTION_GAP = 10;
const OUTLINE_TOP_GAP = 26;

function layoutSubtreeOutline(
  children: MindNode[],
  anchor: LaidOutNode,
  node: MindNode,
  out: LaidOutNode[],
): void {
  const baseLeft = anchor.x - anchor.w / 2;
  const yRef = { value: anchor.y + anchor.h / 2 + OUTLINE_TOP_GAP };

  for (const child of children) {
    arrangeOutlineNode(child, baseLeft, 1, anchor.depth, node.id, yRef, out, node.colorKey);
    yRef.value += OUTLINE_SECTION_GAP;
  }
}

function arrangeOutlineNode(
  node: MindNode,
  baseLeft: number,
  relDepth: number,
  anchorDepth: number,
  parentId: string,
  yRef: { value: number },
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const depth = anchorDepth + relDepth;

  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: 150,
    maxW: 300,
  });

  const x = baseLeft + OUTLINE_INDENT * relDepth + size.w / 2;
  const y = yRef.value + size.h / 2;

  out.push({
    ...node,
    layoutType: 'tree-right' as LayoutType,
    x,
    y,
    w: size.w,
    h: size.h,
    _lines: size.lines,
    _fontSize: size.fontSize,
    _fontWeight: size.fontWeight,
    _lineHeight: size.lineHeight,
    depth,
    parent: parentId,
    side: 'right',
    parentColorKey: parentColorKey as any,
  });

  yRef.value += size.h + OUTLINE_ROW_GAP;

  for (const child of node.children ?? []) {
    arrangeOutlineNode(
      child, baseLeft, relDepth + 1, anchorDepth, node.id, yRef, out, node.colorKey,
    );
  }
}

// --- tree-down (centered columns) below an anchor ---------------------------

const DOWN_V_GAP = 56;
const DOWN_H_GAP = 24;

interface MeasuredDown {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeW: number;
  children: MeasuredDown[];
}

function measureDown(node: MindNode, depth: number): MeasuredDown {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: 120,
    maxW: 220,
  });

  const children = (node.children ?? []).map((child) => measureDown(child, depth + 1));

  const childrenW =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeW, 0) +
        (children.length - 1) * DOWN_H_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    subtreeW: Math.max(size.w, childrenW),
    children,
  };
}

function placeDown(
  measured: MeasuredDown,
  x: number,
  y: number,
  depth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  out.push({
    ...measured.node,
    layoutType: 'tree-down' as LayoutType,
    x,
    y,
    w: measured.w,
    h: measured.h,
    _lines: measured.lines,
    _fontSize: measured.fontSize,
    _fontWeight: measured.fontWeight,
    _lineHeight: measured.lineHeight,
    depth,
    parent: parentId,
    side: 'down',
    parentColorKey: parentColorKey as any,
  });

  if (measured.children.length === 0) return;

  const childrenW =
    measured.children.reduce((sum, child) => sum + child.subtreeW, 0) +
    (measured.children.length - 1) * DOWN_H_GAP;

  let cursorX = x - childrenW / 2;
  const childTop = y + measured.h / 2 + DOWN_V_GAP;

  for (const child of measured.children) {
    placeDown(
      child,
      cursorX + child.subtreeW / 2,
      childTop + child.h / 2,
      depth + 1,
      measured.node.id,
      out,
      measured.node.colorKey,
    );

    cursorX += child.subtreeW + DOWN_H_GAP;
  }
}

function layoutSubtreeDown(
  children: MindNode[],
  anchor: LaidOutNode,
  node: MindNode,
  out: LaidOutNode[],
): void {
  const measured = children.map((child) => measureDown(child, anchor.depth + 1));

  const totalW =
    measured.length === 0
      ? 0
      : measured.reduce((sum, item) => sum + item.subtreeW, 0) +
        (measured.length - 1) * DOWN_H_GAP;

  let cursorX = anchor.x - totalW / 2;
  const childTop = anchor.y + anchor.h / 2 + DOWN_V_GAP;

  for (const item of measured) {
    placeDown(
      item,
      cursorX + item.subtreeW / 2,
      childTop + item.h / 2,
      anchor.depth + 1,
      node.id,
      out,
      node.colorKey,
    );

    cursorX += item.subtreeW + DOWN_H_GAP;
  }
}
