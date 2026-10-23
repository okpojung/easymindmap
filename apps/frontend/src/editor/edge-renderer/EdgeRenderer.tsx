// File: src/editor/edge-renderer/EdgeRenderer.tsx
// Version: MVP-EdgeRenderer-PerNodeLayout-v2.0.0
// Description:
// - Edge style is resolved per edge from the PARENT node's laid-out
//   layoutType (falling back to the map layoutType), so mixed layouts
//   (per-subtree overrides) render correctly.
// - Radial layouts use curve edges.
// - Tree-right uses outline-style orthogonal edges (parent bottom-left → child left).
// - Hierarchy-right uses centered orthogonal elbow edges (parent right → child left).
// - Tree-down uses vertical-down orthogonal edges.
// - Process-tree uses horizontal stage edges + vertical column edges,
//   chosen by geometry so subtree overrides also connect cleanly.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';
import { treeEdgePath } from './edgePaths';

interface Props {
  from: LaidOutNode;
  to: LaidOutNode;
  t: ThemeTokens;
  layoutType: LayoutType;
}

// 경로 계산은 edgePaths.ts (2026-10-23 분리 — '도형 없음' 밑줄 규칙 포함)
export function EdgeRenderer({ from, to, t, layoutType }: Props) {
  const width = from.depth === 0 ? 2.3 : 1.6;
  const d = treeEdgePath(from, to, layoutType);

  return (
    <path
      d={d}
      fill="none"
      stroke={t.edge}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}