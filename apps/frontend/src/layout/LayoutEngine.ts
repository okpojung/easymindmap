// LayoutEngine — entry point that picks a strategy based on layoutType.
// Spec: docs/03-editor-core/layout/08-layout.md (15 layout types)
// Currently implemented strategies for the design demo:
//   - radial-bidirectional (default)
//   - radial-right
//   - tree-right
//   - tree-down
//   - hierarchy-right
//   - kanban (rendered by KanbanBoard component, returns [])

import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { LayoutType, SampleMap } from '@/editor/__samples__/types';
import type { LaidOutNode } from './types';

import { layoutRadial, layoutRadialOneSide } from './strategies/RadialStrategy';
import { layoutTreeRight, layoutTreeDown }    from './strategies/TreeStrategy';
import { layoutHierarchyRight }                from './strategies/HierarchyStrategy';

export function computeLayout(
  sample: SampleMap,
  layoutType: LayoutType,
  CX: number,
  CY: number,
): LaidOutNode[] {
  if (layoutType === 'kanban') return [];

  const out: LaidOutNode[] = [];

  // Root — auto-sized
  const rootSize = sizeNodeForText(sample.root.text, 0, { minW: 170, maxW: 260 });
  out.push({
    ...sample.root,
    x: CX, y: CY,
    w: rootSize.w, h: rootSize.h,
    _lines: rootSize.lines, _fontSize: rootSize.fontSize,
    _fontWeight: rootSize.fontWeight, _lineHeight: rootSize.lineHeight,
    depth: 0, parent: null,
  });
  const rootW = rootSize.w;

  const branches = sample.branches;

  switch (layoutType) {
    case 'tree-right':
      layoutTreeRight(branches, CX, CY, rootW, out);
      break;
    case 'tree-down':
      layoutTreeDown(branches, CX, CY, rootW, out);
      break;
    case 'hierarchy-right':
      layoutHierarchyRight(branches, CX, CY, rootW, out);
      break;
    case 'radial-right':
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'right');
      break;
    case 'radial-left':
      layoutRadialOneSide(branches, CX, CY, rootW, out, 'left');
      break;
    case 'radial-bidirectional':
    default:
      layoutRadial(branches, CX, CY, rootW, out);
      break;
  }

  return out;
}
