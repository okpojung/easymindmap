// File: src/layout/tagOverhang.ts
// Tag chips (NodeTagChips) and the collaborator "편집 중" lock badge
// (NodeRenderer) are drawn OUTSIDE the node box, just below it. The node's box
// height does not include them, so vertically-stacking layouts must reserve
// this extra space below such a node — otherwise the next node placed beneath
// it overlaps the chips / badge.
//
// Keep these constants in sync with NodeTagChips.tsx and NodeRenderer.tsx.

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
  return node.locked ? LOCK_BADGE_BOTTOM + LOCK_BOTTOM_PAD : 0;
}

// Total below-box reserve a node needs for whichever decorations it has
// (tag chips and/or lock badge). Layouts should space the next node below by
// this amount so nothing gets covered.
export function nodeOverhang(node: DecoratedNode): number {
  return Math.max(tagOverhang(node), lockOverhang(node));
}
