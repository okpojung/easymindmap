// Shared layout-type normalization.
// Maps MVP canonical names (tree / radial / hierarchy / …) to the concrete
// layout keys used by the layout engine and the inspector UI.

import type { LayoutType } from '@/editor/__samples__/types';

export function normalizeLayoutType(layoutType?: LayoutType): LayoutType {
  if (!layoutType) return 'radial-bidirectional' as LayoutType;

  if (layoutType === 'radial') return 'radial-right' as LayoutType;
  if (layoutType === 'both-radial') return 'radial-bidirectional' as LayoutType;
  if (layoutType === 'tree') return 'tree-right' as LayoutType;
  if (layoutType === 'hierarchy') return 'hierarchy-right' as LayoutType;
  if (layoutType === 'progress-tree') return 'process-tree-right' as LayoutType;
  if (layoutType === 'free') return 'freeform' as LayoutType;
  if (layoutType === 'process-tree-right-a' || layoutType === 'process-tree-right-b') {
    return 'process-tree-right' as LayoutType;
  }

  return layoutType;
}
