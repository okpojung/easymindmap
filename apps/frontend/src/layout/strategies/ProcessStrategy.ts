// File: src/layout/strategies/ProcessStrategy.ts
// Version: MVP-ProcessStrategy-RowBelowRoot-v3.0.0
// Reference: docs/assets/layout_진행트리형.png,
//            docs/assets/트리오른쪽_계층형오른쪽_진행트리오른쪽.JPG
// Description:
// - process-tree-right ("오른쪽-진행트리"):
//   · Root sits at the upper-left.
//   · Level-1 stages flow left → right on a row BELOW the root
//     (stage tops aligned).
//   · The connector drops from the root's bottom, runs along a horizontal
//     spine, then drops into the TOP edge of each stage
//     (EdgeRenderer.createProcessPath).
//   · Each stage's descendants stack vertically below the stage (one column).
// - layoutProcessChildren() is shared with SubtreeStrategy so the same
//   placement can be applied below any selected node.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

const ROOT_Y_OFFSET = 250;       // root near the top of the viewBox
const ROOT_MIN_LEFT = 40;

const STAGE_START_INDENT = 56;   // root left edge → first stage column left
const STAGE_GAP = 40;            // gap between stage columns
const ROOT_TO_STAGE_ROW_GAP = 64; // root bottom → stage row top
const STAGE_TO_CHILD_GAP = 42;   // stage bottom → first child top
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
  rowTop: number,
  stageDepth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  let groupLeft = startLeft;

  for (const column of columns) {
    const stageX = groupLeft + column.columnW / 2;
    const stageY = rowTop + column.stageSize.h / 2; // stage tops aligned

    out.push({
      ...column.stage,
      layoutType: PROCESS_TAG,
      x: stageX,
      y: stageY,
      w: column.stageSize.w,
      h: column.stageSize.h,
      _lines: column.stageSize.lines,
      _fontSize: column.stageSize.fontSize,
      _fontWeight: column.stageSize.fontWeight,
      _lineHeight: column.stageSize.lineHeight,
      depth: stageDepth,
      parent: parentId,
      side: 'down',
      parentColorKey: parentColorKey as any,
    });

    let cursorY = stageY + column.stageSize.h / 2 + STAGE_TO_CHILD_GAP;

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

// Lays out `stages` as a horizontal flow on a row BELOW the anchor node,
// with each stage's descendants stacked vertically below the stage.
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
  const columns = measureColumns(stages, anchorDepth + 1, parentColorKey);

  placeColumns(
    columns,
    anchorX - anchorW / 2 + STAGE_START_INDENT,
    anchorY + anchorH / 2 + ROOT_TO_STAGE_ROW_GAP,
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
  const rootH = out[0].h;
  const columns = measureColumns(branches, 1);

  // Center the whole block (root + stage flow) horizontally in the viewBox.
  const totalW = Math.max(rootW, STAGE_START_INDENT + flowWidth(columns));
  const blockLeft = Math.max(CX - totalW / 2, ROOT_MIN_LEFT);

  const rootX = blockLeft + rootW / 2;
  const rootY = CY - ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'down';
  out[0].layoutType = PROCESS_TAG;

  placeColumns(
    columns,
    blockLeft + STAGE_START_INDENT,
    rootY + rootH / 2 + ROOT_TO_STAGE_ROW_GAP,
    1,
    'root',
    out,
  );
}
