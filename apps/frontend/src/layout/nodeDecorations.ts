// File: src/layout/nodeDecorations.ts
// Shared helper for layout strategies.
//
// Tag chips (NodeTagChips) and the collaborator "편집 중" lock badge
// (NodeRenderer) are drawn BELOW a node's box, but they are NOT part of the
// height returned by sizeNodeForText(). If the layout only reserves the box
// height, a neighbouring node placed directly below ends up covering these
// decorations. belowNodeReserve() returns the extra vertical room a layout
// should reserve below a node so its tags / lock badge stay visible.
//
// Keep these constants in sync with NodeTagChips.tsx and NodeRenderer.tsx.

interface DecoratedNode {
  tag?: string;
  tags?: string[];
  locked?: boolean;
}

// NodeTagChips: baseY = node bottom + 6, chip height = 16 → ~22px below the
// box, plus a small breathing margin.
const TAG_RESERVE = 24;

// NodeRenderer lock badge: centred at node bottom + 14, half-height 9 → ~23px
// below the box, plus a small margin.
const LOCK_RESERVE = 26;

export function nodeHasTags(node: DecoratedNode): boolean {
  return (node.tags?.length ?? 0) > 0 || !!node.tag;
}

// Extra vertical space (px) to reserve below `node` for its tag chips and/or
// collaborator lock badge. Returns 0 when the node has neither.
export function belowNodeReserve(node: DecoratedNode): number {
  return Math.max(
    nodeHasTags(node) ? TAG_RESERVE : 0,
    node.locked ? LOCK_RESERVE : 0,
  );
}
