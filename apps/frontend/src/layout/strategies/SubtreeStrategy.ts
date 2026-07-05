// File: src/layout/strategies/SubtreeStrategy.ts
// Version: MVP-SubtreeStrategy-v1.1.0
// Description:
// - Applies per-node layout overrides on top of the base map layout.
// - A node whose document layoutType differs from its parent's effective
//   layout becomes a "subtree root": its descendants are removed from the
//   base layout result and re-laid-out around the node's current position
//   using the node's own layout style.
// - Supported per-subtree styles: radial (left/right), tree-right (outline),
//   tree-down, hierarchy-right, process-tree-right.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { normalizeLayoutType } from '../normalizeLayoutType';
import { nodeOverhang } from '../tagOverhang';
import { layoutHierarchyChildren } from './HierarchyStrategy';
import { layoutProcessChildren } from './ProcessStrategy';

const SUBTREE_SUPPORTED = new Set<LayoutType>([
  'radial-right' as LayoutType,
  'radial-left' as LayoutType,
  'radial-bidirectional' as LayoutType,
  'tree-right' as LayoutType,
  'tree-down' as LayoutType,
  'hierarchy-right' as LayoutType,
  'process-tree-right' as LayoutType,
]);

// Layouts whose direct children are arranged left → right (a wider subtree
// pushes siblings sideways).
const HORIZONTAL_SIBLING_PARENTS = new Set<LayoutType>([
  'process-tree-right' as LayoutType,
  'tree-down' as LayoutType,
]);

// Layouts that stack their direct children top → bottom (a taller subtree
// pushes the siblings below it down).
const VERTICAL_SIBLING_PARENTS = new Set<LayoutType>([
  'hierarchy-right' as LayoutType,
  'hierarchy-left' as LayoutType,
  'tree-right' as LayoutType,
  'tree-left' as LayoutType,
]);
// Radial / freeform parents place children by angle/position, so the naive
// "push everything below/right of the anchor" reflow would scramble them.
// Instead, radial parents rely on the branch-group separation pass below
// (separateBranchGroups), which moves whole depth-1 branches out of the way.

export function applyLayoutOverrides(
  branches: SampleBranch[],
  mapLayoutType: LayoutType,
  out: LaidOutNode[],
): void {
  const rootEffective = normalizeLayoutType(mapLayoutType);

  for (const branch of branches) {
    walk(branch, rootEffective, out);
  }
}

function walk(node: MindNode, parentEffective: LayoutType, out: LaidOutNode[]): void {
  const effective = node.layoutType
    ? normalizeLayoutType(node.layoutType)
    : parentEffective;

  if (effective !== parentEffective && SUBTREE_SUPPORTED.has(effective)) {
    relayoutSubtree(node, effective, parentEffective, out);
  }

  for (const child of node.children ?? []) {
    walk(child, effective, out);
  }
}

function collectDescendantIds(node: MindNode, ids: Set<string>): void {
  for (const child of node.children ?? []) {
    ids.add(child.id);
    collectDescendantIds(child, ids);
  }
}

interface BBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function bboxOf(out: LaidOutNode[], ids: Set<string>): BBox | null {
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;

  for (const n of out) {
    if (!ids.has(n.id)) continue;
    left = Math.min(left, n.x - n.w / 2);
    right = Math.max(right, n.x + n.w / 2);
    top = Math.min(top, n.y - n.h / 2);
    bottom = Math.max(bottom, n.y + n.h / 2);
  }

  return left === Infinity ? null : { left, right, top, bottom };
}

// After a subtree is re-laid-out it may occupy more room than the gap the
// base layout reserved. Push the nodes that sat AFTER the anchor (to its
// right for horizontal parents, below it for vertical ones) by the amount
// the subtree grew, so siblings never overlap.
function pushSiblingsAway(
  out: LaidOutNode[],
  subtreeIds: Set<string>,
  anchor: LaidOutNode,
  before: BBox,
  after: BBox,
  parentEffective: LayoutType,
): void {
  if (HORIZONTAL_SIBLING_PARENTS.has(parentEffective)) {
    const extra = after.right - before.right;
    if (extra <= 0.5) return;

    for (const n of out) {
      if (subtreeIds.has(n.id)) continue;
      if (n.x > anchor.x + 0.5) n.x += extra;
    }
  } else if (VERTICAL_SIBLING_PARENTS.has(parentEffective)) {
    const extra = after.bottom - before.bottom;
    if (extra <= 0.5) return;

    for (const n of out) {
      if (subtreeIds.has(n.id)) continue;
      if (n.y > anchor.y + 0.5) n.y += extra;
    }
  }
  // Radial / freeform: handled by separateBranchGroups() instead.
}

