// NodeTagChips — flag-shaped tag chips placed below a node.
// Matches docs/assets/태그2.png pattern. See 10-canvas.md § 24.
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import { resolveTagColor } from './resolveTagColor';

interface Props {
  n: LaidOutNode;
  tagList: string[];
  t: ThemeTokens;
}

export function NodeTagChips({ n, tagList, t }: Props) {
  const tagH = 16;
  const arrowW = 6;
  const padX = 8;
  const charW = 6.2;
  const closeW = 14;
  const gap = 4;

  // Layout left → right, indented from the node's left edge.
  let cursor = n.x - n.w / 2 + 8;
  const baseY = n.y + n.h / 2 + 6;

  return (
    <g>
      {tagList.map((tagName, i) => {
        const tc = resolveTagColor(tagName, t);
        const labelW = Math.max(20, tagName.length * charW);
        const chipW = arrowW + padX + labelW + 4 + closeW;
        const x0 = cursor;
        const x1 = x0 + arrowW;
        const x2 = x0 + chipW;
        const yTop = baseY;
        const yBot = baseY + tagH;
        const yMid = baseY + tagH / 2;

        // Flag (ribbon) shape: pointed left tail + rounded right corners
        const path = `
          M ${x0} ${yMid}
          L ${x1} ${yTop}
          L ${x2 - 3} ${yTop}
          Q ${x2} ${yTop} ${x2} ${yTop + 3}
          L ${x2} ${yBot - 3}
          Q ${x2} ${yBot} ${x2 - 3} ${yBot}
          L ${x1} ${yBot}
          Z
        `;
        cursor += chipW + gap;

        return (
          <g key={tagName + i}>
            <path d={path} fill={tc.bg} stroke={tc.border} strokeWidth="0.8" />
            <text x={x1 + padX} y={yMid + 3.4}
                  fontSize="10" fontWeight="600"
                  fill={tc.text} textAnchor="start"
                  style={{ fontFamily: 'inherit', letterSpacing: 0.2 }}>
              {tagName}
            </text>
            <line x1={x1 + padX + labelW + 2} y1={yTop + 3}
                  x2={x1 + padX + labelW + 2} y2={yBot - 3}
                  stroke={tc.text} strokeOpacity="0.25" strokeWidth="0.8" />
            <g transform={`translate(${x1 + padX + labelW + 8}, ${yMid})`}
               style={{ cursor: 'pointer' }}>
              <line x1={-3} y1={-3} x2={3} y2={3}
                    stroke={tc.text} strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round" />
              <line x1={3} y1={-3} x2={-3} y2={3}
                    stroke={tc.text} strokeOpacity="0.65" strokeWidth="1.2" strokeLinecap="round" />
            </g>
          </g>
        );
      })}
    </g>
  );
}
