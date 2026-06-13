// File: src/layout/tagOverhang.ts
// Tag chips (NodeTagChips) are drawn OUTSIDE the node box, just below it
// (baseY = node.bottom + 6, height 16). The node's box height does not include
// them, so vertically-stacking layouts must reserve this extra space below a
// tagged node — otherwise the chips overlap the node placed beneath it.
//
// Keep these constants in sync with NodeTagChips.tsx (tagH / baseY offset).

const TAG_ROW_H = 16; // chip height (NodeTagChips.tagH)
const TAG_TOP_GAP = 6; // node bottom → chips top (NodeTagChips baseY offset)
const TAG_BOTTOM_PAD = 6; // breathing room below the chips

export function hasTags(node: { tags?: string[]; tag?: string }): boolean {
  return (Array.isArray(node.tags) && node.tags.length > 0) || !!node.tag;
}

// Extra vertical space a node needs BELOW its box to fit its tag chips.
export function tagOverhang(node: { tags?: string[]; tag?: string }): number {
  return hasTags(node) ? TAG_TOP_GAP + TAG_ROW_H + TAG_BOTTOM_PAD : 0;
}
