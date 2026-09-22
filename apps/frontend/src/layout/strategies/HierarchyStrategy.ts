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
import { nodeSizingOpts } from '@/editor/node-renderer/nodeContent';
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
    ...nodeSizingOpts(node),
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
  side: 'left' | 'right' = 'right',
): number {
  const size = measureNode(node, depth);
  // side 'left' 면 leftX 는 **오른쪽 모서리**다 (거울상, 서브트리 오버라이드용)
  const x = side === 'left' ? leftX - size.w / 2 : leftX + size.w / 2;

  out.push({
    ...node,
    // 거울상(왼쪽)이면 hierarchy-left 로 표시 — EdgeRenderer 가 왼쪽 변에 선을 댄다
    layoutType: side === 'left' ? ('hierarchy-left' as LayoutType) : HIERARCHY_TAG,
    x,
    y: centerY,
    w: size.w,
    h: size.h,
    _lines: size.lines,
    _manualStarts: size.manualStarts,
    _fontSize: size.fontSize,
    _fontWeight: size.fontWeight,
    _lineHeight: size.lineHeight,
    depth,
    parent: parentId,
    side,
    parentColorKey: parentColorKey as any,
  });

  // Reserve room below for this node's tag chips so the next sibling in the
  // column doesn't get covered by them.
  let bottom = centerY + size.h / 2 + nodeOverhang(node);

  const childLeft = side === 'left' ? x - size.w / 2 - H_GAP : x + size.w / 2 + H_GAP;
  const children = node.children ?? [];

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const childSize = measureNode(child, depth + 1);

    // 첫 자식은 부모와 같은 줄 — 단, 부모보다 **키가 크면** 윗변을 부모 윗변에
    // 맞춘다. 중심을 맞추면 위로 삐져나와 앞 형제 서브트리와 겹친다
    // (2026-09-22 조사: 표·코드가 든 큰 첫 자식이 앞 형제 위에 그려졌다).
    const childCenterY =
      i === 0
        ? Math.max(centerY, centerY - size.h / 2 + childSize.h / 2)
        : bottom + ROW_GAP + childSize.h / 2;

    bottom = Math.max(
      bottom,
      placeSubtree(child, depth + 1, childLeft, childCenterY, node.id, out, node.colorKey, side),
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
  anchorH = 0,
  side: 'left' | 'right' = 'right',
): void {
  const childLeft = side === 'left' ? anchorX - anchorW / 2 - H_GAP : anchorX + anchorW / 2 + H_GAP;
  let bottom = anchorY;

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const childSize = measureNode(child, anchorDepth + 1);

    // 첫 자식은 앵커와 같은 줄 — 앵커보다 키가 크면 윗변을 앵커 윗변에 (위 placeSubtree 와 같은 규칙)
    const childCenterY =
      i === 0
        ? Math.max(anchorY, anchorY - anchorH / 2 + childSize.h / 2)
        : bottom + ROW_GAP + childSize.h / 2;

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
        side,
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

  layoutHierarchyChildren(branches, rootX, rootY, rootW, 0, 'root', out, undefined, out[0].h);
}
