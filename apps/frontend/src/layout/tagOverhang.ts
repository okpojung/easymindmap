// File: src/layout/tagOverhang.ts
// Tag chips (NodeTagChips) and the collaborator "편집 중" lock badge
// (NodeRenderer) are drawn OUTSIDE the node box, just below it. The node's box
// height does not include them, so vertically-stacking layouts must reserve
// this extra space below such a node — otherwise the next node placed beneath
// it overlaps the chips / badge.
//
// Keep these constants in sync with NodeTagChips.tsx and NodeRenderer.tsx.

import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';

const TAG_ROW_H = 16; // chip height (NodeTagChips.tagH)
const TAG_TOP_GAP = 6; // node bottom → chips top (NodeTagChips baseY offset)
const TAG_BOTTOM_PAD = 6; // breathing room below the chips

// NodeRenderer lock badge: centred at node.bottom + 14 with half-height 9, so
// it reaches ~23px below the box. Plus the same breathing room as tags.
const LOCK_BADGE_BOTTOM = 23; // node bottom → lock badge bottom (offset 14 + half 9)
const LOCK_BOTTOM_PAD = 6;

interface DecoratedNode {
  tags?: string[];
  tag?: string;
  locked?: boolean;
}

export function hasTags(node: DecoratedNode): boolean {
  return (Array.isArray(node.tags) && node.tags.length > 0) || !!node.tag;
}

// Extra vertical space a node needs BELOW its box to fit its tag chips.
export function tagOverhang(node: DecoratedNode): number {
  return hasTags(node) ? TAG_TOP_GAP + TAG_ROW_H + TAG_BOTTOM_PAD : 0;
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
export function nodeOverhang(node: DecoratedNode): number {
  return Math.max(tagOverhang(node), lockOverhang(node));
}
