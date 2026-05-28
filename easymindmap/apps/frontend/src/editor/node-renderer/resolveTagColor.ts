// Tag color tokens — soft pastel variants distinct from action colors.
// Each tag gets a fixed semantic color so users can scan the map visually,
// but all variants are low-saturation to read as "label" not "button".
// Spec: docs/03-editor-core/canvas/10-canvas.md § 24.3

import type { ThemeTokens } from '@/components/design-tokens/theme';

export interface TagColor {
  bg: string;
  text: string;
  border: string;
}

type TagFamily = 'amber' | 'violet' | 'teal' | 'blue' | 'green' | 'rose' | 'slate';

// Known tag → family mapping. Unknown tags fall back to neutral 'slate'.
const FAMILY_BY_TAG: Record<string, TagFamily> = {
  MVP: 'amber', Core: 'amber',
  AI: 'violet',
  Export: 'teal',
  V1: 'blue', V2: 'blue', V3: 'blue',
  DB: 'slate', Plan: 'slate',
  Auth: 'rose', UI: 'rose', UX: 'rose',
  Q1: 'green', Q2: 'green', Q3: 'green', Q4: 'green',
};

const PALETTE: Record<TagFamily, { light: TagColor; dark: TagColor }> = {
  amber:  { light: { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' },
            dark:  { bg: '#3B2A0A', text: '#FBBF24', border: '#78350F' } },
  violet: { light: { bg: '#EDE9FE', text: '#5B21B6', border: '#DDD6FE' },
            dark:  { bg: '#2E1B4C', text: '#C4B5FD', border: '#4C1D95' } },
  teal:   { light: { bg: '#CCFBF1', text: '#115E59', border: '#99F6E4' },
            dark:  { bg: '#134E4A', text: '#5EEAD4', border: '#0F766E' } },
  blue:   { light: { bg: '#DBEAFE', text: '#1E40AF', border: '#BFDBFE' },
            dark:  { bg: '#172554', text: '#93C5FD', border: '#1E3A8A' } },
  green:  { light: { bg: '#DCFCE7', text: '#166534', border: '#BBF7D0' },
            dark:  { bg: '#14532D', text: '#86EFAC', border: '#166534' } },
  rose:   { light: { bg: '#FFE4E6', text: '#9F1239', border: '#FECDD3' },
            dark:  { bg: '#4C0519', text: '#FDA4AF', border: '#881337' } },
  slate:  { light: { bg: '#F1F5F9', text: '#475569', border: '#E2E8F0' },
            dark:  { bg: '#1E293B', text: '#94A3B8', border: '#334155' } },
};

export function resolveTagColor(tag: string, t: ThemeTokens): TagColor {
  const family = FAMILY_BY_TAG[tag] || 'slate';
  return PALETTE[family][t.name];
}
