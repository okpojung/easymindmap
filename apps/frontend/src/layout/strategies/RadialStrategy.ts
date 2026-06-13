import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { tagOverhang } from '../tagOverhang';

const V_GAP = 10;
const H_GAP = 42;
const ROOT_TO_BRANCH_GAP = 90;

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

  // Each child reserves its subtree height PLUS room for its own tag chips.
  const childrenTotalH =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeH + tagOverhang(child.node), 0) +
        (children.length - 1) * V_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    subtreeH: Math.max(size.h, childrenTotalH),
    children,
  };
}

function pushLaidOutNode(
  out: LaidOutNode[],
  measured: MeasuredNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  side: 'left' | 'right',
  parentColorKey?: string,
) {
  out.push({
    ...measured.node,
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
}

function layoutMeasuredNode(
  measured: MeasuredNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  side: 'left' | 'right',
  out: LaidOutNode[],
  parentColorKey?: string,
) {
  pushLaidOutNode(out, measured, x, y, depth, parent, side, parentColorKey);

  if (measured.children.length === 0) return;

  const childrenTotalH =
    measured.children.reduce((sum, child) => sum + child.subtreeH + tagOverhang(child.node), 0) +
    (measured.children.length - 1) * V_GAP;

  let childY = y - childrenTotalH / 2;

  for (const child of measured.children) {
    // Place the node at the TOP of its slot so its tag overhang sits below it.
    const childCenterY = childY + child.subtreeH / 2;

    const childX =
      side === 'right'
        ? x + measured.w / 2 + H_GAP + child.w / 2
        : x - measured.w / 2 - H_GAP - child.w / 2;

    layoutMeasuredNode(
      child,
      childX,
      childCenterY,
      depth + 1,
      measured.node.id,
      side,
      out,
      measured.node.colorKey,
    );

    childY += child.subtreeH + tagOverhang(child.node) + V_GAP;
  }
}

// Radial — bidirectional
export function layoutRadial(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const rightBranches = branches.filter((branch) => branch.side === 'right');
  const leftBranches = branches.filter((branch) => branch.side === 'left');

  layoutSide(rightBranches, 'right', CX, CY, rootW, out);
  layoutSide(leftBranches, 'left', CX, CY, rootW, out);
}

// Radial — single side
export function layoutRadialOneSide(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
  side: 'left' | 'right',
): void {
  layoutSide(branches, side, CX, CY, rootW, out);
}

function layoutSide(
  branches: SampleBranch[],
  side: 'left' | 'right',
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
) {
  const measuredBranches = branches.map((branch) => measureNode(branch, 1));

  const totalH =
    measuredBranches.length === 0
      ? 0
      : measuredBranches.reduce((sum, item) => sum + item.subtreeH + tagOverhang(item.node), 0) +
        (measuredBranches.length - 1) * 16;

  let yStart = CY - totalH / 2;

  for (const measured of measuredBranches) {
    const branchY = yStart + measured.subtreeH / 2;

    const branchX =
      side === 'right'
        ? CX + rootW / 2 + ROOT_TO_BRANCH_GAP + measured.w / 2
        : CX - rootW / 2 - ROOT_TO_BRANCH_GAP - measured.w / 2;

    layoutMeasuredNode(
      measured,
      branchX,
      branchY,
      1,
      'root',
      side,
      out,
    );

    yStart += measured.subtreeH + tagOverhang(measured.node) + 16;
  }
}