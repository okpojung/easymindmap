import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

// Tree-right: all branches to the right of root, orthogonal edges, vertical stacking
export function layoutTreeRight(
  branches: SampleBranch[],
  CX: number, CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const hGap = 90, kHGap = 36, vGap = 14, kvGap = 6;
  const measured = branches.map(b => {
    const bs = sizeNodeForText(b.text, 1, { hasIcon: !!b.icon, minW: 150, maxW: 240 });
    const kids = (b.children || []).map(c => ({
      node: c, size: sizeNodeForText(c.text, 2, { minW: 130, maxW: 320 }),
    }));
    const kidsTotalH = kids.length === 0 ? 0
      : kids.reduce((s, k) => s + k.size.h, 0) + (kids.length - 1) * kvGap;
    const subtreeH = Math.max(bs.h, kidsTotalH);
    return { branch: b, bs, kids, subtreeH };
  });
  const totalH = measured.reduce((s, m) => s + m.subtreeH, 0) + (measured.length - 1) * vGap;
  let yStart = CY - totalH / 2;

  // Place root toward the left so we have horizontal room
  const rootX = CX - 380;
  out[0].x = rootX;

  measured.forEach(({ branch, bs, kids, subtreeH }) => {
    const by = yStart + subtreeH / 2;
    const bx = rootX + rootW/2 + hGap + bs.w/2;
    out.push({
      ...branch, x: bx, y: by, w: bs.w, h: bs.h,
      _lines: bs.lines, _fontSize: bs.fontSize, _fontWeight: bs.fontWeight, _lineHeight: bs.lineHeight,
      depth: 1, parent: 'root', side: 'right',
    });
    if (kids.length === 0) { yStart += subtreeH + vGap; return; }
    const kidsTotalH = kids.reduce((s, k) => s + k.size.h, 0) + (kids.length - 1) * kvGap;
    let ky = by - kidsTotalH / 2;
    kids.forEach(({ node: c, size: cs }) => {
      const kx = bx + bs.w/2 + kHGap + cs.w/2;
      out.push({
        ...c, x: kx, y: ky + cs.h/2, w: cs.w, h: cs.h,
        _lines: cs.lines, _fontSize: cs.fontSize, _fontWeight: cs.fontWeight, _lineHeight: cs.lineHeight,
        depth: 2, parent: branch.id, side: 'right', parentColorKey: branch.colorKey,
      });
      ky += cs.h + kvGap;
    });
    yStart += subtreeH + vGap;
  });
}

// Tree-down: root at top, branches in a horizontal row, children below each branch
export function layoutTreeDown(
  branches: SampleBranch[],
  CX: number, CY: number,
  _rootW: number,
  out: LaidOutNode[],
): void {
  const vGap = 50;
  const kvGap = 30;
  const hGapBetweenBranches = 16;
  const hGapBetweenKids = 8;

  const rootY = CY - 220;
  out[0].y = rootY;
  out[0].x = CX;
  const rootH = out[0].h;

  const measured = branches.map(b => {
    const bs = sizeNodeForText(b.text, 1, { hasIcon: !!b.icon, minW: 130, maxW: 200 });
    const kids = (b.children || []).map(c => ({
      node: c, size: sizeNodeForText(c.text, 2, { minW: 120, maxW: 200 }),
    }));
    const kidsRowW = kids.length === 0 ? 0
      : kids.reduce((s, k) => s + k.size.w, 0) + (kids.length - 1) * hGapBetweenKids;
    const branchW = Math.max(bs.w, kidsRowW);
    return { branch: b, bs, kids, branchW };
  });

  const totalW = measured.reduce((s, m) => s + m.branchW, 0) + (measured.length - 1) * hGapBetweenBranches;
  let xStart = CX - totalW / 2;
  const by = rootY + rootH/2 + vGap;

  measured.forEach(({ branch, bs, kids, branchW }) => {
    const bx = xStart + branchW / 2;
    out.push({
      ...branch, x: bx, y: by + bs.h/2, w: bs.w, h: bs.h,
      _lines: bs.lines, _fontSize: bs.fontSize, _fontWeight: bs.fontWeight, _lineHeight: bs.lineHeight,
      depth: 1, parent: 'root', side: 'down',
    });
    if (kids.length > 0) {
      const kidsRowW = kids.reduce((s, k) => s + k.size.w, 0) + (kids.length - 1) * hGapBetweenKids;
      let kx = bx - kidsRowW / 2;
      const kyTop = by + bs.h + kvGap;
      kids.forEach(({ node: c, size: cs }) => {
        out.push({
          ...c, x: kx + cs.w/2, y: kyTop + cs.h/2, w: cs.w, h: cs.h,
          _lines: cs.lines, _fontSize: cs.fontSize, _fontWeight: cs.fontWeight, _lineHeight: cs.lineHeight,
          depth: 2, parent: branch.id, side: 'down', parentColorKey: branch.colorKey,
        });
        kx += cs.w + hGapBetweenKids;
      });
    }
    xStart += branchW + hGapBetweenBranches;
  });
}
