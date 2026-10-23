// File: src/layout/tagOverhang.ts
// Tag chips (NodeTagChips) and the collaborator "편집 중" lock badge
// (NodeRenderer) are drawn OUTSIDE the node box, just below it. The node's box
// height does not include them, so vertically-stacking layouts must reserve
// this extra space below such a node — otherwise the next node placed beneath
// it overlaps the chips / badge.
//
// Keep these constants in sync with NodeTagChips.tsx and NodeRenderer.tsx.

import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { measureTextApprox } from '@/editor/node-renderer/mdTable';
import { projectChips } from '@/editor/node-renderer/projectTags';
import type { ProjectTags } from '@/editor/__samples__/types';

export const TAG_ROW_H = 16; // chip height (NodeTagChips.tagH)
export const TAG_TOP_GAP = 6; // node bottom → chips top (NodeTagChips baseY offset)
const TAG_BOTTOM_PAD = 6; // breathing room below the chips
export const TAG_ROW_GAP = 4; // 줄과 줄 사이
export const TAG_GAP = 4; // 칩과 칩 사이
const TAG_ARROW_W = 6, TAG_PAD_X = 8, TAG_CLOSE_W = 14;
/** 레이아웃이 노드 폭을 모를 때 가정하는 폭 (가장 좁은 노드 쪽 — 자리를 넉넉히 잡는다) */
const FALLBACK_W = 150;
/** 왼쪽 들여쓰기 — 자식 선이 노드 왼쪽으로 내려가는 배치는 그 선을 피해 28, 그 밖에는 8 */
export const TAG_INSET_LEFT_SPINE = 28;
export const TAG_INSET = 8;

/** 태그 칩 하나의 폭 (NodeTagChips 와 같은 식) */
export function tagChipWidth(tag: string): number {
  const labelW = Math.max(20, Math.ceil(measureTextApprox(tag, 10)));
  return TAG_ARROW_W + TAG_PAD_X + labelW + 4 + TAG_CLOSE_W;
}

/**
 * 태그 칩 자리 (2026-10-23 사용자 요청: 태그가 노드 오른쪽 경계를 넘어 다른 노드에 가렸다).
 * 노드 왼쪽(들여쓰기)부터 순서대로 놓고, 노드 오른쪽 경계를 넘으면 다음 줄로 내린다.
 * 노드보다 넓은 태그 하나는 그 줄에 혼자 놓는다. 좌표는 노드 왼쪽 위(박스 아래 변) 기준 상대값.
 */
export function layoutTagRows(tags: string[], nodeW: number, inset = TAG_INSET): { x: number; row: number; w: number }[] {
  const right = Math.max(inset + 1, nodeW - 4);
  const out: { x: number; row: number; w: number }[] = [];
  let x = inset, row = 0;
  for (const tag of tags) {
    const w = tagChipWidth(tag);
    if (x > inset && x + w > right) { row++; x = inset; }
    out.push({ x, row, w });
    x += w + TAG_GAP;
  }
  return out;
}
export function tagRowCount(tags: string[], nodeW: number, inset = TAG_INSET): number {
  const rows = layoutTagRows(tags, nodeW, inset);
  return rows.length ? rows[rows.length - 1].row + 1 : 0;
}

// NodeRenderer lock badge: centred at node.bottom + 14 with half-height 9, so
// it reaches ~23px below the box. Plus the same breathing room as tags.
const LOCK_BADGE_BOTTOM = 23; // node bottom → lock badge bottom (offset 14 + half 9)
const LOCK_BOTTOM_PAD = 6;

interface DecoratedNode {
  tags?: string[];
  tag?: string;
  locked?: boolean;
  project?: ProjectTags;
}
/** 태그 줄에 놓이는 글자 전부 — 프로젝트 태그(📅 @ %)가 앞, 일반 태그가 뒤 */
const tagsOf = (node: DecoratedNode): string[] => [
  ...projectChips(node.project).map((c) => c.label),
  ...(Array.isArray(node.tags) ? node.tags : node.tag ? [node.tag] : []),
];

export function hasTags(node: DecoratedNode): boolean {
  return (Array.isArray(node.tags) && node.tags.length > 0) || !!node.tag || projectChips(node.project).length > 0;
}

// Extra vertical space a node needs BELOW its box to fit its tag chips (여러 줄이면 줄 수만큼).
// 폭을 모르면 좁은 노드로 가정하고 왼쪽 들여쓰기도 넓게 잡는다 — 자리가 남을 수는 있어도 가리지 않는다.
export function tagOverhang(node: DecoratedNode, nodeW?: number): number {
  if (!hasTags(node)) return 0;
  const rows = Math.max(1, tagRowCount(tagsOf(node), nodeW ?? FALLBACK_W, TAG_INSET_LEFT_SPINE));
  return TAG_TOP_GAP + rows * TAG_ROW_H + (rows - 1) * TAG_ROW_GAP + TAG_BOTTOM_PAD;
}

// Extra vertical space a node needs BELOW its box to fit the collaborator
// "편집 중" lock badge.
export function lockOverhang(node: DecoratedNode): number {
  // [협업 UI 숨김 — MVP] "편집 중" 배지가 featureFlags.COLLAB_PRESENCE_UI로
  // 숨겨져 있는 동안에는 배지용 아래 여백도 예약하지 않는다 (안 보이는 배지
  // 때문에 노드 간격이 벌어지는 것을 방지). 협업 기능(V2)에서 배지를 다시
  // 켜면 이 예약도 함께 되살아난다.
  if (!COLLAB_PRESENCE_UI) return 0;
  return node.locked ? LOCK_BADGE_BOTTOM + LOCK_BOTTOM_PAD : 0;
}

// Total below-box reserve a node needs for whichever decorations it has
// (tag chips and/or lock badge). Layouts should space the next node below by
// this amount so nothing gets covered.
export function nodeOverhang(node: DecoratedNode, nodeW?: number): number {
  return Math.max(tagOverhang(node, nodeW), lockOverhang(node));
}
