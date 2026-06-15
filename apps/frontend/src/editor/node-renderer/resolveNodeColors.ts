// Node color resolution — derives fill/border/text from a node's depth & colorKey
// against the active theme tokens. The previously demo-only "nodeTheme" multiplexer
// (amber/blue/green palette swap) was removed; production uses the base theme palette
// declared in the Style inspector (NS-01/02/04).
//
// Branch (depth 1) colors come from theme.nodeL1A..L1E indexed by colorKey letter.

import type { ThemeTokens, NodeFamily } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';

export function resolveNodeColors(n: LaidOutNode, t: ThemeTokens): NodeFamily {
  if (n.depth === 0) return t.nodeRoot;

  // Honor an explicit colorKey at ANY depth so that nodes which inherit their
  // parent's colorKey (added child/sibling) keep the same colour family —
  // including the fill, not just border/text. Without a colorKey, fall back to
  // the depth default (L1 palette for branches, L2 for deeper nodes).
  switch (n.colorKey) {
    case 'l1A': return t.nodeL1A;
    case 'l1B': return t.nodeL1B;
    case 'l1C': return t.nodeL1C;
    case 'l1D': return t.nodeL1D;
    case 'l1E': return t.nodeL1E;
    case 'l2':  return t.nodeL2;
    default:    return n.depth === 1 ? t.nodeL1A : t.nodeL2;
  }
}