// --- branch-group collision separation --------------------------------------
// Safety net run after every subtree relayout: if the re-laid-out subtree's
// bounding box still intersects another depth-1 branch (common when the BASE
// map is radial, where pushSiblingsAway can't safely reflow), move that WHOLE
// branch out of the way as a rigid group. Moving whole branches keeps their
// internal structure intact. Cascading collisions (pushed branch hits the
// next one) are resolved by iterating until stable.

const SEPARATION_MARGIN = 16; // min gap kept between the subtree and a branch
const MAX_SEPARATION_PASSES = 8;

function bboxOfNodes(nodes: LaidOutNode[]): BBox | null {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const n of nodes) {
    left = Math.min(left, n.x - n.w / 2);
    right = Math.max(right, n.x + n.w / 2);
    top = Math.min(top, n.y - n.h / 2);
    bottom = Math.max(bottom, n.y + n.h / 2);
  }
  return left === Infinity ? null : { left, right, top, bottom };
}

function boxesIntersect(a: BBox, b: BBox, margin: number): boolean {
  return (
    a.left < b.right + margin &&
    b.left < a.right + margin &&
    a.top < b.bottom + margin &&
    b.top < a.bottom + margin
  );
}

// Groups every laid-out node (except root and the overridden subtree) under
// its depth-1 ancestor branch, following parent pointers.
function collectBranchGroups(
  out: LaidOutNode[],
  subtreeIds: Set<string>,
): LaidOutNode[][] {
  const byId = new Map(out.map((n) => [n.id, n]));
  const groups = new Map<string, LaidOutNode[]>();

  for (const n of out) {
    if (n.depth === 0 || subtreeIds.has(n.id)) continue;

    // Walk up to the depth-1 ancestor.
    let cur: LaidOutNode | undefined = n;
    while (cur && cur.depth > 1) cur = cur.parent ? byId.get(cur.parent) : undefined;
    if (!cur || cur.depth !== 1) continue;

    const group = groups.get(cur.id) ?? [];
    group.push(n);
    groups.set(cur.id, group);
  }

  return [...groups.values()];
}

// The root can never be pushed aside. When an override points a subtree back
// toward the map center (e.g. hierarchy-right on a LEFT-side branch), the
// re-laid-out children can land on the root box. In that case shift the
// children (the anchor stays put) vertically past the root; the branch
// separation pass afterwards resolves any knock-on collisions.
function clearRootCollision(
  out: LaidOutNode[],
  subtreeIds: Set<string>,
  anchor: LaidOutNode,
): void {
  const root = out.find((n) => n.depth === 0);
  if (!root) return;

  const childIds = new Set(subtreeIds);
  childIds.delete(anchor.id);
  const cBox = bboxOf(out, childIds);
  if (!cBox) return;

  const rootBox: BBox = {
    left: root.x - root.w / 2,
    right: root.x + root.w / 2,
    top: root.y - root.h / 2,
    bottom: root.y + root.h / 2,
  };
  if (!boxesIntersect(cBox, rootBox, SEPARATION_MARGIN / 2)) return;

  const dy =
    anchor.y >= root.y
      ? rootBox.bottom + SEPARATION_MARGIN - cBox.top
      : -(cBox.bottom - (rootBox.top - SEPARATION_MARGIN));

  for (const n of out) {
    if (childIds.has(n.id)) n.y += dy;
  }
}

