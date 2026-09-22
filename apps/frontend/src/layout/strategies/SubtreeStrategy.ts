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
import { nodeSizingOpts } from '@/editor/node-renderer/nodeContent';
import type { LayoutType, MindNode, SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { normalizeLayoutType } from '../normalizeLayoutType';
import { nodeOverhang } from '../tagOverhang';
import { layoutHierarchyChildren } from './HierarchyStrategy';
import { layoutProcessChildren } from './ProcessStrategy';
import { layoutTimeline, layoutTimelineCenter } from './TimelineStrategy';

/**
 * 서브트리(노드 오버라이드)로 걸 수 있는 레이아웃.
 *
 * **여기 없는 값은 노드에 박혀 있어도 그림이 바뀌지 않는다** — `walk` 이
 * 조용히 지나간다(칸반·프리폼처럼 자기 배치 규칙이 맵 전체를 전제하는
 * 것들). 그래서 문서 선언을 해석하는 쪽(`utils/emmDeclaration`)이 이 집합을
 * 그대로 읽어 2레벨 이상의 값을 거른다 — 판정을 두 벌로 만들면 "패널에서는
 * 고를 수 없는데 문서로는 적히는" 값이 다시 생긴다.
 */
export const SUBTREE_SUPPORTED = new Set<LayoutType>([
  'radial-right' as LayoutType,
  'radial-left' as LayoutType,
  'radial-bidirectional' as LayoutType,
  'tree-right' as LayoutType,
  'tree-down' as LayoutType,
  'hierarchy-right' as LayoutType,
  'process-tree-right' as LayoutType,
  // 시간배치도 서브트리에 걸 수 있다 (2026-08-07 요청 — "중심 주제에서만
  // 고를 수 있던 제한을 풀어 달라"). 고른 노드가 축의 시작점이 되고,
  // 그 자식들이 오른쪽으로 시간축을 따라 늘어선다.
  'timeline' as LayoutType,
  'timeline-center' as LayoutType,
]);

// Layouts whose direct children are arranged left → right (a wider subtree
// pushes siblings sideways).
const HORIZONTAL_SIBLING_PARENTS = new Set<LayoutType>([
  'process-tree-right' as LayoutType,
  'tree-down' as LayoutType,
  // 시간배치의 자식은 축을 따라 왼쪽→오른쪽 (2026-09-22 조사: 시간배치 안의
  // 오버라이드가 자라도 다음 주제가 밀리지 않아 겹쳤다)
  'timeline' as LayoutType,
  'timeline-center' as LayoutType,
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
        ...axisOf(rootEffective),
        pathNode: branches[i],
        centered: RADIAL_PARENTS.has(rootEffective),
      },
    ]);
  }

  for (const top of topLevel) {
    const anchor = out.find((laid) => laid.id === top.node.id);
    if (!anchor) continue;
    const subtreeIds = new Set<string>([top.node.id]);
    collectDescendantIds(top.node, subtreeIds);
    clearRootCollision(out, subtreeIds, anchor, normalizeLayoutType(top.node.layoutType));
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
  /** 이 레벨에서 오버라이드로 내려가는 길목의 노드 — 그 서브트리 전체의
   *  크기 변화로 형제를 민다 (2026-09-08, 아래 propagateByLevels) */
  pathNode: MindNode;
  /** 이 레벨의 부모가 자식을 **가운데 정렬**로 쌓나(방사형) — 그럴 때만 위로
   *  자란 만큼 앞 형제를 올린다. 윗변 정렬 스택(트리·오른쪽/계층형)에서 앞
   *  형제를 올리면 루트·윗줄과 겹친다 (2026-09-22 조사) */
  centered: boolean;
  /** 형제가 **반대 방향**으로 쌓이나 — 시간배치 위쪽 가지의 세로 스택(위로),
   *  왼쪽으로 뒤집은 시간배치 축(왼쪽으로). 뒤 형제가 위/왼쪽에 있다 (2026-09-22) */
  reversed: boolean;
}

