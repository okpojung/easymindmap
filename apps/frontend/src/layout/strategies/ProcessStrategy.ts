// File: src/layout/strategies/ProcessStrategy.ts
// Version: MVP-ProcessStrategy-RecursiveRows-v5.0.0
// Reference: docs/assets/layout_진행트리형.png,
//            docs/assets/트리오른쪽_계층형오른쪽_진행트리오른쪽.JPG
// Description:
// - process-tree-right ("오른쪽-진행트리"):
//   · A node sits at the TOP; its children are placed in a single
//     HORIZONTAL ROW directly BELOW it, flowing left → right.
//   · This applies at EVERY level (recursively): a stage's children form a
//     row below the stage, each child's own children form a row below it,
//     and so on. (This is what distinguishes 진행트리 from 트리오른쪽, where
//     children stack vertically as an indented outline.)
//   · The connector drops from the parent's bottom, runs along a horizontal
//     spine, then drops into the TOP edge of each child
//     (EdgeRenderer.createProcessPath).
//   · Each subtree reserves a "block" whose width is the wider of the node
//     box and its children row, so neighbouring subtrees never collide.
// - layoutProcessChildren() is shared with SubtreeStrategy so the same
//   recursive placement can be applied below any selected node.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

const ROOT_Y_OFFSET = 250;        // root near the top of the viewBox
const ROOT_MIN_LEFT = 40;

const ROW_GAP = 48;               // parent bottom → children row top
const COL_GAP = 28;               // horizontal gap between sibling subtree blocks
const ROOT_TO_STAGE_ROW_GAP = 56; // root bottom → first (stage) row top

const PROCESS_TAG = 'process-tree-right' as LayoutType;

interface Measured {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  children: Measured[];
  blockW: number; // width reserved for this node and its whole subtree
}

// Bottom-up measure: a subtree's block is as wide as the wider of the node
// box and the horizontal row formed by its children's blocks.
function measure(node: MindNode, depth: number): Measured {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: depth <= 1 ? 140 : 130,
    maxW: 220,
  });

  const children = (node.children ?? []).map((child) => measure(child, depth + 1));

  const childrenRowW =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.blockW, 0) +
        (children.length - 1) * COL_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    children,
    blockW: Math.max(size.w, childrenRowW),
  };
}

// Width of the horizontal row formed by a list of measured subtrees.
function rowWidth(items: Measured[]): number {
  return items.length === 0
    ? 0
    : items.reduce((sum, m) => sum + m.blockW, 0) + (items.length - 1) * COL_GAP;
}

// Places `m` inside a block whose LEFT edge is `left`, with the node TOP at
// `top`. The layout is LEFT-ANCHORED: the node sits at the top-LEFT of its
// block and its children row begins at the same left edge, so the node sits
// above the leftmost child and the children fan out to the RIGHT (the
// 진행트리오른쪽 reference shape). Applied recursively at every level.
function place(
  m: Measured,
  left: number,
  top: number,
  depth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const x = left + m.w / 2;
  const y = top + m.h / 2;

  out.push({
    ...m.node,
    layoutType: PROCESS_TAG,
    x,
    y,
    w: m.w,
    h: m.h,
    _lines: m.lines,
    _fontSize: m.fontSize,
    _fontWeight: m.fontWeight,
    _lineHeight: m.lineHeight,
    depth,
    parent: parentId,
    side: 'down',
    parentColorKey: parentColorKey as any,
  });

  if (m.children.length === 0) return;

  const childTop = y + m.h / 2 + ROW_GAP;
  let cursorLeft = left; // children begin at the node's left edge

  for (const child of m.children) {
    place(child, cursorLeft, childTop, depth + 1, m.node.id, out, m.node.colorKey ?? parentColorKey);
    cursorLeft += child.blockW + COL_GAP;
  }
}

// Lays `stages` out as a horizontal row below an anchor node, the row LEFT-
// aligned to the anchor's left edge, each stage recursively expanding its own
// subtree downward. Shared with SubtreeStrategy.
export function layoutProcessChildren(
  stages: MindNode[],
  anchorX: number,
  anchorY: number,
  anchorW: number,
  anchorH: number,
  anchorDepth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const measured = stages.map((stage) => measure(stage, anchorDepth + 1));

  const childTop = anchorY + anchorH / 2 + ROW_GAP;
  let cursorLeft = anchorX - anchorW / 2;

  for (const m of measured) {
    place(m, cursorLeft, childTop, anchorDepth + 1, parentId, out, parentColorKey);
    cursorLeft += m.blockW + COL_GAP;
  }
}

export function layoutProcessTreeRight(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const rootH = out[0].h;
  const measured = branches.map((branch) => measure(branch, 1));

  const stagesRowW = rowWidth(measured);

  // Center the whole block (root + stage flow) horizontally in the viewBox.
  // The root sits at the top-LEFT and the stage row begins at the same left
  // edge (left-anchored, consistent with every level).
  const totalW = Math.max(rootW, stagesRowW);
  const blockLeft = Math.max(CX - totalW / 2, ROOT_MIN_LEFT);

  const rootX = blockLeft + rootW / 2;
  const rootY = CY - ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'down';
  out[0].layoutType = PROCESS_TAG;

  const childTop = rootY + rootH / 2 + ROOT_TO_STAGE_ROW_GAP;
  let cursorLeft = blockLeft;

  for (const m of measured) {
    place(m, cursorLeft, childTop, 1, 'root', out);
    cursorLeft += m.blockW + COL_GAP;
  }
}
