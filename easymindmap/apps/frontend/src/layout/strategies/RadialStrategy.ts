import { sizeNodeForText } from '@/editor/node-renderer/sizeNodeForText';
import type { SampleBranch } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

// Radial — bidirectional. Branches split left/right by their declared `side`.
export function layoutRadial(
  branches: SampleBranch[],
  CX: number, CY: number,
  rootW: number,
  out: LaidOutNode[],
): void {
  const rightBranches = branches.filter(b => b.side === 'right');
  const leftBranches  = branches.filter(b => b.side === 'left');

  const vGap = 16;
  const hGap = 90;
  const kHGap = 36;
  const kvGap = 6;

  function layoutSide(brs: SampleBranch[], side: 'left' | 'right') {
    const measured = brs.map(b => {
      const bs = sizeNodeForText(b.text, 1, { hasIcon: !!b.icon, minW: 150, maxW: 240 });
      const kids = (b.children || []).map(c => ({
        node: c,
        size: sizeNodeForText(c.text, 2, { minW: 130, maxW: 320 }),
      }));
      const kidsTotalH = kids.length === 0 ? 0
        : kids.reduce((s, k) => s + k.size.h, 0) + (kids.length - 1) * kvGap;
      const subtreeH = Math.max(bs.h, kidsTotalH);
      return { branch: b, bs, kids, subtreeH };
    });

    const totalH = measured.reduce((s, m) => s + m.subtreeH, 0) + (measured.length - 1) * vGap;
    let yStart = CY - totalH / 2;

    measured.forEach(({ branch, bs, kids, subtreeH }) => {
      const by = yStart + subtreeH / 2;
      const bx = side === 'right'
        ? CX + rootW/2 + hGap + bs.w/2
        : CX - rootW/2 - hGap - bs.w/2;
      out.push({
        ...branch, x: bx, y: by, w: bs.w, h: bs.h,
        _lines: bs.lines, _fontSize: bs.fontSize,
        _fontWeight: bs.fontWeight, _lineHeight: bs.lineHeight,
        depth: 1, parent: 'root', side,
      });

      if (kids.length === 0) { yStart += subtreeH + vGap; return; }
      const kidsTotalH = kids.reduce((s, k) => s + k.size.h, 0) + (kids.length - 1) * kvGap;
      let ky = by - kidsTotalH / 2;
      kids.forEach(({ node: c, size: cs }) => {
        const kx = side === 'right'
          ? bx + bs.w/2 + kHGap + cs.w/2
          : bx - bs.w/2 - kHGap - cs.w/2;
        out.push({
          ...c, x: kx, y: ky + cs.h/2, w: cs.w, h: cs.h,
          _lines: cs.lines, _fontSize: cs.fontSize,
          _fontWeight: cs.fontWeight, _lineHeight: cs.lineHeight,
          depth: 2, parent: branch.id, side,
          parentColorKey: branch.colorKey,
        });
        ky += cs.h + kvGap;
      });

      yStart += subtreeH + vGap;
    });
  }

  layoutSide(rightBranches, 'right');
  layoutSide(leftBranches, 'left');
}

// Radial — single side (right or left only)
export function layoutRadialOneSide(
  branches: SampleBranch[],
  CX: number, CY: number,
  rootW: number,
  out: LaidOutNode[],
  side: 'left' | 'right',
): void {
  const hGap = 90, kHGap = 36, kvGap = 6, vGap = 16;
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
  measured.forEach(({ branch, bs, kids, subtreeH }) => {
    const by = yStart + subtreeH / 2;
    const bx = side === 'right'
      ? CX + rootW/2 + hGap + bs.w/2
      : CX - rootW/2 - hGap - bs.w/2;
    out.push({
      ...branch, x: bx, y: by, w: bs.w, h: bs.h,
      _lines: bs.lines, _fontSize: bs.fontSize, _fontWeight: bs.fontWeight, _lineHeight: bs.lineHeight,
      depth: 1, parent: 'root', side,
    });
    if (kids.length === 0) { yStart += subtreeH + vGap; return; }
    const kidsTotalH = kids.reduce((s, k) => s + k.size.h, 0) + (kids.length - 1) * kvGap;
    let ky = by - kidsTotalH / 2;
    kids.forEach(({ node: c, size: cs }) => {
      const kx = side === 'right'
        ? bx + bs.w/2 + kHGap + cs.w/2
        : bx - bs.w/2 - kHGap - cs.w/2;
      out.push({
        ...c, x: kx, y: ky + cs.h/2, w: cs.w, h: cs.h,
        _lines: cs.lines, _fontSize: cs.fontSize, _fontWeight: cs.fontWeight, _lineHeight: cs.lineHeight,
        depth: 2, parent: branch.id, side, parentColorKey: branch.colorKey,
      });
      ky += cs.h + kvGap;
    });
    yStart += subtreeH + vGap;
  });
}
