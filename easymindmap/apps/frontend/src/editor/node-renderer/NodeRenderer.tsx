// NodeRenderer — renders a single node as an SVG <g> group.
// Includes: selection glow, soft-lock border, body shape, branch icon, wrapped text,
// tag chips (via NodeTagChips), note indicator, soft-lock editor label.

import type { ThemeTokens, ThemeName } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import type { Collaborator } from '@/editor/__samples__/types';
import { resolveNodeColors } from './resolveNodeColors';
import { NodeTagChips } from './NodeTagChips';

interface Props {
  n: LaidOutNode;
  t: ThemeTokens;
  selected: boolean;
  onSelect: () => void;
  collabs: Collaborator[];
}

export function NodeRenderer({ n, t, selected, onSelect, collabs }: Props) {
  const colors = resolveNodeColors(n, t);
  const isRoot   = n.depth === 0;
  const isBranch = n.depth === 1;
  const isLeaf   = n.depth === 2;

  const lockedBy = n.locked ? collabs.find(c => c.editing === n.id) : undefined;
  const tagList = Array.isArray(n.tags) ? n.tags : (n.tag ? [n.tag] : []);
  const hasTags = tagList.length > 0;
  const hasNote = !!n.note;

  // Pre-wrapped lines from the layout pass; fallback to manual split.
  const lines = n._lines || String(n.text || '').split('\n');
  const lineHeight = n._lineHeight ?? (n.depth === 0 ? 24 : 18);
  const fontSize   = n._fontSize   ?? (n.depth === 0 ? 18 : n.depth === 1 ? 14 : 13);
  const fontWeight = n._fontWeight ?? (n.depth === 0 ? 700 : n.depth === 1 ? 600 : 500);

  return (
    <g data-node-id={n.id}
       onClick={(e) => { e.stopPropagation(); onSelect(); }}
       style={{ cursor: 'pointer' }}>
      {/* Selection glow */}
      {selected && (
        <rect
          x={n.x - n.w/2 - 6} y={n.y - n.h/2 - 6}
          width={n.w + 12} height={n.h + 12}
          rx={isRoot ? 18 : 12}
          fill="none"
          stroke={t.primary} strokeWidth="2"
          strokeDasharray="4 3" opacity="0.6" />
      )}

      {/* Soft lock border */}
      {lockedBy && (
        <rect
          x={n.x - n.w/2 - 3} y={n.y - n.h/2 - 3}
          width={n.w + 6} height={n.h + 6}
          rx={isRoot ? 15 : 10}
          fill="none"
          stroke={(t as any)[lockedBy.colorKey]} strokeWidth="2.5" />
      )}

      {/* Main body */}
      <rect
        x={n.x - n.w/2} y={n.y - n.h/2}
        width={n.w} height={n.h}
        rx={isRoot ? 14 : (isLeaf ? 8 : 10)}
        fill={colors.fill}
        stroke={colors.border}
        strokeWidth={isRoot ? 2 : (selected ? 1.5 : 1)}
        filter={isRoot ? 'url(#nodeShadow)' : undefined} />

      {/* Branch icon (NS-05) */}
      {isBranch && n.icon && (
        <text
          x={n.x - n.w/2 + 12} y={n.y + 5}
          fontSize={fontSize + 2} textAnchor="start"
          style={{ fontFamily: 'inherit' }}>
          {n.icon}
        </text>
      )}

      {/* Wrapped text lines */}
      {lines.map((line, i) => {
        const yCenter = n.y + (i - (lines.length - 1) / 2) * lineHeight + fontSize * 0.34;
        const xShift = isBranch && n.icon ? 10 : 0;
        return (
          <text key={i}
                x={n.x + xShift} y={yCenter}
                textAnchor="middle"
                fontSize={fontSize} fontWeight={fontWeight}
                fill={colors.text}
                style={{ fontFamily: 'inherit' }}>
            {line}
          </text>
        );
      })}

      {hasTags && <NodeTagChips n={n} tagList={tagList} t={t} />}

      {hasNote && (
        <g transform={`translate(${n.x - n.w/2 + 8}, ${n.y + n.h/2 - 8})`}>
          <circle r="5" fill={t.surface} stroke={colors.border} strokeWidth="1" />
          <text y="3" fontSize="8" textAnchor="middle" fill={colors.text}>📝</text>
        </g>
      )}

      {lockedBy && (
        <g transform={`translate(${n.x}, ${n.y + n.h/2 + 14})`}>
          <rect x={-46} y={-9} width={92} height={18} rx={9}
                fill={(t as any)[lockedBy.colorKey]} />
          <text x="-32" y="4" fontSize="10" fill="#fff" fontWeight="600">✏</text>
          <text x="-16" y="4" fontSize="10" fill="#fff" fontWeight="600" textAnchor="start">
            {lockedBy.name} 편집 중
          </text>
        </g>
      )}

      <defs>
        <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3"
                        floodColor={(t.name as ThemeName) === 'dark' ? '#000' : '#6B4A1A'}
                        floodOpacity={(t.name as ThemeName) === 'dark' ? 0.6 : 0.18} />
        </filter>
      </defs>
    </g>
  );
}
