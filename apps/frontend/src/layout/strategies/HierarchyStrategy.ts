// File: src/layout/strategies/HierarchyStrategy.ts
// Version: MVP-HierarchyStrategy-TopLeftOutline-v1.0.0
// Description:
// - hierarchy-right: root is placed at the upper-left.
// - Level 1 nodes are listed below/right of root.
// - Deeper nodes are indented to the right in outline style.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

const ROOT_X_OFFSET = 430;
const ROOT_Y_OFFSET = 230;
const ROOT_TO_FIRST_ROW_GAP = 34;
const INDENT = 42;
const ROW_GAP = 8;
const SECTION_GAP = 12;

function measureNode(node: MindNode, depth: number) {
  return sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: depth <= 1 ? 180 : 170,
    maxW: depth <= 1 ? 300 : 340,
  });
}

function pushNode(
  out: LaidOutNode[],
  node: MindNode,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  parentColorKey?: string,
): void {
  const size = measureNode(node, depth);

  out.push({
    ...node,
    layoutType: 'hierarchy-right' as any,
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

function arrangeOutlineNode(
  node: MindNode,
  rootLeft: number,
  depth: number,
  parentId: string,
  yRef: { value: number },
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const size = measureNode(node, depth);

  const x = rootLeft + INDENT * depth + size.w / 2;
  const y = yRef.value + size.h / 2;

  pushNode(out, node, x, y, depth, parentId, parentColorKey);

  yRef.value += size.h + ROW_GAP;

  for (const child of node.children ?? []) {
    arrangeOutlineNode(
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

export function layoutHierarchyRight(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  _rootW: number,
  out: LaidOutNode[],
): void {
  const rootX = CX - ROOT_X_OFFSET;
  const rootY = CY - ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'right';
  out[0].layoutType = 'hierarchy-right' as any;

  const rootLeft = rootX - out[0].w / 2;

  const yRef = {
    value: rootY + out[0].h / 2 + ROOT_TO_FIRST_ROW_GAP,
  };

  for (const branch of branches) {
    arrangeOutlineNode(branch, rootLeft, 1, 'root', yRef, out);
    yRef.value += SECTION_GAP;
  }
}