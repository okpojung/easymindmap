// NodeRenderer — renders a single node as an SVG <g> group.
// Includes: selection glow, drop-target highlight, soft-lock border, body shape
// (7 shapeType variants), branch icon, wrapped text, tag chips (via
// NodeTagChips), content indicators (note / link / attachment), collapse toggle,
// inline text edit, soft-lock editor label.

import { useEffect, useRef, useState } from 'react';
import type { ThemeTokens, ThemeName } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import type { TextAlign, ShapeType } from '@/editor/__samples__/types';
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
  dropTarget?: boolean;
  onSelect: () => void;
  collabs: Collaborator[];
}

function borderDash(style: string | undefined, width: number): string | undefined {
  if (style === 'dashed') return `${Math.max(4, width * 3)} ${Math.max(3, width * 2)}`;
  if (style === 'dotted') return `${Math.max(1, width)} ${Math.max(3, width * 2)}`;
  return undefined;
}

// Returns the SVG body element for the given shape, sized to the node box.
function NodeShape({
  shape,
  n,
  fill,
  stroke,
  strokeWidth,
  dash,
  filter,
}: {
  shape: ShapeType;
  n: RenderableNode;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  filter?: string;
}) {
  const x0 = n.x - n.w / 2;
  const y0 = n.y - n.h / 2;
  const x1 = n.x + n.w / 2;
  const y1 = n.y + n.h / 2;
  const common = {
    fill,
    stroke,
    strokeWidth,
    strokeDasharray: dash,
    filter,
  };

  if (shape === 'ellipse') {
    return <ellipse cx={n.x} cy={n.y} rx={n.w / 2} ry={n.h / 2} {...common} />;
  }
  if (shape === 'diamond') {
    return (
      <polygon points={`${n.x},${y0} ${x1},${n.y} ${n.x},${y1} ${x0},${n.y}`} {...common} />
    );
  }
  if (shape === 'hexagon') {
    const i = Math.min(22, n.w * 0.18);
    return (
      <polygon
        points={`${x0 + i},${y0} ${x1 - i},${y0} ${x1},${n.y} ${x1 - i},${y1} ${x0 + i},${y1} ${x0},${n.y}`}
        {...common}
      />
    );
  }
  if (shape === 'parallelogram') {
    const s = Math.min(20, n.w * 0.16);
    return (
      <polygon
        points={`${x0 + s},${y0} ${x1},${y0} ${x1 - s},${y1} ${x0},${y1}`}
        {...common}
      />
    );
  }

  // rect family
  const rx = shape === 'rectangle' ? 2 : shape === 'pill' ? n.h / 2 : n.depth === 0 ? 14 : 10;
  return <rect x={x0} y={y0} width={n.w} height={n.h} rx={rx} {...common} />;
}

export function NodeRenderer({ n, t, selected, dropTarget, onSelect, collabs }: Props) {
  const colors = resolveNodeColors(n, t);
  const updateNodeText = useDocumentStore((state) => state.updateNodeText);
  const toggleCollapse = useDocumentStore((state) => state.toggleCollapse);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(n.text);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isRoot = n.depth === 0;
  const isBranch = n.depth === 1;

  const lockedBy = n.locked ? collabs.find((c) => c.editing === n.id) : undefined;
  const tagList = Array.isArray(n.tags) ? n.tags : n.tag ? [n.tag] : [];
  const hasTags = tagList.length > 0;
  const hasNote = !!n.note || (n.notes?.length ?? 0) > 0;
  const linkCount = n.links?.length ?? 0;
  const attachmentCount = n.attachments?.length ?? 0;
  const childCount = n._childCount ?? 0;
  const collapsible = !isRoot && childCount > 0;

  const style = n.style ?? {};
  const shape: ShapeType = style.shapeType ?? 'rounded';

  const fill = style.fillColor ?? colors.fill;
  const border = style.borderColor ?? colors.border;
  const textColor = style.textColor ?? colors.text;

  const lines = n._lines || String(n.text || '').split('\n');
  const lineHeight = n._lineHeight ?? (n.depth === 0 ? 24 : 18);
  const fontSize = style.fontSize ?? n._fontSize ?? (n.depth === 0 ? 18 : n.depth === 1 ? 14 : 13);
  const fontWeight =
    style.fontWeight === 'bold'
      ? 700
      : style.fontWeight === 'normal'
        ? 400
        : (n._fontWeight ?? (n.depth === 0 ? 700 : n.depth === 1 ? 600 : 500));
  const fontStyle = style.fontStyle ?? 'normal';

  const strokeWidth = style.borderWidth ?? (isRoot ? 2 : selected ? 1.5 : 1);
  const dash = borderDash(style.borderStyle, strokeWidth);

  const textAlign: TextAlign = n.textAlign ?? 'left';
  const textAnchor =
    textAlign === 'right' ? 'end' : textAlign === 'center' ? 'middle' : 'start';
  const textX =
    textAlign === 'right'
      ? n.x + n.w / 2 - 14
      : textAlign === 'center'
        ? n.x
        : n.x - n.w / 2 + 14 + (isBranch && n.icon ? 24 : 0);

  // collapse toggle position depends on the side children extend toward
  const toggle =
    n.side === 'left'
      ? { x: n.x - n.w / 2 - 10, y: n.y }
      : n.side === 'down'
        ? { x: n.x, y: n.y + n.h / 2 + 10 }
        : { x: n.x + n.w / 2 + 10, y: n.y };

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
      {dropTarget && (
        <rect
          x={n.x - n.w / 2 - 7}
          y={n.y - n.h / 2 - 7}
          width={n.w + 14}
          height={n.h + 14}
          rx={isRoot ? 18 : 12}
          fill={t.primary}
          opacity="0.12"
          stroke={t.primary}
          strokeWidth="2"
          strokeDasharray="5 3"
        />
      )}

      {selected && !dropTarget && (
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

      <NodeShape
        shape={shape}
        n={n}
        fill={fill}
        stroke={border}
        strokeWidth={strokeWidth}
        dash={dash}
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
              fontStyle={fontStyle}
              fill={textColor}
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
              color: textColor,
              fontSize,
              fontWeight,
              fontStyle,
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

      {/* Content indicators: note / link / attachment */}
      {!editing && (hasNote || linkCount > 0 || attachmentCount > 0) && (
        <g>
          {[
            hasNote ? '📝' : null,
            linkCount > 0 ? '🔗' : null,
            attachmentCount > 0 ? '📎' : null,
          ]
            .filter(Boolean)
            .map((icon, i) => (
              <g
                key={i}
                transform={`translate(${n.x - n.w / 2 + 9 + i * 15}, ${n.y + n.h / 2 - 8})`}
              >
                <circle r="6.5" fill={t.surface} stroke={border} strokeWidth="0.8" />
                <text y="3" fontSize="8" textAnchor="middle">
                  {icon}
                </text>
              </g>
            ))}
        </g>
      )}

      {/* Collapse / expand toggle (shown when the node has children) */}
      {collapsible && !editing && (
        <g
          transform={`translate(${toggle.x}, ${toggle.y})`}
          style={{ cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(n.id);
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <circle r="8" fill={t.surface} stroke={border} strokeWidth="1.4" />
          <line x1={-4} y1={0} x2={4} y2={0} stroke={textColor} strokeWidth="1.4" strokeLinecap="round" />
          {n.collapsed && (
            <line x1={0} y1={-4} x2={0} y2={4} stroke={textColor} strokeWidth="1.4" strokeLinecap="round" />
          )}
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
