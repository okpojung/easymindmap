// File: src/layout/LayoutEngine.ts
// Version: MVP-LayoutEngine-TreeRight-Fix-v1.0.0
// Description:
// - Dispatches each layout type to its own strategy.
// - tree-right      -> layoutTreeRight()
// - tree-down       -> layoutTreeDown()
// - hierarchy-right -> layoutHierarchyRight()
// - process-tree    -> layoutProcessTreeRight()
// - radial layouts  -> radial strategies
// - Does not use stale sample.root.layoutType for dispatch.

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LaidOutNode } from './types';

import { layoutRadial, layoutRadialOneSide } from './strategies/RadialStrategy';
import { layoutTreeRight, layoutTreeDown } from './strategies/TreeStrategy';
import { layoutHierarchyRight } from './strategies/HierarchyStrategy';
import { layoutProcessTreeRight } from './strategies/ProcessStrategy';

function normalizeLayoutType(layoutType?: LayoutType): LayoutType {
  if (!layoutType) return 'radial-bidirectional' as LayoutType;

  if (layoutType === 'radial') return 'radial-right' as LayoutType;
  if (layoutType === 'both-radial') return 'radial-bidirectional' as LayoutType;
  if (layoutType === 'tree') return 'tree-right' as LayoutType;
  if (layoutType === 'hierarchy') return 'hierarchy-right' as LayoutType;
  if (layoutType === 'progress-tree') return 'process-tree-right' as LayoutType;
  if (layoutType === 'free') return 'freeform' as LayoutType;

  return layoutType;
}

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
    case 'process-tree-right-a':
    case 'process-tree-right-b':
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

  return out;
}