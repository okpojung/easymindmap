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
  if (n.depth === 1) {
    const key = n.colorKey || 'l1A';
    const family =
      key === 'l1A' ? t.nodeL1A :
      key === 'l1B' ? t.nodeL1B :
      key === 'l1C' ? t.nodeL1C :
      key === 'l1D' ? t.nodeL1D :
      key === 'l1E' ? t.nodeL1E :
      t.nodeL1A;
    return family;
  }
  return t.nodeL2;
}