function axisOf(
  effective: LayoutType, laidParent?: LaidOutNode, selfIsTimelineAnchor = false,
): { axis: 'x' | 'y' | null; reversed: boolean } {
  const isTimeline = effective === ('timeline' as LayoutType) || effective === ('timeline-center' as LayoutType);
  if (isTimeline) {
    // 시간배치: 축의 시작 노드(루트/오버라이드 앵커)의 자식은 축을 따라 가로,
    // 축 위 노드와 그 아래 스택의 자식은 세로 — 위쪽 가지는 **위로** 쌓인다.
    if (!selfIsTimelineAnchor && laidParent?._timelineRole) return { axis: 'y', reversed: laidParent.side === 'up' };
    return { axis: 'x', reversed: laidParent?._timelineDir === 'left' }; // 왼쪽으로 뒤집은 축
  }
  if (HORIZONTAL_SIBLING_PARENTS.has(effective)) return { axis: 'x', reversed: false };
  // Radial layouts in this codebase stack siblings as a vertical column
  // (vertically centered on the parent), so their linear axis is 'y' too.
  if (VERTICAL_SIBLING_PARENTS.has(effective) || RADIAL_PARENTS.has(effective)) return { axis: 'y', reversed: false };
  return { axis: null, reversed: false }; // freeform / kanban 등
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
  const laidSelf = out.find((l) => l.id === node.id);
  // 이 노드 자신이 시간배치 오버라이드의 앵커면 자식은 이 노드의 축(가로)을 따른다
  const selfIsTimelineAnchor =
    (effective === ('timeline' as LayoutType) || effective === ('timeline-center' as LayoutType)) &&
    !!node.layoutType && normalizeLayoutType(node.layoutType) === effective && effective !== parentEffective;
  for (let i = 0; i < children.length; i += 1) {
    walk(children[i], effective, out, childScope, topLevel, [
      ...chain,
      {
        before: children.slice(0, i),
        after: children.slice(i + 1),
        ...axisOf(effective, laidSelf, selfIsTimelineAnchor),
        pathNode: children[i],
        centered: RADIAL_PARENTS.has(effective),
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
function subtreeIdSet(node: MindNode): Set<string> {
  const ids = new Set<string>([node.id]);
  collectDescendantIds(node, ids);
  return ids;
}

/**
 * ★ **레벨마다 "길목 노드의 서브트리 전체" 크기 변화로 민다** (2026-09-08).
 *
 * 예전에는 오버라이드한 노드 **하나의** 크기 변화(after − before)를 조상
 * 체인의 모든 레벨에 그대로 적용했다. 그러면 진행트리(형제가 가로로 나란한)
 * 안에 개요형 자식이 셋 있을 때, 셋이 **각각** 아래로 자란 만큼이 루트
 * 레벨의 다음 형제에 **세 번 더해진다** — 실제로 늘어난 것은 셋 중 가장
 * 큰 것 하나뿐인데. 실사용에서 발표순서(진행트리) 밑 목차 여섯 개가 각각
 * 개요형이라, 다음 가지(발표 슬라이드)가 수천 px 아래로 밀렸다.
 *
 * 이제 깊은 레벨부터 올라오며, 그 레벨의 길목 노드(오버라이드를 품은
 * 조상) 서브트리의 bbox 를 **지금** 다시 재어 이전과 견준다. 아래 레벨에서
 * 형제를 민 것이 이미 반영돼 있으므로 위 레벨은 "정말 커진 만큼"만 민다.
 * 줄어들면(개요형 자리에 진행트리를 걸어 납작해짐) 그만큼 당겨 온다.
 */
function propagateByLevels(
  out: LaidOutNode[],
  chain: ChainLevel[],
  levelBefore: (BBox | null)[],
): void {
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

  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const level = chain[i];
    const before = levelBefore[i];
    if (!level.axis || !before) continue;
    const after = bboxOf(out, subtreeIdSet(level.pathNode));
    if (!after) continue;
    if (level.axis === 'x') {
      if (level.reversed) {
        // 축이 왼쪽으로 흐른다 — 뒤 형제는 왼쪽, 앞 형제는 오른쪽
        shift(level.after, 'x', after.left - before.left);
        shift(level.before, 'x', after.right - before.right);
      } else {
        shift(level.after, 'x', after.right - before.right);
        shift(level.before, 'x', -(before.left - after.left));
      }
    } else if (level.reversed) {
      // 위로 쌓이는 스택 — 뒤 형제는 위, 앞 형제는 아래(축 쪽)
      shift(level.after, 'y', after.top - before.top);
      shift(level.before, 'y', after.bottom - before.bottom);
    } else {
      shift(level.after, 'y', after.bottom - before.bottom);
      if (level.centered) shift(level.before, 'y', -(before.top - after.top));
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

/** 서브트리의 자식들이 서브트리 밖의 어떤 노드와라도 겹치나 */
function collidesOutside(out: LaidOutNode[], childIds: Set<string>, subtreeIds: Set<string>): boolean {
  const kids = out.filter((n) => childIds.has(n.id));
  for (const n of out) {
    if (subtreeIds.has(n.id)) continue;
    const nb: BBox = { left: n.x - n.w / 2, right: n.x + n.w / 2, top: n.y - n.h / 2, bottom: n.y + n.h / 2 };
    for (const k of kids) {
      const kb: BBox = { left: k.x - k.w / 2, right: k.x + k.w / 2, top: k.y - k.h / 2, bottom: k.y + k.h / 2 };
      if (boxesIntersect(kb, nb, 0)) return true;
    }
  }
  return false;
}

/** 두 노드 묶음에 **실제로 겹치는 노드 쌍**이 있나 (bbox 끼리가 아니라 노드끼리 — 2026-09-22:
 *  가지의 큰 bbox 안 빈 곳에 다른 서브트리가 들어가도 노드가 안 닿으면 밀지 않는다) */
function nodesCollide(a: LaidOutNode[], b: LaidOutNode[], margin: number): boolean {
  for (const x of a) {
    const xb: BBox = { left: x.x - x.w / 2, right: x.x + x.w / 2, top: x.y - x.h / 2, bottom: x.y + x.h / 2 };
    for (const y of b) {
      const yb: BBox = { left: y.x - y.w / 2, right: y.x + y.w / 2, top: y.y - y.h / 2, bottom: y.y + y.h / 2 };
      if (boxesIntersect(xb, yb, margin)) return true;
    }
  }
  return false;
}

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
  // guard: id 가 겹친 문서(가져오기 오류 등)면 parent 사슬이 돌 수 있다 — 무한
  // 루프 대신 끊는다 (2026-09-22 조사 중 발견: 재현 스크립트의 중복 id 로 앱이
  // 멈추는 경로가 있었다)
  let guard = 0;
  while (cur && cur.depth > 1 && guard++ < 10000) cur = cur.parent ? byId.get(cur.parent) : undefined;
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
// Overrides whose children hang BELOW the anchor (a row or a column under it).
// Their children must never be lifted above the anchor — that buries them in
// the anchor box and everything above it (2026-09-22 조사: 방사형 맵의 위쪽
// 가지에 진행트리를 걸면 자식 행이 루트에 닿아 **위로** 들어 올려져 앵커와
// 겹쳤다). Such a subtree clears the root sideways instead.
const DOWNWARD_OVERRIDES = new Set<LayoutType>([
  'process-tree-right' as LayoutType,
  'tree-down' as LayoutType,
  'tree-right' as LayoutType,
]);

function clearRootCollision(
  out: LaidOutNode[],
  subtreeIds: Set<string>,
  anchor: LaidOutNode,
  effective: LayoutType,
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

  if (DOWNWARD_OVERRIDES.has(effective)) {
    // 아래로 늘어지는 서브트리 — 루트를 옆으로 비켜 간다 (앵커가 루트의
    // 오른쪽이면 오른쪽으로, 왼쪽이면 왼쪽으로). 위로 올리면 앵커와 겹친다.
    const dx =
      anchor.x >= root.x
        ? rootBox.right + SEPARATION_MARGIN - cBox.left
        : -(cBox.right - (rootBox.left - SEPARATION_MARGIN));
    for (const n of out) {
      if (childIds.has(n.id)) n.x += dx;
    }
    return;
  }

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
    const sNodes = out.filter((n) => subtreeIds.has(n.id));

    const groups = collectBranchGroups(out, subtreeIds, anchor);
    let moved = false;
    // 이번 패스에서 밀린 가지들 — 2) 연쇄 분리는 **밀린 가지가 낀 쌍만** 본다.
    // 예전엔 모든 쌍을 봐서, 서로 닿아 있던(원래 배치의 8px 안쪽) 무관한 가지들이
    // 패스마다 앵커 반대쪽으로 조금씩 밀려 루트 위까지 올라갔다 (2026-09-22 조사:
    // 트리·오른쪽 맵의 첫 가지가 루트와 겹침).
    const touched = new Set<number>();

    // 1) Move branches out of the overridden subtree's box (subtree is fixed).
    //    루트는 움직이지 않는 장애물 — 밀려난 가지가 루트에 닿으면 반대쪽
    //    (서브트리 너머)으로 보낸다 (2026-09-22 조사: 위로 밀린 첫 가지가 루트
    //    위에 그려졌다).
    const root = out.find((n) => n.depth === 0);
    const rootBox: BBox | null = root
      ? { left: root.x - root.w / 2, right: root.x + root.w / 2, top: root.y - root.h / 2, bottom: root.y + root.h / 2 }
      : null;
    for (const group of groups) {
      const gBox = bboxOfNodes(group);
      if (!gBox || !boxesIntersect(sBox, gBox, SEPARATION_MARGIN / 2)) continue;
      // bbox 는 닿아도 노드끼리 안 닿으면(빈 구석에 들어간 것) 그대로 둔다
      if (!nodesCollide(group, sNodes, SEPARATION_MARGIN / 2)) continue;

      const gCenterX = (gBox.left + gBox.right) / 2;
      const gCenterY = (gBox.top + gBox.bottom) / 2;

      if (horizontal) {
        let dx =
          gCenterX >= anchor.x
            ? sBox.right + SEPARATION_MARGIN - gBox.left
            : -(gBox.right - (sBox.left - SEPARATION_MARGIN));
        if (rootBox && boxesIntersect({ ...gBox, left: gBox.left + dx, right: gBox.right + dx }, rootBox, SEPARATION_MARGIN / 2)) {
          dx = dx < 0 ? sBox.right + SEPARATION_MARGIN - gBox.left : -(gBox.right - (sBox.left - SEPARATION_MARGIN));
        }
        for (const n of group) n.x += dx;
      } else {
        let dy =
          gCenterY >= anchor.y
            ? sBox.bottom + SEPARATION_MARGIN - gBox.top
            : -(gBox.bottom - (sBox.top - SEPARATION_MARGIN));
        if (rootBox && boxesIntersect({ ...gBox, top: gBox.top + dy, bottom: gBox.bottom + dy }, rootBox, SEPARATION_MARGIN / 2)) {
          dy = dy < 0 ? sBox.bottom + SEPARATION_MARGIN - gBox.top : -(gBox.bottom - (sBox.top - SEPARATION_MARGIN));
        }
        for (const n of group) n.y += dy;
      }
      touched.add(groups.indexOf(group));
      moved = true;
    }

    // 2) Cascade: separate pushed branches from each other. The group whose
    //    center is FARTHER from the anchor yields, and it always moves AWAY
    //    from the anchor — a consistent direction, so passes converge instead
    //    of oscillating a group back into the subtree's box.
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (!touched.has(i) && !touched.has(j)) continue;
        const a = bboxOfNodes(groups[i]);
        const b = bboxOfNodes(groups[j]);
        if (!a || !b || !boxesIntersect(a, b, SEPARATION_MARGIN / 2)) continue;
        if (!nodesCollide(groups[i], groups[j], SEPARATION_MARGIN / 2)) continue;

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
          if (Math.abs(dx) > 0.5) { for (const n of follow) n.x += dx; moved = true; touched.add(groups.indexOf(follow)); }
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
          if (Math.abs(dy) > 0.5) { for (const n of follow) n.y += dy; moved = true; touched.add(groups.indexOf(follow)); }
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
  // 조상 체인 각 레벨의 길목 서브트리 크기 — 바꾸기 전에 재 둔다
  const levelBefore = chain.map((l) => bboxOf(out, subtreeIdSet(l.pathNode)));

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
      // 시간배치 부모(앵커 side 가 up/down)는 부모가 왼쪽에 있으므로 오른쪽으로
      // 편다 — 요청이 '왼쪽'이어도 (2026-09-22 조사: 축 위 노드의 방사형·왼쪽
      // 자식이 부모 상자 안으로 들어갔다).
      const laidParent = out.find((l) => l.id === anchor.parent);
      const timelineParentSide =
        parentEffective === ('timeline' as LayoutType) || parentEffective === ('timeline-center' as LayoutType) ||
        !!laidParent?._timelineRole; // 부모가 축 위 노드면 그 옆(축의 반대쪽)에 축의 시작점이 있다
      const side: 'left' | 'right' =
        anchor.side === 'left' || anchor.side === 'right'
          ? anchor.side
          : timelineParentSide
            ? (anchor._timelineDir === 'left' ? 'left' : 'right')
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
      // 앵커가 부모의 **왼쪽**에 놓여 있으면(방사형·왼쪽/양쪽의 왼쪽 가지) 자식을
      // 왼쪽으로 편다 — 오른쪽으로 펴면 부모·루트 쪽으로 되돌아가 겹친다
      // (2026-09-22 조사. 방사형 오버라이드와 같은 규칙)
      {
        // 앵커가 왼쪽에 놓였거나 왼쪽으로 흐르는 시간배치 안이면 왼쪽으로
        const hierSide: 'left' | 'right' =
          anchor.side === 'left' || anchor._timelineDir === 'left' ? 'left' : 'right';
        layoutHierarchyChildren(
          children, anchor.x, anchor.y, anchor.w, anchor.depth,
          node.id, out, node.colorKey, anchor.h, hierSide,
        );
        if (hierSide === 'left') anchor.layoutType = 'hierarchy-left' as LayoutType; // 선을 왼쪽 변에
      }
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

    // 시간배치 — 고른 노드를 축의 시작점(anchor)으로 삼는다. 맵 전체에
    // 걸 때 중심 주제가 하던 역할을 이 노드가 그대로 한다.
    case 'timeline':
    case 'timeline-center': {
      const at = {
        x: anchor.x, y: anchor.y, w: anchor.w,
        depth: anchor.depth, id: node.id, colorKey: node.colorKey as string | undefined,
      };
      // children 은 MindNode[] 지만 시간배치는 colorKey 를 읽기만 하고
      // 없으면 부모 색을 물려받는다 — SampleBranch 로 넘겨도 안전하다.
      const kids = children as SampleBranch[];
      if (effective === 'timeline') {
        layoutTimeline(kids, anchor.x, anchor.y, anchor.w, out, at);
      } else {
        layoutTimelineCenter(kids, anchor.x, anchor.y, anchor.w, out, at);
      }
      break;
    }

    default:
      break;
  }

  // ★ 거울상 (2026-09-22 조사)
  //  · 시간배치 오버라이드의 축은 오른쪽으로만 흐른다 — 앵커가 부모의 **왼쪽**에
  //    놓여 있으면(방사형·왼쪽 아래) 축이 부모 쪽으로 되돌아가 겹친다 → x 를
  //    앵커 기준으로 뒤집어 왼쪽으로 흐르게 한다.
  //  · 아래로 늘어지는 오버라이드(진행트리·트리·아래·트리·오른쪽)를 시간배치의
  //    **위쪽** 가지(side 'up') 에 걸면 자식이 축과 아래쪽 노드 위로 내려온다 → y 를
  //    앵커 기준으로 뒤집어 위로 자라게 한다.
  const timelineOverride =
    effective === 'timeline' || effective === 'timeline-center';
  let mirroredUp = false;
  if (timelineOverride) {
    const dir: 'left' | 'right' =
      anchor.side === 'left' || anchor._timelineDir === 'left' ? 'left' : 'right';
    anchor._timelineDir = dir; // 앵커에도 — 그 자식 레벨의 형제 밀기 방향(axisOf)이 본다
    for (const n of out) {
      if (!descendantIds.has(n.id)) continue;
      n._timelineDir = dir;
      if (dir === 'left') n.x = 2 * anchor.x - n.x;
    }
  }
  if (DOWNWARD_OVERRIDES.has(effective) && anchor.side === 'up') {
    for (const n of out) if (descendantIds.has(n.id)) { n.y = 2 * anchor.y - n.y; n.side = 'up'; }
    mirroredUp = true;
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
  //
  // **시간배치는 이 보정에서 뺀다** (2026-08-07). 시간배치는 축을 기준으로
  // 위·아래로 뻗는 것이 제 모양이라, 위로 넘쳤다고 통째로 내리면 **축이
  // 무너진다** — 중앙노드에서는 축 위에 얹혀야 할 노드가 시작점보다
  // 아래로 밀려 내려갔다(보고 2번).
  //
  // 다만 시간배치라도 **실제로 다른 노드와 겹치면** 내린다 (2026-09-22 조사:
  // 진행트리·트리 맵 안의 시간배치가 윗줄과 겹친 채 남았다 — 겹침보다는
  // 축이 시작점 아래에 놓이는 편이 낫다).
  if (
    before && after &&
    after.top < before.top - 0.5 &&
    !RADIAL_PARENTS.has(parentEffective) &&
    !mirroredUp &&
    (!timelineOverride || collidesOutside(out, descendantIds, subtreeIds))
  ) {
    const dy = before.top - after.top;
    for (const n of out) {
      if (descendantIds.has(n.id)) n.y += dy;
    }
    after = bboxOf(out, subtreeIds);
  }

  // ★ 부모가 자식을 **옆에** 두는 배치(계층형·방사형)에서는, 다시 놓인 자식들이
  // 앵커의 부모 쪽으로 튀어나오면 안 된다 — 부모 상자가 크면(표 두 개 든
  // 노드 등) 그 안으로 들어간다 (2026-09-22 조사: 계층형 아래 노드에 트리·아래
  // 를 걸면 가운데 정렬된 자식 행이 앵커 왼쪽으로 삐져나와 부모 표 위에
  // 그려졌다). 앵커의 바깥쪽 모서리까지만 허용하고 나머지는 밀어낸다.
  // 옆으로 뻗는 오버라이드(계층형·방사형)는 뺀다 — 자식이 애초에 앵커 옆에
  // 놓이므로 밀면 앵커 위로 올라간다. 아래로 늘어지는 것(진행트리·트리·아래·
  // 트리·오른쪽)만 부모 쪽으로 삐져나온 만큼 민다.
  if (DOWNWARD_OVERRIDES.has(effective)) {
    const cBox = bboxOf(out, descendantIds);
    if (cBox) {
      // 앵커가 부모의 어느 쪽에 놓였나로 판단한다 (`side`) — 부모 레이아웃 이름이
      // 아니라 실제 놓인 쪽. 방사형·왼쪽 오버라이드도 앵커의 side 가 오른쪽이면
      // 자식을 오른쪽에 두므로(위 radial 케이스), 이름으로 판단하면 반대로 민다.
      // 시간배치 부모는 자식을 축을 따라 **오른쪽**에 둔다 (side 는 위/아래) —
      // 부모 상자는 앵커의 왼쪽이므로 오른쪽 방향으로 본다.
      const timelineParent =
        parentEffective === ('timeline' as LayoutType) || parentEffective === ('timeline-center' as LayoutType) ||
        !!anchor._timelineRole;
      const rightward = anchor.side === 'right' || (timelineParent && anchor._timelineDir !== 'left');
      const leftward = anchor.side === 'left' || (timelineParent && anchor._timelineDir === 'left');
      let dx = 0;
      if (rightward && cBox.left < anchor.x - anchor.w / 2 - 0.5) dx = anchor.x - anchor.w / 2 - cBox.left;
      if (leftward && cBox.right > anchor.x + anchor.w / 2 + 0.5) dx = anchor.x + anchor.w / 2 - cBox.right;
      if (dx) {
        for (const n of out) if (descendantIds.has(n.id)) n.x += dx;
        after = bboxOf(out, subtreeIds);
      }
    }
  }

  if (before && after) {
    propagateByLevels(out, chain, levelBefore);
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
  manualStarts?: number[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeH: number;
  children: MeasuredCentered[];
}

function measureCentered(node: MindNode, depth: number): MeasuredCentered {
  const size = sizeNodeForText(node.text, depth, {
    ...nodeSizingOpts(node),
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
    manualStarts: size.manualStarts,
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
    _manualStarts: measured.manualStarts,
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
    ...nodeSizingOpts(node),
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
    _manualStarts: size.manualStarts,
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
  manualStarts?: number[];
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  subtreeW: number;
  children: MeasuredDown[];
}

function measureDown(node: MindNode, depth: number): MeasuredDown {
  const size = sizeNodeForText(node.text, depth, {
    ...nodeSizingOpts(node),
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
    manualStarts: size.manualStarts,
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
    _manualStarts: measured.manualStarts,
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
