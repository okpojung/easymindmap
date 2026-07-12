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
import { useEditorUiStore } from '@/stores/editorUiStore';
import { resolveNodeColors } from './resolveNodeColors';
import { NodeTagChips } from './NodeTagChips';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { nodeContentIndicators, type ContentKind } from './nodeContent';
import { IndicatorGlyph } from './IndicatorGlyph';

type RenderableNode = LaidOutNode & {
  textAlign?: TextAlign;
};

interface Props {
  n: RenderableNode;
  t: ThemeTokens;
  selected: boolean;
  dropTarget?: boolean;
  onSelect: () => void;
  onHover?: (id: string | null) => void;
  onOpenPopover?: (nodeId: string, kind: ContentKind) => void;
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

export function NodeRenderer({ n, t, selected, dropTarget, onSelect, onHover, onOpenPopover, collabs }: Props) {
  const colors = resolveNodeColors(n, t);
  const updateNodeText = useDocumentStore((state) => state.updateNodeText);
  const showTags = useEditorUiStore((state) => state.showTags);
  const hiddenTags = useEditorUiStore((state) => state.hiddenTags);

  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(n.text);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isRoot = n.depth === 0;
  const isBranch = n.depth === 1;

  const lockedBy = n.locked ? collabs.find((c) => c.editing === n.id) : undefined;
  const allTags = Array.isArray(n.tags) ? n.tags : n.tag ? [n.tag] : [];
  // Only show tags that aren't filtered out in the search panel.
  const tagList = allTags.filter((tg) => !hiddenTags.includes(tg));
  const hasTags = tagList.length > 0;

  // Content indicators (note / link / file / media) — see nodeContent.ts
  const contentIcons = nodeContentIndicators(n);

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

  // Icon can be shown on any node (not only branches), on the left or right.
  const hasIcon = !!n.icon;
  const iconSide: 'left' | 'right' = n.iconSide ?? 'left';
  const iconX = iconSide === 'right' ? n.x + n.w / 2 - 16 : n.x - n.w / 2 + 12;

  const textAlign: TextAlign = n.textAlign ?? 'left';
  const textAnchor =
    textAlign === 'right' ? 'end' : textAlign === 'center' ? 'middle' : 'start';
  const textX =
    textAlign === 'right'
      ? n.x + n.w / 2 - 14 - (hasIcon && iconSide === 'right' ? 22 : 0)
      : textAlign === 'center'
        ? n.x
        : n.x - n.w / 2 + 14 + (hasIcon && iconSide === 'left' ? 24 : 0);

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
      onMouseEnter={() => onHover?.(n.id)}
      onMouseLeave={() => onHover?.(null)}
      style={{ cursor: editing ? 'text' : 'pointer' }}
    >
      {dropTarget && (
        <rect
          x={n.x - n.w / 2 - 7}
          y={n.y - n.h / 2 - 7}
          width={n.w + 14}
          height={n.h + 14}
          rx={isRoot ? 18 : 12}
          fill={t.success}
          opacity="0.12"
          stroke={t.success}
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

      {/* [협업 UI 숨김 — MVP] 협업자가 편집 중인 노드의 색상 잠금 테두리 링.
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && lockedBy && (
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

      {hasIcon && !editing && (
        <text
          x={iconX}
          y={n.y + 5}
          fontSize={fontSize + 2}
          textAnchor={iconSide === 'right' ? 'middle' : 'start'}
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

      {hasTags && showTags && !editing && <NodeTagChips n={n} tagList={tagList} t={t} />}

      {/* Content indicators: leading-icon-sized icons INSIDE the node, right
          of the text (note / link / file / media). sizeNodeForText reserved
          `indicators` width so they all fit within the border. 1 item → opens
          directly; multiple → chooser popover (top overlay, Canvas). */}
      {!editing && contentIcons.length > 0 && (
        <g>
          {contentIcons.map((ic, i) => {
            const icSize = fontSize + 2; // same scale as the node's leading icon
            // right-aligned row inside the box, matching the reserve
            // (indicators * (fontSize + 5) + 4) in sizeNodeForText
            const cx =
              n.x + n.w / 2 - 9 -
              (contentIcons.length - 1 - i) * (fontSize + 5) -
              icSize / 2;
            const cy = n.y;
            const single = ic.items[0];
            return (
              <g
                key={ic.kind}
                transform={`translate(${cx}, ${cy})`}
                style={{ cursor: ic.kind === 'note' ? 'default' : 'pointer' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // 인디케이터를 눌러도 노드 자체는 항상 선택된다 —
                  // 노드 오른쪽(아이콘 영역) 클릭이 무반응이던 문제 방지.
                  onSelect();
                  if (ic.kind === 'note') return;
                  if (ic.count > 1) { onOpenPopover?.(n.id, ic.kind); return; }
                  if (single?.url) window.open(single.url, '_blank', 'noopener');
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <title>{ic.title}</title>
                {ic.kind === 'link' || ic.kind === 'file' ? (
                  // 이모지 대신 진한 SVG 글리프(지구본+체인 / 클립) —
                  // OS에 따라 흐리게 렌더링되는 문제 해소
                  <IndicatorGlyph kind={ic.kind} size={icSize + 2} />
                ) : (
                  <text y={icSize * 0.36} fontSize={icSize} textAnchor="middle">{ic.icon}</text>
                )}
                {ic.count > 1 && (
                  <text x={icSize / 2 + 2} y={-icSize / 2 + 3} fontSize="8" fontWeight="700" fill={t.primary} textAnchor="middle">
                    {ic.count}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      )}

      {/* [협업 UI 숨김 — MVP] 노드 아래 "○○○ 편집 중" 배지(협업자 수정위치 표시).
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && lockedBy && !editing && (
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
