// Node color resolution — derives fill/border/text from a node's depth & colorKey
// against the active theme tokens. The previously demo-only "nodeTheme" multiplexer
// (amber/blue/green palette swap) was removed; production uses the base theme palette
// declared in the Style inspector (NS-01/02/04).
//
// Branch (depth 1) colors come from theme.nodeL1A..L1E indexed by colorKey letter.

import type { ThemeTokens, NodeFamily } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';

// 사용자 지정 채움색 위의 글자색 — 테마와 무관한 "고정색"을 고른다.
// 채움색을 직접 지정한 노드는 라이트/다크 전환 때 글자색이 테마를 따라
// 뒤집히면 안 된다 (밝은 커스텀 배경 + 다크 테마의 밝은 글자 = 안 보임).
// 밝은 채움 → 진한 글자, 어두운 채움 → 밝은 글자 (한 번 정하면 불변).
export function readableTextOn(fill: string): string {
  let hex = String(fill || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#1F1B16';
  const v = parseInt(hex, 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 140 ? '#1F1B16' : '#F8F5EF';
}

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
