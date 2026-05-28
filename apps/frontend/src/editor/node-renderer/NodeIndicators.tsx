// NodeIndicators — 4-direction "+" buttons around the selected node.
// Spec: docs/03-editor-core/node/02-node-editing.md (NODE-IND-01~04)
// Visual spec: docs/03-editor-core/canvas/10-canvas.md § 22

import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';

interface Props {
  node: LaidOutNode;
  t: ThemeTokens;
}

export function NodeIndicators({ node, t }: Props) {
  const isRoot = node.depth === 0;
  const spots = [
    { dir: 'up'    as const, x: node.x,                  y: node.y - node.h/2 - 22, disabled: isRoot },
    { dir: 'down'  as const, x: node.x,                  y: node.y + node.h/2 + 22, disabled: false  },
    { dir: 'left'  as const, x: node.x - node.w/2 - 22,  y: node.y,                 disabled: isRoot },
    { dir: 'right' as const, x: node.x + node.w/2 + 22,  y: node.y,                 disabled: isRoot },
  ];
  return (
    <g>
      {spots.map(s => (
        <g key={s.dir} opacity={s.disabled ? 0.25 : 1}>
          <line
            x1={s.dir === 'up' ? node.x
              : s.dir === 'down' ? node.x
              : s.dir === 'left' ? node.x - node.w/2
              : node.x + node.w/2}
            y1={s.dir === 'up' ? node.y - node.h/2
              : s.dir === 'down' ? node.y + node.h/2
              : node.y}
            x2={s.x} y2={s.y}
            stroke={t.primary} strokeWidth="1.3" strokeDasharray="2 3" />
          <circle cx={s.x} cy={s.y} r="11"
                  fill={t.surface}
                  stroke={t.primary} strokeWidth="1.8" />
          <line x1={s.x - 5} y1={s.y} x2={s.x + 5} y2={s.y}
                stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
          <line x1={s.x} y1={s.y - 5} x2={s.x} y2={s.y + 5}
                stroke={t.primary} strokeWidth="1.8" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}
