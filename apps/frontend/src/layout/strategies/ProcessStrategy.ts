// File: src/layout/strategies/ProcessStrategy.ts
// Version: MVP-ProcessStrategy-ChildrenRight-v1.0.0
// Description:
// - process-tree-right: Level 1 stages move from left to right.
// - Level 2 nodes are placed to the right of their parent stage.
// - This avoids tree-down-like child placement.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

const ROOT_X_OFFSET = 430;
const ROOT_Y_OFFSET = 120;

const ROOT_TO_STAGE_GAP = 130;
const STAGE_GROUP_GAP = 56;

const CHILD_RIGHT_GAP = 42;
const CHILD_V_GAP = 10;

interface MeasuredChild {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

interface MeasuredStage {
  node: SampleBranch;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  children: MeasuredChild[];
  childrenH: number;
  maxChildW: number;
  groupW: number;
  groupH: number;
}

function measureChild(node: MindNode): MeasuredChild {
  const size = sizeNodeForText(node.text, 2, {
    hasIcon: !!node.icon,
    minW: 130,
    maxW: 240,
  });

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
  };
}

function measureStage(node: SampleBranch): MeasuredStage {
  const size = sizeNodeForText(node.text, 1, {
    hasIcon: !!node.icon,
    minW: 150,
    maxW: 240,
  });

  const children = (node.children ?? []).map(measureChild);

  const childrenH =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.h, 0) +
        (children.length - 1) * CHILD_V_GAP;

  const maxChildW =
    children.length === 0 ? 0 : Math.max(...children.map((child) => child.w));

  const groupW =
    size.w +
    (children.length > 0 ? CHILD_RIGHT_GAP + maxChildW : 0);

  const groupH = Math.max(size.h, childrenH);

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    children,
    childrenH,
    maxChildW,
    groupW,
    groupH,
  };
}

function pushStage(
  out: LaidOutNode[],
  stage: MeasuredStage,
  x: number,
  y: number,
): void {
  out.push({
    ...stage.node,
    layoutType: 'process-tree-right' as any,
    x,
    y,
    w: stage.w,
    h: stage.h,
    _lines: stage.lines,
    _fontSize: stage.fontSize,
    _fontWeight: stage.fontWeight,
    _lineHeight: stage.lineHeight,
    depth: 1,
    parent: 'root',
    side: 'right',
  });
}

function pushChild(
  out: LaidOutNode[],
  child: MeasuredChild,
  x: number,
  y: number,
  parentId: string,
  parentColorKey?: string,
): void {
  out.push({
    ...child.node,
    layoutType: 'process-tree-right' as any,
    x,
    y,
    w: child.w,
    h: child.h,
    _lines: child.lines,
    _fontSize: child.fontSize,
    _fontWeight: child.fontWeight,
    _lineHeight: child.lineHeight,
    depth: 2,
    parent: parentId,
    side: 'right',
    parentColorKey: parentColorKey as any,
  });
}

export function layoutProcessTreeRight(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const stages = branches.map(measureStage);

  const rootX = CX - ROOT_X_OFFSET;
  const rootY = CY - ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'right';
  out[0].layoutType = 'process-tree-right' as any;

  let groupLeftX = rootX + rootW / 2 + ROOT_TO_STAGE_GAP;
  const stageY = rootY;

  for (const stage of stages) {
    const stageX = groupLeftX + stage.w / 2;

    pushStage(out, stage, stageX, stageY);

    if (stage.children.length > 0) {
      const childX =
        stageX + stage.w / 2 + CHILD_RIGHT_GAP + stage.maxChildW / 2;

      let childTopY = stageY - stage.childrenH / 2;

      for (const child of stage.children) {
        const childY = childTopY + child.h / 2;

        pushChild(
          out,
          child,
          childX,
          childY,
          stage.node.id,
          stage.node.colorKey,
        );

        childTopY += child.h + CHILD_V_GAP;
      }
    }

    groupLeftX += stage.groupW + STAGE_GROUP_GAP;
  }
}

export function layoutProcessTreeLeft(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  layoutProcessTreeRight(branches, CX, CY, rootW, out);
}