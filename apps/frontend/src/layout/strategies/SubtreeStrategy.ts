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
import { contentIndicatorCount } from '@/editor/node-renderer/nodeContent';
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
// Radial parents place children vertically centered around the anchor, so an
// override subtree extending above its anchor is normal there — the upward-
// overflow shift below must NOT apply to them.
const RADIAL_PARENTS = new Set<LayoutType>([
  'radial-bidirectional' as LayoutType,
  'radial-right' as LayoutType,
  'radial-left' as LayoutType,
]);

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

  // Top-level override anchors, collected so the GLOBAL branch separation can
  // run once at the end — after any nested overrides inside them have been
  // applied and their final size is known.
  const topLevel: { node: MindNode; parentEffective: LayoutType }[] = [];

  for (let i = 0; i < branches.length; i += 1) {
    // radial-bidirectional splits branches into two independent columns —
    // only SAME-SIDE siblings stack together, so filter the chain level.
    const sameSide = (b: SampleBranch) =>
      rootEffective !== ('radial-bidirectional' as LayoutType) ||
      (b.side ?? 'right') === (branches[i].side ?? 'right');

    walk(branches[i], rootEffective, out, null, topLevel, [
      {
        before: branches.slice(0, i).filter(sameSide),
        after: branches.slice(i + 1).filter(sameSide),
        axis: axisOf(rootEffective),
      },
    ]);
  }

  for (const top of topLevel) {
    const anchor = out.find((laid) => laid.id === top.node.id);
    if (!anchor) continue;
    const subtreeIds = new Set<string>([top.node.id]);
    collectDescendantIds(top.node, subtreeIds);
    clearRootCollision(out, subtreeIds, anchor);
    separateBranchGroups(out, subtreeIds, anchor, top.parentEffective);
  }
}

// `scope` = the enclosing top-level override's subtree ids. A NESTED override
// (one inside another override) must only reflow siblings WITHIN that scope —
// pushing the whole map from deep inside a subtree scatters the outer
// override's own arrangement (and every other branch with it).
// One ancestor level in the reflow chain: the siblings that come AFTER the
// current path at that level, and the axis along which that level's parent
// stacks its children ('x' = horizontal row, 'y' = vertical column, null =
// radial/positional — no linear push; separateBranchGroups handles those).
interface ChainLevel {
  before: MindNode[]; // earlier siblings — receive TOP/LEFT growth (radial 등 중앙정렬)
  after: MindNode[]; // later siblings — receive BOTTOM/RIGHT growth
  axis: 'x' | 'y' | null;
}

function axisOf(effective: LayoutType): 'x' | 'y' | null {
  if (HORIZONTAL_SIBLING_PARENTS.has(effective)) return 'x';
  // Radial layouts in this codebase stack siblings as a vertical column
  // (vertically centered on the parent), so their linear axis is 'y' too.
  if (VERTICAL_SIBLING_PARENTS.has(effective) || RADIAL_PARENTS.has(effective)) return 'y';
  return null; // freeform / kanban 등
}

