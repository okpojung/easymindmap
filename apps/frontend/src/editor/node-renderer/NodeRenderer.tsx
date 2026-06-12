// NodeRenderer — renders a single node as an SVG <g> group.
// Includes: selection glow, soft-lock border, body shape, branch icon, wrapped text,
// tag chips (via NodeTagChips), note indicator, soft-lock editor label.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens, ThemeName } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import type { TextAlign } from '@/types/mindmap';
import type { Collaborator } from '@/editor/__samples__/types';
import { useDocumentStore } from '@/stores/documentStore';
import { resolveNodeColors } from './resolveNodeColors';
import { NodeTagChips } from './NodeTagChips';

type RenderableNode = LaidOutNode & {
  textAlign?: TextAlign;
};

interface Props {
  n: RenderableNode;
  t: ThemeTokens;
  selected: boolean;
  onSelect: () => void;
  collabs: Collaborator[];
}

export function NodeRenderer({ n, t, selected, onSelect, collabs }: Props) {
  const colors = resolveNodeColors(n, t);
  const updateNodeText = useDocumentStore((state) => state.updateNodeText);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(n.text);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isRoot = n.depth === 0;
  const isBranch = n.depth === 1;
  const isLeaf = n.depth === 2;

  const lockedBy = n.locked ? collabs.find((c) => c.editing === n.id) : undefined;
  const tagList = Array.isArray(n.tags) ? n.tags : n.tag ? [n.tag] : [];
  const hasTags = tagList.length > 0;
  const hasNote = !!n.note;

  const lines = n._lines || String(n.text || '').split('\n');
  const lineHeight = n._lineHeight ?? (n.depth === 0 ? 24 : 18);
  const fontSize = n._fontSize ?? (n.depth === 0 ? 18 : n.depth === 1 ? 14 : 13);
  const fontWeight = n._fontWeight ?? (n.depth === 0 ? 700 : n.depth === 1 ? 600 : 500);

  const textAlign: TextAlign = n.textAlign ?? 'left';

  const textAnchor =
    textAlign === 'right'
      ? 'end'
      : textAlign === 'center'
        ? 'middle'
        : 'start';

  const textX =
    textAlign === 'right'
      ? n.x + n.w / 2 - 14
      : textAlign === 'center'
        ? n.x
        : n.x - n.w / 2 + 14 + (isBranch && n.icon ? 24 : 0);

  const startEdit = () => {
    setDraftText(n.text);
    setEditing(true);
    onSelect();
  };

  const saveEdit = () => {
    const nextText = draftText.trimEnd();

    if (nextText.trim().length > 0 && nextText !== n.text) {
      updateNodeText(n.id, nextText);
    }

    setEditing(false);
  };

  const cancelEdit = () => {
    setDraftText(n.text);
    setEditing(false);
  };

  useEffect(() => {
    if (!editing) return;

    window.setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 0);
  }, [editing]);

  return (
    <g
      data-node-id={n.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      style={{ cursor: editing ? 'text' : 'pointer' }}
    >
      {selected && (
        <rect
          x={n.x - n.w / 2 - 6}
          y={n.y - n.h / 2 - 6}
          width={n.w + 12}
          height={n.h + 12}
          rx={isRoot ? 18 : 12}
          fill="none"
          stroke={t.primary}
          strokeWidth="2"
          strokeDasharray="4 3"
          opacity="0.6"
        />
      )}

      {lockedBy && (
        <rect
          x={n.x - n.w / 2 - 3}
          y={n.y - n.h / 2 - 3}
          width={n.w + 6}
          height={n.h + 6}
          rx={isRoot ? 15 : 10}
          fill="none"
          stroke={(t as any)[lockedBy.colorKey]}
          strokeWidth="2.5"
        />
      )}

      <rect
        x={n.x - n.w / 2}
        y={n.y - n.h / 2}
        width={n.w}
        height={n.h}
        rx={isRoot ? 14 : isLeaf ? 8 : 10}
        fill={colors.fill}
        stroke={colors.border}
        strokeWidth={isRoot ? 2 : selected ? 1.5 : 1}
        filter={isRoot ? 'url(#nodeShadow)' : undefined}
      />

      {isBranch && n.icon && !editing && (
        <text
          x={n.x - n.w / 2 + 12}
          y={n.y + 5}
          fontSize={fontSize + 2}
          textAnchor="start"
          style={{ fontFamily: 'inherit' }}
        >
          {n.icon}
        </text>
      )}

      {!editing &&
        lines.map((line, i) => {
          const yCenter =
            n.y + (i - (lines.length - 1) / 2) * lineHeight + fontSize * 0.34;

          return (
            <text
              key={i}
              x={textX}
              y={yCenter}
              textAnchor={textAnchor}
              fontSize={fontSize}
              fontWeight={fontWeight}
              fill={colors.text}
              style={{ fontFamily: 'inherit' }}
            >
              {line}
            </text>
          );
        })}

      {editing && (
        <foreignObject
          x={n.x - n.w / 2 + 8}
          y={n.y - n.h / 2 + 6}
          width={n.w - 16}
          height={n.h - 12}
        >
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              }

              if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={() => {
              saveEdit();
            }}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              color: colors.text,
              fontSize,
              fontWeight,
              lineHeight: `${lineHeight}px`,
              fontFamily: 'inherit',
              textAlign,
              overflow: 'hidden',
              padding: 0,
              margin: 0,
            }}
          />
        </foreignObject>
      )}

      {hasTags && !editing && <NodeTagChips n={n} tagList={tagList} t={t} />}

      {hasNote && !editing && (
        <g transform={`translate(${n.x - n.w / 2 + 8}, ${n.y + n.h / 2 - 8})`}>
          <circle r="5" fill={t.surface} stroke={colors.border} strokeWidth="1" />
          <text y="3" fontSize="8" textAnchor="middle" fill={colors.text}>
            📝
          </text>
        </g>
      )}

      {lockedBy && !editing && (
        <g transform={`translate(${n.x}, ${n.y + n.h / 2 + 14})`}>
          <rect x={-46} y={-9} width={92} height={18} rx={9} fill={(t as any)[lockedBy.colorKey]} />
          <text x="-32" y="4" fontSize="10" fill="#fff" fontWeight="600">
            ✏
          </text>
          <text x="-16" y="4" fontSize="10" fill="#fff" fontWeight="600" textAnchor="start">
            {lockedBy.name} 편집 중
          </text>
        </g>
      )}

      <defs>
        <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="3"
            floodColor={(t.name as ThemeName) === 'dark' ? '#000' : '#6B4A1A'}
            floodOpacity={(t.name as ThemeName) === 'dark' ? 0.6 : 0.18}
          />
        </filter>
      </defs>
    </g>
  );
}