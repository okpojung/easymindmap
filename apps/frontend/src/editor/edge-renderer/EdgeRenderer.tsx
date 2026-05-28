// EdgeRenderer — draws a single edge between two laid-out nodes.
// Edge style is decided by the active layoutType — see 10-canvas.md § 27.

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType } from '@/editor/__samples__/types';
import type { LaidOutNode } from '@/layout/types';

interface Props {
  from: LaidOutNode;
  to: LaidOutNode;
  t: ThemeTokens;
  layoutType: LayoutType;
}

export function EdgeRenderer({ from, to, t, layoutType }: Props) {
  const color = t.edge;
  const width = from.depth === 0 ? 2.2 : 1.6;

  // Hierarchy-right: L-shape connector (indent guide line)
  if (layoutType === 'hierarchy-right') {
    const px = from.x - from.w/2 + 14;
    const py = from.y + from.h/2;
    const tx = to.x - to.w/2;
    const ty = to.y;
    const d = `M ${px} ${py} V ${ty} H ${tx}`;
    return <path d={d} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" />;
  }

  // Tree-down: orthogonal top → bottom
  if (layoutType === 'tree-down') {
    const fx = from.x;
    const fy = from.y + from.h/2;
    const tx = to.x;
    const ty = to.y - to.h/2;
    const my = fy + (ty - fy) * 0.5;
    const d = `M ${fx} ${fy} V ${my} H ${tx} V ${ty}`;
    return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;
  }

  // Tree-right / tree-left: orthogonal horizontal
  if (layoutType === 'tree-right' || layoutType === 'tree-left') {
    const fx = from.x + (to.side === 'right' ? from.w/2 : -from.w/2);
    const fy = from.y;
    const tx = to.side === 'right' ? to.x - to.w/2 : to.x + to.w/2;
    const ty = to.y;
    const mx = fx + (tx - fx) * 0.5;
    const d = `M ${fx} ${fy} H ${mx} V ${ty} H ${tx}`;
    return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;
  }

  // Default: smooth cubic bezier (radial variants, freeform)
  const fx2 = from.x + (to.side === 'right' ? from.w/2 : to.side === 'left' ? -from.w/2 : 0);
  const tx2 = to.side === 'right' ? to.x - to.w/2 : to.side === 'left' ? to.x + to.w/2 : to.x;
  const fy = from.y;
  const ty = to.y;
  const mx = (fx2 + tx2) / 2;
  const d = `M ${fx2} ${fy} C ${mx} ${fy}, ${mx} ${ty}, ${tx2} ${ty}`;
  return <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" />;
}
