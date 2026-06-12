// File: src/layout/LayoutEngine.ts
// Version: MVP-LayoutEngine-SubtreeOverrides-v2.0.0
// Description:
// - Dispatches each layout type to its own strategy.
// - tree-right      -> layoutTreeRight()
// - tree-down       -> layoutTreeDown()
// - hierarchy-right -> layoutHierarchyRight()
// - process-tree    -> layoutProcessTreeRight()
// - radial layouts  -> radial strategies
// - After the base layout, per-node layoutType overrides stored in the
//   document are applied via applyLayoutOverrides(): any node whose
//   layoutType differs from its parent's effective layout gets its subtree
//   re-laid-out in that style around the node's position.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LaidOutNode } from './types';
import { normalizeLayoutType } from './normalizeLayoutType';

import { layoutRadial, layoutRadialOneSide } from './strategies/RadialStrategy';
import { layoutTreeRight, layoutTreeDown } from './strategies/TreeStrategy';
import { layoutHierarchyRight } from './strategies/HierarchyStrategy';
import { layoutProcessTreeRight } from './strategies/ProcessStrategy';
import { applyLayoutOverrides } from './strategies/SubtreeStrategy';

export function computeLayout(
  sample: SampleMap,
  layoutType: LayoutType,
  CX: number,
  CY: number,
): LaidOutNode[] {
  const activeLayoutType = normalizeLayoutType(layoutType);

  if (activeLayoutType === 'kanban') {
    return [];
  }

  const rootSize = sizeNodeForText(sample.root.text, 0, {
    minW: 170,
    maxW: 260,
  });

  const out: LaidOutNode[] = [
    {
      ...sample.root,
      layoutType: activeLayoutType,
      x: CX,
      y: CY,
      w: rootSize.w,
      h: rootSize.h,
      _lines: rootSize.lines,
      _fontSize: rootSize.fontSize,
      _fontWeight: rootSize.fontWeight,
      _lineHeight: rootSize.lineHeight,
      depth: 0,
      parent: null,
      side: 'center',
    },
  ];

  const rootW = rootSize.w;
  const branches = sample.branches;

  switch (activeLayoutType) {
    case 'tree-right':
      layoutTreeRight(branches, CX, CY, rootW, out);
      break;

    case 'tree-down':
      layoutTreeDown(branches, CX, CY, rootW, out);
      break;

    case 'hierarchy-right':
      layoutHierarchyRight(branches, CX, CY, rootW, out);
      break;

    case 'process-tree-right':
      layoutProcessTreeRight(branches, CX, CY, rootW, out);
      break;

    case 'radial-left':
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'left');
      break;

    case 'radial-bidirectional':
      layoutRadial(branches, CX, CY, rootW, out);
      break;

    case 'freeform':
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'right');
      break;

    case 'radial-right':
    default:
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'right');
      break;
  }

  // Per-node layout overrides (e.g. a level-2 node whose subtree uses a
  // different layout than the map).
  applyLayoutOverrides(branches, activeLayoutType, out);

  return out;
}
