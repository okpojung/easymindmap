import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

// Hierarchy-right — indented outline (org-chart style), connecting lines form L-shapes.
export function layoutHierarchyRight(
  branches: SampleBranch[],
  CX: number, CY: number,
  _rootW: number,
  out: LaidOutNode[],
): void {
  const indentPerLevel = 24;
  const rowGap = 5;

  const rootX = CX - 380;
  out[0].x = rootX;
  out[0].y = CY - 180;
  const rootBottom = out[0].y + out[0].h / 2;

  let y = rootBottom + 24;
  const rootLeft = rootX - out[0].w/2;

  branches.forEach((b) => {
    const bs = sizeNodeForText(b.text, 1, { hasIcon: !!b.icon, minW: 180, maxW: 280 });
    const branchX = rootLeft + indentPerLevel + bs.w/2;
    out.push({
      ...b, x: branchX, y: y + bs.h/2, w: bs.w, h: bs.h,
      _lines: bs.lines, _fontSize: bs.fontSize, _fontWeight: bs.fontWeight, _lineHeight: bs.lineHeight,
      depth: 1, parent: 'root', side: 'right',
    });
    y += bs.h + rowGap;
    const kids = b.children || [];
    kids.forEach(c => {
      const cs = sizeNodeForText(c.text, 2, { minW: 200, maxW: 320 });
      const kidX = rootLeft + indentPerLevel * 2 + cs.w/2;
      out.push({
        ...c, x: kidX, y: y + cs.h/2, w: cs.w, h: cs.h,
        _lines: cs.lines, _fontSize: cs.fontSize, _fontWeight: cs.fontWeight, _lineHeight: cs.lineHeight,
        depth: 2, parent: b.id, side: 'right', parentColorKey: b.colorKey,
      });
      y += cs.h + rowGap;
    });
    y += 6;
  });
}
