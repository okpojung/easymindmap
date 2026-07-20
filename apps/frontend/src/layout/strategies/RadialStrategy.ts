import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import { nodeSizingOpts } from '@/editor/node-renderer/nodeContent';
import type { MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { nodeOverhang } from '../tagOverhang';

const V_GAP = 10;
const H_GAP = 42;
const ROOT_TO_BRANCH_GAP = 90;

interface MeasuredNode {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  manualStarts?: number[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeH: number;
  children: MeasuredNode[];
}

function measureNode(node: MindNode, depth: number): MeasuredNode {
  const size = sizeNodeForText(node.text, depth, {
    ...nodeSizingOpts(node),
    minW: depth <= 1 ? 150 : 130,
    maxW: depth <= 1 ? 240 : 320,
  });

  const children = (node.children ?? []).map((child) => measureNode(child, depth + 1));

  // Each child reserves its subtree height PLUS room for its own tag chips.
  const childrenTotalH =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeH + nodeOverhang(child.node), 0) +
        (children.length - 1) * V_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    manualStarts: size.manualStarts,
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
    _manualStarts: measured.manualStarts,
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
    measured.children.reduce((sum, child) => sum + child.subtreeH + nodeOverhang(child.node), 0) +
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

    childY += child.subtreeH + nodeOverhang(child.node) + V_GAP;
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
  // side 미지정 가지는 오른쪽으로 취급 (누락돼도 노드가 사라지지 않게)
  let rightBranches = branches.filter((branch) => branch.side !== 'left');
  let leftBranches = branches.filter((branch) => branch.side === 'left');

  // 안전장치 — 모든 가지가 한쪽에만 있으면(MD 불러오기·새 맵 등 side가
  // 일괄 지정된 문서) 문서 순서대로 앞 절반 오른쪽 · 뒤 절반 왼쪽으로
  // 자동 배분한다. 이대로 두면 '방사형·양쪽'이 한쪽 방사형과 똑같이
  // 보인다 (2026-07 버그). 좌우가 섞여 있으면(사용자가 드래그로 옮긴
  // 맵) 저장된 side를 그대로 존중한다.
  if (branches.length >= 2 && (rightBranches.length === 0 || leftBranches.length === 0)) {
    const half = Math.ceil(branches.length / 2);
    rightBranches = branches.slice(0, half);
    leftBranches = branches.slice(half);
  }

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
      : measuredBranches.reduce((sum, item) => sum + item.subtreeH + nodeOverhang(item.node), 0) +
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

    yStart += measured.subtreeH + nodeOverhang(measured.node) + 16;
  }
}