function walk(
  node: MindNode,
  parentEffective: LayoutType,
  out: LaidOutNode[],
  scope: Set<string> | null,
  topLevel: { node: MindNode; parentEffective: LayoutType }[],
  chain: ChainLevel[],
): void {
  const effective = node.layoutType
    ? normalizeLayoutType(node.layoutType)
    : parentEffective;

  let childScope = scope;

  if (effective !== parentEffective && SUBTREE_SUPPORTED.has(effective)) {
    relayoutSubtree(node, effective, parentEffective, out, chain);

    if (!scope) {
      // top-level override: nested overrides below it reflow within it
      topLevel.push({ node, parentEffective });
      childScope = new Set<string>([node.id]);
      collectDescendantIds(node, childScope);
    }
  }

  const children = node.children ?? [];
  for (let i = 0; i < children.length; i += 1) {
    walk(children[i], effective, out, childScope, topLevel, [
      ...chain,
      {
        before: children.slice(0, i),
        after: children.slice(i + 1),
        axis: axisOf(effective),
      },
    ]);
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

// After a subtree is re-laid-out it occupies a DIFFERENT amount of room than
// the gap the base layout reserved. The size change (after − before, grow OR
// shrink) is propagated UP THE ANCESTOR CHAIN: at every ancestor level, only
// the sibling subtrees that come AFTER the current path shift, along the axis
// that level's parent uses to stack its children. This is precise where the
// old "move everything right/below the anchor" was not — it never drags
// ancestors or unrelated cousins sideways (which scrambled deeply nested
// overrides), yet the growth still reaches e.g. the grand-parent's next
// sibling through its own chain level. Shifting by the exact delta preserves
// the base layout's relative gaps, so it cannot introduce overlaps in either
// direction. Radial levels (axis null) don't stack linearly and are handled
// by separateBranchGroups instead.
function propagateDelta(
  out: LaidOutNode[],
  before: BBox,
  after: BBox,
  chain: ChainLevel[],
): void {
  // growth toward bottom/right → later siblings move down/right;
  // growth toward top/left (vertically-centered radial subtrees) → earlier
  // siblings move up/left by the same amount.
  const dRight = after.right - before.right;
  const dBottom = after.bottom - before.bottom;
  const dLeft = before.left - after.left;
  const dTop = before.top - after.top;
  if (
    Math.abs(dRight) <= 0.5 && Math.abs(dBottom) <= 0.5 &&
    Math.abs(dLeft) <= 0.5 && Math.abs(dTop) <= 0.5
  ) return;

  const shift = (sibs: MindNode[], axis: 'x' | 'y', delta: number) => {
    if (sibs.length === 0 || Math.abs(delta) <= 0.5) return;
    const ids = new Set<string>();
    for (const sib of sibs) {
      ids.add(sib.id);
      collectDescendantIds(sib, ids);
    }
    for (const n of out) {
      if (!ids.has(n.id)) continue;
      if (axis === 'x') n.x += delta;
      else n.y += delta;
    }
  };

  for (const level of chain) {
    if (!level.axis) continue;
    if (level.axis === 'x') {
      shift(level.after, 'x', dRight);
      shift(level.before, 'x', -dLeft);
    } else {
      shift(level.after, 'y', dBottom);
      shift(level.before, 'y', -dTop);
    }
  }
}

// --- branch-group collision separation --------------------------------------
// Safety net run after every subtree relayout: if the re-laid-out subtree's
// bounding box still intersects another depth-1 branch (common when the BASE
// map is radial, where the linear delta propagation can't reflow), move that WHOLE
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
function branchIdOf(byId: Map<string, LaidOutNode>, node: LaidOutNode): string | null {
  let cur: LaidOutNode | undefined = node;
  while (cur && cur.depth > 1) cur = cur.parent ? byId.get(cur.parent) : undefined;
  return cur && cur.depth === 1 ? cur.id : null;
}

function collectBranchGroups(
  out: LaidOutNode[],
  subtreeIds: Set<string>,
  anchor: LaidOutNode,
): LaidOutNode[][] {
  const byId = new Map(out.map((n) => [n.id, n]));
  const groups = new Map<string, LaidOutNode[]>();

  // The branch the ANCHOR belongs to must never be treated as a colliding
  // group: it contains the anchor's own ancestors/relatives, and shoving the
  // whole branch away from a subtree nested inside it tears the branch apart
  // (e.g. b1 + root ending up overlapped after a depth-3 override inside b1).
  const anchorBranchId = branchIdOf(byId, anchor);

  for (const n of out) {
    if (n.depth === 0 || subtreeIds.has(n.id)) continue;

    const bid = branchIdOf(byId, n);
    if (!bid || bid === anchorBranchId) continue;

    const group = groups.get(bid) ?? [];
    group.push(n);
    groups.set(bid, group);
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

    const groups = collectBranchGroups(out, subtreeIds, anchor);
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
  chain: ChainLevel[],
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
  let after = bboxOf(out, subtreeIds);

  // Vertically-centered overrides (radial) extend ABOVE the anchor. When the
  // parent layout flows downward (진행트리/트리·아래) or stacks rows (트리·
  // 오른쪽/계층형), that upward overflow lands on the parent's connector
  // spine or the previous sibling — e.g. a radial-right child column crossing
  // the process-tree elbow line. Shift only the re-laid-out CHILDREN down so
  // the subtree starts no higher than it did under the base layout; the
  // anchor stays put and edges are re-drawn from the new positions.
  if (
    before && after &&
    after.top < before.top - 0.5 &&
    !RADIAL_PARENTS.has(parentEffective)
  ) {
    const dy = before.top - after.top;
    for (const n of out) {
      if (descendantIds.has(n.id)) n.y += dy;
    }
    after = bboxOf(out, subtreeIds);
  }

  if (before && after) {
    propagateDelta(out, before, after, chain);
  }

  // Global collision passes run only for TOP-LEVEL overrides — and they run
  // in applyLayoutOverrides() AFTER nested overrides have finished, so the
  // subtree's FINAL bounding box is what gets separated from other branches.
  // (A nested override reflows purely inside its enclosing scope above.)
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
    indicators: contentIndicatorCount(node),
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
    indicators: contentIndicatorCount(node),
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
    indicators: contentIndicatorCount(node),
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
