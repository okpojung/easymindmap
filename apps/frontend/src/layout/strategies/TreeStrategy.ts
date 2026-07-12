// File: src/layout/strategies/TreeStrategy.ts
// Version: MVP-TreeStrategy-TreeRight-Fix-v1.0.0
// Description:
// - layoutTreeRight() now owns the correct right-tree layout.
// - Tree-right is an outline-like right tree:
//   root on upper-left, branches listed downward, deeper levels indented right.
// - layoutTreeDown() keeps recursive downward tree behavior.
// - This avoids confusing tree-right with hierarchy-right dispatch.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import { contentIndicatorCount } from '@/editor/node-renderer/nodeContent';
import type { MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { nodeOverhang } from '../tagOverhang';

const TREE_RIGHT_ROOT_X_OFFSET = 430;
const TREE_RIGHT_ROOT_Y_OFFSET = 235;
const TREE_RIGHT_INDENT = 36;
const TREE_RIGHT_ROW_GAP = 8;
const TREE_RIGHT_SECTION_GAP = 10;

const TREE_DOWN_ROOT_Y_OFFSET = 260;
const TREE_DOWN_ROOT_TO_BRANCH_GAP = 86;
const TREE_DOWN_CHILD_GAP = 70;
const TREE_DOWN_CHILD_H_GAP = 24;
const TREE_DOWN_BRANCH_H_GAP = 38;

interface MeasuredDownNode {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeW: number;
  children: MeasuredDownNode[];
}

function measureTreeRightNode(node: MindNode, depth: number) {
  return sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    indicators: contentIndicatorCount(node),
    minW: depth <= 1 ? 180 : 190,
    maxW: depth <= 1 ? 300 : 340,
  });
}

function pushTreeRightNode(
  out: LaidOutNode[],
  node: MindNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  parentColorKey?: string,
): void {
  const size = measureTreeRightNode(node, depth);

  out.push({
    ...node,
    layoutType: 'tree-right' as any,
    x,
    y,
    w: size.w,
    h: size.h,
    _lines: size.lines,
    _fontSize: size.fontSize,
    _fontWeight: size.fontWeight,
    _lineHeight: size.lineHeight,
    depth,
    parent,
    side: 'right',
    parentColorKey: parentColorKey as any,
  });
}

function arrangeTreeRightNode(
  node: MindNode,
  rootLeft: number,
  depth: number,
  parentId: string,
  yRef: { value: number },
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const size = measureTreeRightNode(node, depth);

  const x = rootLeft + TREE_RIGHT_INDENT * depth + size.w / 2;
  const y = yRef.value + size.h / 2;

  pushTreeRightNode(out, node, x, y, depth, parentId, parentColorKey);

  // Reserve room for tag chips below the node so the next outline row clears them.
  yRef.value += size.h + TREE_RIGHT_ROW_GAP + nodeOverhang(node);

  for (const child of node.children ?? []) {
    arrangeTreeRightNode(
      child,
      rootLeft,
      depth + 1,
      node.id,
      yRef,
      out,
      node.colorKey,
    );
  }
}

export function layoutTreeRight(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  _rootW: number,
  out: LaidOutNode[],
): void {
  const rootX = CX - TREE_RIGHT_ROOT_X_OFFSET;
  const rootY = CY - TREE_RIGHT_ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'right';
  out[0].layoutType = 'tree-right' as any;

  const rootLeft = rootX - out[0].w / 2;

  const yRef = {
    value: rootY + out[0].h / 2 + 28,
  };

  for (const branch of branches) {
    arrangeTreeRightNode(branch, rootLeft, 1, 'root', yRef, out);
    yRef.value += TREE_RIGHT_SECTION_GAP;
  }
}

function measureDownNode(node: MindNode, depth: number): MeasuredDownNode {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    indicators: contentIndicatorCount(node),
    minW: depth <= 1 ? 140 : 120,
    maxW: depth <= 1 ? 230 : 220,
  });

  const children = (node.children ?? []).map((child) =>
    measureDownNode(child, depth + 1),
  );

  const childrenTotalW =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeW, 0) +
        (children.length - 1) * TREE_DOWN_CHILD_H_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    subtreeW: Math.max(size.w, childrenTotalW),
    children,
  };
}

function pushDownNode(
  out: LaidOutNode[],
  measured: MeasuredDownNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  parentColorKey?: string,
): void {
  out.push({
    ...measured.node,
    layoutType: 'tree-down' as any,
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
    side: 'down',
    parentColorKey: parentColorKey as any,
  });
}

function arrangeDownNode(
  measured: MeasuredDownNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  pushDownNode(out, measured, x, y, depth, parent, parentColorKey);

  if (measured.children.length === 0) return;

  const childrenTotalW =
    measured.children.reduce((sum, child) => sum + child.subtreeW, 0) +
    (measured.children.length - 1) * TREE_DOWN_CHILD_H_GAP;

  let childLeftX = x - childrenTotalW / 2;
  const childY = y + measured.h / 2 + TREE_DOWN_CHILD_GAP + nodeOverhang(measured.node);

  for (const child of measured.children) {
    const childCenterX = childLeftX + child.subtreeW / 2;
    const childCenterY = childY + child.h / 2;

    arrangeDownNode(
      child,
      childCenterX,
      childCenterY,
      depth + 1,
      measured.node.id,
      out,
      measured.node.colorKey,
    );

    childLeftX += child.subtreeW + TREE_DOWN_CHILD_H_GAP;
  }
}

export function layoutTreeDown(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  _rootW: number,
  out: LaidOutNode[],
): void {
  const rootY = CY - TREE_DOWN_ROOT_Y_OFFSET;

  out[0].x = CX;
  out[0].y = rootY;
  out[0].side = 'down';
  out[0].layoutType = 'tree-down' as any;

  const measuredBranches = branches.map((branch) => measureDownNode(branch, 1));

  const totalW =
    measuredBranches.length === 0
      ? 0
      : measuredBranches.reduce((sum, branch) => sum + branch.subtreeW, 0) +
        (measuredBranches.length - 1) * TREE_DOWN_BRANCH_H_GAP;

  let branchLeftX = CX - totalW / 2;
  const branchY = rootY + out[0].h / 2 + TREE_DOWN_ROOT_TO_BRANCH_GAP + nodeOverhang(out[0]);

  for (const branch of measuredBranches) {
    const branchCenterX = branchLeftX + branch.subtreeW / 2;
    const branchCenterY = branchY + branch.h / 2;

    arrangeDownNode(branch, branchCenterX, branchCenterY, 1, 'root', out);

    branchLeftX += branch.subtreeW + TREE_DOWN_BRANCH_H_GAP;
  }
}