function separateBranchGroups(
  out: LaidOutNode[],
  subtreeIds: Set<string>,
  anchor: LaidOutNode,
  parentEffective: LayoutType,
): void {
  // Horizontal-sibling base maps resolve along x; everything else (vertical,
  // radial — whose same-side branches stack vertically) resolves along y.
  const horizontal = HORIZONTAL_SIBLING_PARENTS.has(parentEffective);

  for (let pass = 0; pass < MAX_SEPARATION_PASSES; pass += 1) {
    const sBox = bboxOf(out, subtreeIds);
    if (!sBox) return;

    const groups = collectBranchGroups(out, subtreeIds);
    let moved = false;

    // 1) Move branches out of the overridden subtree's box (subtree is fixed).
    for (const group of groups) {
      const gBox = bboxOfNodes(group);
      if (!gBox || !boxesIntersect(sBox, gBox, SEPARATION_MARGIN / 2)) continue;

      const gCenterX = (gBox.left + gBox.right) / 2;
      const gCenterY = (gBox.top + gBox.bottom) / 2;

      if (horizontal) {
        const dx =
          gCenterX >= anchor.x
            ? sBox.right + SEPARATION_MARGIN - gBox.left
            : -(gBox.right - (sBox.left - SEPARATION_MARGIN));
        for (const n of group) n.x += dx;
      } else {
        const dy =
          gCenterY >= anchor.y
            ? sBox.bottom + SEPARATION_MARGIN - gBox.top
            : -(gBox.bottom - (sBox.top - SEPARATION_MARGIN));
        for (const n of group) n.y += dy;
      }
      moved = true;
    }

    // 2) Cascade: separate pushed branches from each other. The group whose
    //    center is FARTHER from the anchor yields, and it always moves AWAY
    //    from the anchor — a consistent direction, so passes converge instead
    //    of oscillating a group back into the subtree's box.
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = bboxOfNodes(groups[i]);
        const b = bboxOfNodes(groups[j]);
        if (!a || !b || !boxesIntersect(a, b, SEPARATION_MARGIN / 2)) continue;

        if (horizontal) {
          const aC = (a.left + a.right) / 2;
          const bC = (b.left + b.right) / 2;
          const [lead, follow, fC] =
            Math.abs(aC - anchor.x) <= Math.abs(bC - anchor.x)
              ? [a, groups[j], bC]
              : [b, groups[i], aC];
          const fBox = bboxOfNodes(follow)!;
          const dx =
            fC >= anchor.x
              ? lead.right + SEPARATION_MARGIN - fBox.left
              : -(fBox.right - (lead.left - SEPARATION_MARGIN));
          if (Math.abs(dx) > 0.5) { for (const n of follow) n.x += dx; moved = true; }
        } else {
          const aC = (a.top + a.bottom) / 2;
          const bC = (b.top + b.bottom) / 2;
          const [lead, follow, fC] =
            Math.abs(aC - anchor.y) <= Math.abs(bC - anchor.y)
              ? [a, groups[j], bC]
              : [b, groups[i], aC];
          const fBox = bboxOfNodes(follow)!;
          const dy =
            fC >= anchor.y
              ? lead.bottom + SEPARATION_MARGIN - fBox.top
              : -(fBox.bottom - (lead.top - SEPARATION_MARGIN));
          if (Math.abs(dy) > 0.5) { for (const n of follow) n.y += dy; moved = true; }
        }
      }
    }

    if (!moved) return;
  }
}

function relayoutSubtree(
  node: MindNode,
  effective: LayoutType,
  parentEffective: LayoutType,
  out: LaidOutNode[],
): void {
  const anchor = out.find((laid) => laid.id === node.id);
  if (!anchor) return;

  // Tag the anchor so EdgeRenderer draws its outgoing edges in the new style.
  anchor.layoutType = effective;

  const descendantIds = new Set<string>();
  collectDescendantIds(node, descendantIds);

  const children = node.children ?? [];
  if (children.length === 0) return;

  // Box the subtree occupied under the base layout, before re-laying it out.
  const subtreeIds = new Set(descendantIds);
  subtreeIds.add(node.id);
  const before = bboxOf(out, subtreeIds);

  for (let i = out.length - 1; i >= 0; i -= 1) {
    if (descendantIds.has(out[i].id)) out.splice(i, 1);
  }

  switch (effective) {
    case 'radial-left':
    case 'radial-right':
    case 'radial-bidirectional': {
      // Children must fan out AWAY from the root: on a radial base map an
      // anchor on the right side has the root immediately to its left, so
      // pointing the subtree left would bury it in the root/opposite side
      // (the root cannot be pushed away). The anchor's own laid-out side wins
      // over the requested direction when they conflict.
      const side: 'left' | 'right' =
        anchor.side === 'left' || anchor.side === 'right'
          ? anchor.side
          : effective === 'radial-left'
            ? 'left'
            : 'right';

      layoutCenteredChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.depth,
        node.id, side,
        (side === 'left' ? 'radial-left' : 'radial-right') as LayoutType,
        out, node.colorKey,
      );
      break;
    }

    case 'hierarchy-right':
      layoutHierarchyChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.depth,
        node.id, out, node.colorKey,
      );
      break;

    case 'process-tree-right':
      layoutProcessChildren(
        children, anchor.x, anchor.y, anchor.w, anchor.h, anchor.depth,
        node.id, out, node.colorKey, nodeOverhang(node),
      );
      break;

    case 'tree-down':
      layoutSubtreeDown(children, anchor, node, out);
      break;

    case 'tree-right':
      layoutSubtreeOutline(children, anchor, node, out);
      break;

    default:
      break;
  }

  // Re-flow siblings so the resized subtree doesn't overlap them.
  const after = bboxOf(out, subtreeIds);
  if (before && after) {
    pushSiblingsAway(out, subtreeIds, anchor, before, after, parentEffective);
  }

  // The root is immovable — if the new children landed on it, move them clear
  // first so the branch separation below works from their final position.
  clearRootCollision(out, subtreeIds, anchor);

  // Safety net: move whole depth-1 branches that still collide with the
  // re-laid-out subtree (the only reflow that is safe for radial base maps).
  separateBranchGroups(out, subtreeIds, anchor, parentEffective);
}

