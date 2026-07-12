// File: src/layout/strategies/HierarchyStrategy.ts
// Version: MVP-HierarchyStrategy-TopAlignedRight-v3.0.0
// Reference: docs/assets/layout_계층형.png,
//            docs/assets/트리오른쪽_계층형오른쪽_진행트리오른쪽.JPG
// Description:
// - hierarchy-right ("오른쪽-계층"):
//   · Root sits at the upper-left.
//   · Children form ONE vertical column to the RIGHT of their parent.
//   · The FIRST child shares the parent's row; siblings stack below the
//     previous sibling's whole subtree (top-aligned, NOT centered).
//   · Edges: parent right edge → vertical spine → child left edge
//     (EdgeRenderer.createHierarchyPath).
// - layoutHierarchyChildren() is shared with SubtreeStrategy so the same
//   placement can be applied below any selected node.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import { contentIndicatorCount } from '@/editor/node-renderer/nodeContent';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { nodeOverhang } from '../tagOverhang';

const H_GAP = 44;        // parent right edge → child left edge
const ROW_GAP = 12;      // vertical gap between sibling subtrees
const ROOT_X_OFFSET = 470;
const ROOT_Y_OFFSET = 280;

const HIERARCHY_TAG = 'hierarchy-right' as LayoutType;

function measureNode(node: MindNode, depth: number) {
  return sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    indicators: contentIndicatorCount(node),
    minW: depth <= 1 ? 150 : 130,
    maxW: depth <= 1 ? 240 : 320,
  });
}

// Places `node` with its left edge at `leftX` and its center at `centerY`,
// then lays out its children in a column to the right (first child on the
// same row). Returns the bottom-most y reached by the subtree.
function placeSubtree(
  node: MindNode,
  depth: number,
  leftX: number,
  centerY: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): number {
  const size = measureNode(node, depth);
  const x = leftX + size.w / 2;

  out.push({
    ...node,
    layoutType: HIERARCHY_TAG,
    x,
    y: centerY,
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

  // Reserve room below for this node's tag chips so the next sibling in the
  // column doesn't get covered by them.
  let bottom = centerY + size.h / 2 + nodeOverhang(node);

  const childLeft = x + size.w / 2 + H_GAP;
  const children = node.children ?? [];

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const childSize = measureNode(child, depth + 1);

    const childCenterY =
      i === 0 ? centerY : bottom + ROW_GAP + childSize.h / 2;

    bottom = Math.max(
      bottom,
      placeSubtree(child, depth + 1, childLeft, childCenterY, node.id, out, node.colorKey),
    );
  }

  return bottom;
}

// Lays out `children` as a top-aligned column to the right of an anchor
// node. Used for the whole-map layout (anchor = root) and for per-node
// overrides (SubtreeStrategy).
export function layoutHierarchyChildren(
  children: MindNode[],
  anchorX: number,
  anchorY: number,
  anchorW: number,
  anchorDepth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const childLeft = anchorX + anchorW / 2 + H_GAP;
  let bottom = anchorY;

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const childSize = measureNode(child, anchorDepth + 1);

    const childCenterY =
      i === 0 ? anchorY : bottom + ROW_GAP + childSize.h / 2;

    bottom = Math.max(
      bottom,
      placeSubtree(
        child,
        anchorDepth + 1,
        childLeft,
        childCenterY,
        parentId,
        out,
        parentColorKey,
      ),
    );
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
  const rootY = CY - ROOT_Y_OFFSET;

  out[0].x = rootX;
  out[0].y = rootY;
  out[0].side = 'right';
  out[0].layoutType = HIERARCHY_TAG;

  layoutHierarchyChildren(branches, rootX, rootY, rootW, 0, 'root', out);
}
