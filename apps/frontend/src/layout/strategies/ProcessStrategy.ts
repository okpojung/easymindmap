// File: src/layout/strategies/ProcessStrategy.ts
// Version: MVP-ProcessStrategy-Timeline-v2.0.0
// Description:
// - process-tree-right: timeline layout.
//   Root sits at the left; level-1 stages flow left → right on the same row.
//   Each stage's descendants stack vertically BELOW the stage (one column),
//   matching the vertical drop edges drawn by EdgeRenderer.createProcessPath.
// - The whole flow is measured first and centered horizontally in the
//   viewBox; wide maps overflow evenly on both sides (use fit/zoom/pan).
// - layoutProcessChildren() is shared with SubtreeStrategy so the same
//   placement can be applied below any selected node.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

const ROOT_Y_OFFSET = 150;
const ROOT_MIN_LEFT = 40;

const ANCHOR_TO_STAGE_GAP = 70;
const STAGE_GAP = 40;
const STAGE_TO_CHILD_GAP = 42;
const CHILD_V_GAP = 10;

const PROCESS_TAG = 'process-tree-right' as LayoutType;

interface ColumnItem {
  node: MindNode;
  depth: number;
  parentId: string;
  parentColorKey?: string;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
}

interface MeasuredColumn {
  stage: MindNode;
  stageSize: ReturnType<typeof sizeNodeForText>;
  items: ColumnItem[];
  columnW: number;
}

function measureInto(
  node: MindNode,
  depth: number,
  parentId: string,
  parentColorKey: string | undefined,
  items: ColumnItem[],
): void {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: 130,
    maxW: 220,
  });

  items.push({
    node,
    depth,
    parentId,
    parentColorKey,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
  });

  for (const child of node.children ?? []) {
    measureInto(child, depth + 1, node.id, node.colorKey ?? parentColorKey, items);
  }
}

function measureColumns(
  stages: MindNode[],
  stageDepth: number,
  parentColorKey?: string,
): MeasuredColumn[] {
  return stages.map((stage) => {
    const stageSize = sizeNodeForText(stage.text, stageDepth, {
      hasIcon: !!stage.icon,
      minW: 140,
      maxW: 220,
    });

    const items: ColumnItem[] = [];
    for (const child of stage.children ?? []) {
      measureInto(child, stageDepth + 1, stage.id, stage.colorKey ?? parentColorKey, items);
    }

    return {
      stage,
      stageSize,
      items,
      columnW: Math.max(stageSize.w, ...items.map((item) => item.w), 0),
    };
  });
}

function flowWidth(columns: MeasuredColumn[]): number {
  return (
    columns.reduce((sum, column) => sum + column.columnW, 0) +
    Math.max(0, columns.length - 1) * STAGE_GAP
  );
}

function placeColumns(
  columns: MeasuredColumn[],
  startLeft: number,
  rowY: number,
  stageDepth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  let groupLeft = startLeft;

  for (const column of columns) {
    const stageX = groupLeft + column.columnW / 2;

    out.push({
      ...column.stage,
      layoutType: PROCESS_TAG,
      x: stageX,
      y: rowY,
      w: column.stageSize.w,
      h: column.stageSize.h,
      _lines: column.stageSize.lines,
      _fontSize: column.stageSize.fontSize,
      _fontWeight: column.stageSize.fontWeight,
      _lineHeight: column.stageSize.lineHeight,
      depth: stageDepth,
      parent: parentId,
      side: 'right',
      parentColorKey: parentColorKey as any,
    });

    let cursorY = rowY + column.stageSize.h / 2 + STAGE_TO_CHILD_GAP;

    for (const item of column.items) {
      out.push({
        ...item.node,
        layoutType: PROCESS_TAG,
        x: stageX,
        y: cursorY + item.h / 2,
        w: item.w,
        h: item.h,
        _lines: item.lines,
        _fontSize: item.fontSize,
        _fontWeight: item.fontWeight,
        _lineHeight: item.lineHeight,
        depth: item.depth,
        parent: item.parentId,
        side: 'down',
        parentColorKey: item.parentColorKey as any,
      });

      cursorY += item.h + CHILD_V_GAP;
    }

    groupLeft += column.columnW + STAGE_GAP;
  }
}

// Lays out `stages` as a horizontal flow to the right of an anchor node,
// with each stage's descendants stacked vertically below the stage.
export function layoutProcessChildren(
  stages: MindNode[],
  anchorX: number,
  anchorY: number,
  anchorW: number,
  anchorDepth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const columns = measureColumns(stages, anchorDepth + 1, parentColorKey);

  placeColumns(
    columns,
    anchorX + anchorW / 2 + ANCHOR_TO_STAGE_GAP,
    anchorY,
    anchorDepth + 1,
    parentId,
    out,
    parentColorKey,
  );
}

export function layoutProcessTreeRight(
  branches: SampleBranch[],
  CX: number,
  CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const columns = measureColumns(branches, 1);

  // Center the whole flow (root + stages) horizontally in the viewBox.
  const totalW = rootW + ANCHOR_TO_STAGE_GAP + flowWidth(columns);
  const rootX = Math.max(CX - totalW / 2 + rootW / 2, ROOT_MIN_LEFT + rootW / 2);
  const rootY = CY - ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'right';
  out[0].layoutType = PROCESS_TAG;

  placeColumns(
    columns,
    rootX + rootW / 2 + ANCHOR_TO_STAGE_GAP,
    rootY,
    1,
    'root',
    out,
  );
}