// --- radial (curved edges, subtree vertically centered) ---------------------

const RADIAL_H_GAP = 42;
const RADIAL_V_GAP = 10;
const RADIAL_BRANCH_V_GAP = 16;

interface MeasuredCentered {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeH: number;
  children: MeasuredCentered[];
}

function measureCentered(node: MindNode, depth: number): MeasuredCentered {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: depth <= 1 ? 150 : 130,
    maxW: depth <= 1 ? 240 : 320,
  });

  const children = (node.children ?? []).map((child) => measureCentered(child, depth + 1));

  const childrenH =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeH + nodeOverhang(child.node), 0) +
        (children.length - 1) * RADIAL_V_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    subtreeH: Math.max(size.h, childrenH),
    children,
  };
}

function placeCentered(
  measured: MeasuredCentered,
  x: number,
  y: number,
  depth: number,
  parent: string | null,
  side: 'left' | 'right',
  tag: LayoutType,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  out.push({
    ...measured.node,
    layoutType: tag,
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

  if (measured.children.length === 0) return;

  const childrenH =
    measured.children.reduce((sum, child) => sum + child.subtreeH + nodeOverhang(child.node), 0) +
    (measured.children.length - 1) * RADIAL_V_GAP;

  let cursorY = y - childrenH / 2;

  for (const child of measured.children) {
    const childY = cursorY + child.subtreeH / 2;

    const childX =
      side === 'right'
        ? x + measured.w / 2 + RADIAL_H_GAP + child.w / 2
        : x - measured.w / 2 - RADIAL_H_GAP - child.w / 2;

    placeCentered(
      child,
      childX,
      childY,
      depth + 1,
      measured.node.id,
      side,
      tag,
      out,
      measured.node.colorKey,
    );

    cursorY += child.subtreeH + nodeOverhang(child.node) + RADIAL_V_GAP;
  }
}

function layoutCenteredChildren(
  children: MindNode[],
  anchorX: number,
  anchorY: number,
  anchorW: number,
  anchorDepth: number,
  parentId: string,
  side: 'left' | 'right',
  tag: LayoutType,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const measured = children.map((child) => measureCentered(child, anchorDepth + 1));

  const totalH =
    measured.length === 0
      ? 0
      : measured.reduce((sum, item) => sum + item.subtreeH + nodeOverhang(item.node), 0) +
        (measured.length - 1) * RADIAL_BRANCH_V_GAP;

  let cursorY = anchorY - totalH / 2;

  for (const item of measured) {
    const y = cursorY + item.subtreeH / 2;

    const x =
      side === 'right'
        ? anchorX + anchorW / 2 + RADIAL_H_GAP + item.w / 2
        : anchorX - anchorW / 2 - RADIAL_H_GAP - item.w / 2;

    placeCentered(item, x, y, anchorDepth + 1, parentId, side, tag, out, parentColorKey);

    cursorY += item.subtreeH + nodeOverhang(item.node) + RADIAL_BRANCH_V_GAP;
  }
}

// --- tree-right (indented outline) below an anchor -------------------------

const OUTLINE_INDENT = 36;
const OUTLINE_ROW_GAP = 8;
const OUTLINE_SECTION_GAP = 10;
const OUTLINE_TOP_GAP = 26;

function layoutSubtreeOutline(
  children: MindNode[],
  anchor: LaidOutNode,
  node: MindNode,
  out: LaidOutNode[],
): void {
  const baseLeft = anchor.x - anchor.w / 2;
  const yRef = { value: anchor.y + anchor.h / 2 + OUTLINE_TOP_GAP + nodeOverhang(node) };

  for (const child of children) {
    arrangeOutlineNode(child, baseLeft, 1, anchor.depth, node.id, yRef, out, node.colorKey);
    yRef.value += OUTLINE_SECTION_GAP;
  }
}

function arrangeOutlineNode(
  node: MindNode,
  baseLeft: number,
  relDepth: number,
  anchorDepth: number,
  parentId: string,
  yRef: { value: number },
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  const depth = anchorDepth + relDepth;

  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: 150,
    maxW: 300,
  });

  const x = baseLeft + OUTLINE_INDENT * relDepth + size.w / 2;
  const y = yRef.value + size.h / 2;

  out.push({
    ...node,
    layoutType: 'tree-right' as LayoutType,
    x,
    y,
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

  yRef.value += size.h + OUTLINE_ROW_GAP + nodeOverhang(node);

  for (const child of node.children ?? []) {
    arrangeOutlineNode(
      child, baseLeft, relDepth + 1, anchorDepth, node.id, yRef, out, node.colorKey,
    );
  }
}

// --- tree-down (centered columns) below an anchor ---------------------------

const DOWN_V_GAP = 56;
const DOWN_H_GAP = 24;

interface MeasuredDown {
  node: MindNode;
  w: number;
  h: number;
  lines: string[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeW: number;
  children: MeasuredDown[];
}

function measureDown(node: MindNode, depth: number): MeasuredDown {
  const size = sizeNodeForText(node.text, depth, {
    hasIcon: !!node.icon,
    minW: 120,
    maxW: 220,
  });

  const children = (node.children ?? []).map((child) => measureDown(child, depth + 1));

  const childrenW =
    children.length === 0
      ? 0
      : children.reduce((sum, child) => sum + child.subtreeW, 0) +
        (children.length - 1) * DOWN_H_GAP;

  return {
    node,
    w: size.w,
    h: size.h,
    lines: size.lines,
    fontSize: size.fontSize,
    fontWeight: size.fontWeight,
    lineHeight: size.lineHeight,
    subtreeW: Math.max(size.w, childrenW),
    children,
  };
}

function placeDown(
  measured: MeasuredDown,
  x: number,
  y: number,
  depth: number,
  parentId: string,
  out: LaidOutNode[],
  parentColorKey?: string,
): void {
  out.push({
    ...measured.node,
    layoutType: 'tree-down' as LayoutType,
    x,
    y,
    w: measured.w,
    h: measured.h,
    _lines: measured.lines,
    _fontSize: measured.fontSize,
    _fontWeight: measured.fontWeight,
    _lineHeight: measured.lineHeight,
    depth,
    parent: parentId,
    side: 'down',
    parentColorKey: parentColorKey as any,
  });

  if (measured.children.length === 0) return;

  const childrenW =
    measured.children.reduce((sum, child) => sum + child.subtreeW, 0) +
    (measured.children.length - 1) * DOWN_H_GAP;

  let cursorX = x - childrenW / 2;
  const childTop = y + measured.h / 2 + DOWN_V_GAP + nodeOverhang(measured.node);

  for (const child of measured.children) {
    placeDown(
      child,
      cursorX + child.subtreeW / 2,
      childTop + child.h / 2,
      depth + 1,
      measured.node.id,
      out,
      measured.node.colorKey,
    );

    cursorX += child.subtreeW + DOWN_H_GAP;
  }
}

function layoutSubtreeDown(
  children: MindNode[],
  anchor: LaidOutNode,
  node: MindNode,
  out: LaidOutNode[],
): void {
  const measured = children.map((child) => measureDown(child, anchor.depth + 1));

  const totalW =
    measured.length === 0
      ? 0
      : measured.reduce((sum, item) => sum + item.subtreeW, 0) +
        (measured.length - 1) * DOWN_H_GAP;

  let cursorX = anchor.x - totalW / 2;
  const childTop = anchor.y + anchor.h / 2 + DOWN_V_GAP + nodeOverhang(node);

  for (const item of measured) {
    placeDown(
      item,
      cursorX + item.subtreeW / 2,
      childTop + item.h / 2,
      anchor.depth + 1,
      node.id,
      out,
      node.colorKey,
    );

    cursorX += item.subtreeW + DOWN_H_GAP;
  }
}
