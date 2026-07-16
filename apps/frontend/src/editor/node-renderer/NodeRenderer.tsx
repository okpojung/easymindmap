// NodeRenderer — renders a single node as an SVG <g> group.
// Includes: selection glow, drop-target highlight, soft-lock border, body shape
// (7 shapeType variants), branch icon, wrapped text, tag chips (via
// NodeTagChips), content indicators (note / link / attachment), collapse toggle,
// inline text edit, soft-lock editor label.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ThemeTokens, ThemeName } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import type { TextAlign, ShapeType } from '@/editor/__samples__/types';
import type { Collaborator } from '@/editor/__samples__/types';
import { useDocumentStore } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { resolveNodeColors } from './resolveNodeColors';
import { NodeTagChips } from './NodeTagChips';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { nodeContentIndicators, isNoteKind, type ContentKind } from './nodeContent';
import { IndicatorGlyph, NoteTypeGlyph } from './IndicatorGlyph';
import { levelFontFamily, levelFontSize, scaleNodeImage } from './sizeNodeForText';
import { layoutMdTable, measureTextApprox, MD_TABLE_CELL_PAD_X } from './mdTable';
import { parseInlineMarks } from './inlineMarks';
import { useViewportStore } from '@/stores/viewportStore';
import { setHistoryPaused } from '@/stores/documentStore';
import { extractClipboardImage } from '@/utils/clipboardImage';

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
  const removeNodeTag = useDocumentStore((state) => state.removeNodeTag);
  const updateNodeSize = useDocumentStore((state) => state.updateNodeSize);
  const setNodeImage = useDocumentStore((state) => state.setNodeImage);
  const zoom = useViewportStore((state) => state.zoom);
  const setEditingNodeId = useInteractionStore((state) => state.setEditingNodeId);
  const showTags = useEditorUiStore((state) => state.showTags);

  // 우하단 크기 조절 핸들 드래그 상태
  const resizeRef = useRef<{
    pointerId: number; x: number; y: number; w: number; h: number; moved: boolean;
  } | null>(null);
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
  const fontSize = style.fontSize ?? n._fontSize ?? levelFontSize(n.depth);
  const fontWeight =
    style.fontWeight === 'bold'
      ? 700
      : style.fontWeight === 'normal'
        ? 400
        : (n._fontWeight ?? (n.depth === 0 ? 700 : n.depth === 1 ? 600 : 500));
  const fontStyle = style.fontStyle ?? 'normal';
  // 맵 설정(레벨별 폰트)의 글꼴 — 없으면 상위(문서 기본) 글꼴 상속
  const fontFamily = levelFontFamily(n.depth) ?? 'inherit';
  const strike = !!style.strike;
  const highlight = !!style.highlight;

  // 노드 텍스트 속 Markdown 표 — sizeNodeForText와 같은 측정으로 그린다.
  // (lines에는 표를 제외한 텍스트만 들어 있다)
  const mdTable = useMemo(() => layoutMdTable(String(n.text || ''), fontSize), [n.text, fontSize]);

  const strokeWidth = style.borderWidth ?? (isRoot ? 2 : selected ? 1.5 : 1);
  const dash = borderDash(style.borderStyle, strokeWidth);

  // Icon can be shown on any node (not only branches), on the left or right.
  const hasIcon = !!n.icon;
  const iconSide: 'left' | 'right' = n.iconSide ?? 'left';
  const iconX = iconSide === 'right' ? n.x + n.w / 2 - 16 : n.x - n.w / 2 + 12;

  // 기본 정렬 = 중앙 (스타일 탭에서 왼쪽/오른쪽으로 변경 가능)
  const textAlign: TextAlign = n.textAlign ?? 'center';
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
    setEditingNodeId(n.id); // 편집 중 +/− 인디케이터 숨김 (겹침 방지)
    onSelect();
  };

  const saveEdit = () => {
    const nextText = draftText.trimEnd();
    if (nextText.trim().length > 0 && nextText !== n.text) {
      updateNodeText(n.id, nextText);
    }
    setEditing(false);
    setEditingNodeId(null);
  };

  const cancelEdit = () => {
    setDraftText(n.text);
    setEditing(false);
    setEditingNodeId(null);
  };

  // 편집 중 선택한 텍스트를 인라인 마커로 감싼다 (부분 강조 — 미니 툴바/
  // Ctrl+B·I·U). 마커 문법은 inlineMarks.ts 참조 (**굵게** 등).
  const wrapSelection = (mark: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s0 = ta.selectionStart ?? 0;
    const e0 = ta.selectionEnd ?? s0;
    // 여러 줄 선택이면 줄마다 따로 감싼다 — 인라인 마커는 줄 단위 토글이라
    // 줄을 건너 감싸면 가운데 줄이 빠지거나 뒤집힌다.
    const wrapped = draftText
      .slice(s0, e0)
      .split('\n')
      .map((seg) => (seg.trim() === '' ? seg : mark + seg + mark))
      .join('\n');
    const next = draftText.slice(0, s0) + wrapped + draftText.slice(e0);
    setDraftText(next);
    window.setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(s0, s0 + wrapped.length);
    }, 0);
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

      {!editing && (() => {
        // 텍스트 줄 + (Markdown 표) + (붙여넣은 사진)을 세로로 쌓아 박스 안
        // 가운데 정렬 (sizeNodeForText의 높이 계산과 동일한 배치)
        const padX = n.depth === 0 ? 22 : 14;
        const img = n.image ? scaleNodeImage(n.image, n.w, padX) : null;
        const tableGap = mdTable && lines.length > 0 ? 6 : 0;
        const imgGap = img && (lines.length > 0 || mdTable) ? 6 : 0;
        const contentH =
          lines.length * lineHeight +
          (mdTable ? mdTable.h + tableGap : 0) +
          (img ? img.h + imgGap : 0);
        const contentTop = n.y - contentH / 2;
        const imgTop =
          contentTop + lines.length * lineHeight +
          (mdTable ? mdTable.h + tableGap : 0) + imgGap;

        return (
          <g>
            {lines.map((line, i) => {
              const lineCenter = contentTop + i * lineHeight + lineHeight / 2;
              // 인라인 강조(부분 텍스트) — **굵게** *기울임* ~~취소선~~
              // __밑줄__ ==하이라이트== 마커를 구간(tspan)으로 그린다.
              // 마커 문자는 표시에서 제거되고, 노드 전체 강조(스타일 탭)와
              // 결합된다.
              const segs = parseInlineMarks(line);
              const segWs = segs.map((sg) => measureTextApprox(sg.text, fontSize));
              const lineW = segWs.reduce((a, b) => a + b, 0);
              const startX =
                textAlign === 'right'
                  ? textX - lineW
                  : textAlign === 'center'
                    ? textX - lineW / 2
                    : textX;
              // 구간별 시작 x (하이라이트 띠와 tspan이 같은 좌표를 쓴다)
              const segXs: number[] = [];
              let acc = startX;
              for (const w of segWs) { segXs.push(acc); acc += w; }
              return (
                <g key={i}>
                  {segs.map((sg, k) =>
                    (highlight || sg.h) && sg.text.trim() !== '' ? (
                      // 형광펜 — 해당 구간 뒤에 노란 띠
                      <rect
                        key={`h${k}`}
                        x={segXs[k] - 2}
                        y={lineCenter - fontSize * 0.72}
                        width={segWs[k] + 4}
                        height={fontSize * 1.44}
                        rx={2}
                        fill="#FFE066"
                        opacity={0.85}
                      />
                    ) : null,
                  )}
                  <text
                    y={lineCenter + fontSize * 0.34}
                    textAnchor="start"
                    fontSize={fontSize}
                    fill={textColor}
                    style={{ fontFamily }}
                  >
                    {segs.map((sg, k) => {
                      const deco = [
                        strike || sg.s ? 'line-through' : '',
                        sg.u ? 'underline' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <tspan
                          key={k}
                          x={segXs[k]}
                          fontWeight={sg.b ? 700 : fontWeight}
                          fontStyle={sg.i ? 'italic' : fontStyle}
                          style={{ textDecoration: deco || undefined }}
                        >
                          {sg.text}
                        </tspan>
                      );
                    })}
                  </text>
                </g>
              );
            })}

            {mdTable && (() => {
              // Markdown 표 그리기 — 헤더 행 배경 + 격자선 + 셀 텍스트
              const tX = n.x - n.w / 2 + padX;
              const tY = contentTop + lines.length * lineHeight + tableGap;
              const { colWs, rowH, cellFs, headers, rows, w: tW, h: tH } = mdTable;
              const colX: number[] = [];
              let acc = tX;
              for (const cw of colWs) { colX.push(acc); acc += cw; }
              const gridColor = border;
              const allRows = [headers, ...rows];
              return (
                <g>
                  <rect x={tX} y={tY} width={tW} height={rowH}
                        fill={border} opacity={0.16} />
                  <rect x={tX} y={tY} width={tW} height={tH}
                        fill="none" stroke={gridColor} strokeWidth={1} opacity={0.75} />
                  {allRows.slice(1).map((_, r) => (
                    <line key={`h${r}`} x1={tX} y1={tY + (r + 1) * rowH}
                          x2={tX + tW} y2={tY + (r + 1) * rowH}
                          stroke={gridColor} strokeWidth={0.7} opacity={0.55} />
                  ))}
                  {colX.slice(1).map((x, c) => (
                    <line key={`v${c}`} x1={x} y1={tY} x2={x} y2={tY + tH}
                          stroke={gridColor} strokeWidth={0.7} opacity={0.55} />
                  ))}
                  {allRows.map((cells, r) =>
                    cells.map((cell, c) => (
                      <text key={`c${r}-${c}`}
                            x={colX[c] + MD_TABLE_CELL_PAD_X}
                            y={tY + r * rowH + rowH / 2 + cellFs * 0.34}
                            fontSize={cellFs}
                            fontWeight={r === 0 ? 700 : 400}
                            fill={textColor}
                            style={{ fontFamily }}>
                        {cell}
                      </text>
                    )),
                  )}
                </g>
              );
            })()}

            {img && n.image && (
              // 붙여넣은 사진 — 노드 폭에 맞춰 축소, 가운데 정렬
              <g>
                <image
                  href={n.image.src}
                  x={n.x - img.w / 2}
                  y={imgTop}
                  width={img.w}
                  height={img.h}
                  preserveAspectRatio="xMidYMid meet"
                />
                {selected && (
                  // 선택 상태에서 사진 우상단 ✕ = 사진 제거
                  <g
                    transform={`translate(${n.x + img.w / 2 - 9}, ${imgTop + 9})`}
                    style={{ cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setNodeImage(n.id, undefined);
                    }}
                  >
                    <title>사진 제거</title>
                    <circle r={8} fill="#FFFFFF" stroke={t.border} strokeWidth={1}
                            opacity={0.92} />
                    <line x1={-3.2} y1={-3.2} x2={3.2} y2={3.2}
                          stroke="#7A6A50" strokeWidth={1.6} strokeLinecap="round" />
                    <line x1={3.2} y1={-3.2} x2={-3.2} y2={3.2}
                          stroke="#7A6A50" strokeWidth={1.6} strokeLinecap="round" />
                  </g>
                )}
              </g>
            )}
          </g>
        );
      })()}

      {/* 우하단 크기 조절 핸들 — 드래그: 수동 크기, 더블클릭: 자동 크기 복귀.
          (노트 뷰어 창의 모서리 크기 조절과 같은 조작감) */}
      {selected && !editing && (
        <g
          transform={`translate(${n.x + n.w / 2 - 3}, ${n.y + n.h / 2 - 3})`}
          style={{ cursor: 'nwse-resize' }}
          onPointerDown={(e) => {
            e.stopPropagation();
            resizeRef.current = {
              pointerId: e.pointerId,
              x: e.clientX, y: e.clientY,
              w: n.w, h: n.h, moved: false,
            };
            (e.currentTarget as SVGGElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = resizeRef.current;
            if (!d || d.pointerId !== e.pointerId) return;
            const scale = Math.max(0.1, zoom / 100);
            const w = d.w + (e.clientX - d.x) / scale;
            const h = d.h + (e.clientY - d.y) / scale;
            if (!d.moved) {
              // 첫 이동만 undo 히스토리에 기록하고, 드래그 중 연속 갱신은
              // 히스토리를 잠가 1회 드래그 = 1개 undo 단계로 만든다
              d.moved = true;
              updateNodeSize(n.id, { w, h });
              setHistoryPaused(true);
            } else {
              updateNodeSize(n.id, { w, h });
            }
          }}
          onPointerUp={(e) => {
            if (resizeRef.current?.pointerId === e.pointerId) {
              resizeRef.current = null;
              setHistoryPaused(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            updateNodeSize(n.id, null); // 자동 크기로 복귀
          }}
        >
          <title>드래그: 크기 조절 · 더블클릭: 자동 크기</title>
          <rect x={-11} y={-11} width={16} height={16} fill="transparent" />
          <path d="M0,-7 L-7,0 M0,-2.5 L-2.5,0" fill="none"
                stroke={t.primary} strokeWidth={1.8} strokeLinecap="round" />
        </g>
      )}

      {editing && (
        // 부분 강조 미니 툴바 — 편집창에서 텍스트를 선택하고 누르면 해당
        // 구간만 강조된다 (마커로 감싸기: **굵게** *기울임* ~~취소선~~
        // __밑줄__ ==하이라이트==). onMouseDown preventDefault로 편집창의
        // 포커스·선택이 풀리지 않게 유지한다. 단축키: Ctrl+B/I/U.
        <foreignObject
          x={n.x - 92}
          y={n.y - n.h / 2 - 36}
          width={184}
          height={32}
          style={{ overflow: 'visible' }}
        >
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex', gap: 3, justifyContent: 'center',
              background: t.surface, border: `1px solid ${t.border}`,
              borderRadius: 7, padding: '3px 5px',
              boxShadow: '0 3px 10px rgba(80,60,20,0.15)', width: 'fit-content',
              margin: '0 auto',
            }}
          >
            {([
              { m: '**', label: 'B', st: { fontWeight: 700 } },
              { m: '*', label: 'I', st: { fontStyle: 'italic' } },
              { m: '~~', label: 'S', st: { textDecoration: 'line-through' } },
              { m: '__', label: 'U', st: { textDecoration: 'underline' } },
              { m: '==', label: 'H', st: { background: '#FFE066', borderRadius: 2, padding: '0 3px' } },
            ] as const).map((b) => (
              <button
                key={b.label}
                title={`선택 구간에 적용 (${b.m}…${b.m})`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => wrapSelection(b.m)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12, color: t.text, padding: '1px 5px',
                  borderRadius: 4, lineHeight: 1.4,
                }}
              >
                <span style={b.st as React.CSSProperties}>{b.label}</span>
              </button>
            ))}
          </div>
        </foreignObject>
      )}

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
            onPaste={(e) => {
              // 텍스트 편집 중에도 사진 붙여넣기 지원 — 기사 등을 복사해
              // 붙이면 텍스트는 입력창에, 사진은 노드에 함께 들어간다.
              const kind = extractClipboardImage(e.clipboardData, (img) =>
                setNodeImage(n.id, img),
              );
              // 이미지 '파일'만 있을 때는 넣을 텍스트가 없으므로 기본
              // 붙여넣기를 막는다. 웹 복사(html)는 텍스트도 함께 붙인다.
              if (kind === 'file') e.preventDefault();
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            // 선택된 텍스트 위에서 다시 드래그하면 브라우저가 선택 내용을
            // '끌어다 놓기'(드래그 앤 드롭)하려고 고스트 창을 띄운다 —
            // 재선택을 방해하므로 차단한다.
            onDragStart={(e) => e.preventDefault()}
            draggable={false}
            onKeyDown={(e) => {
              // 부분 강조 단축키 — 선택한 텍스트를 마커로 감싼다
              if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                const k = e.key.toLowerCase();
                if (k === 'b') { e.preventDefault(); wrapSelection('**'); return; }
                if (k === 'i') { e.preventDefault(); wrapSelection('*'); return; }
                if (k === 'u') { e.preventDefault(); wrapSelection('__'); return; }
              }
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
              fontFamily,
              textAlign,
              overflow: 'hidden',
              padding: 0,
              margin: 0,
            }}
          />
        </foreignObject>
      )}

      {hasTags && showTags && !editing && (
        <NodeTagChips
          n={n}
          tagList={tagList}
          t={t}
          onRemove={(tag) => removeNodeTag(n.id, tag)}
        />
      )}

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
                style={{ cursor: 'pointer' }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  // 인디케이터를 눌러도 노드 자체는 항상 선택된다 —
                  // 노드 오른쪽(아이콘 영역) 클릭이 무반응이던 문제 방지.
                  onSelect();
                  // 노트(종류별): 그 종류의 노트만 담은 읽기 전용 뷰어
                  // 팝업을 연다 (Canvas의 NoteViewerPopover).
                  if (isNoteKind(ic.kind)) { onOpenPopover?.(n.id, ic.kind); return; }
                  if (ic.count > 1) { onOpenPopover?.(n.id, ic.kind); return; }
                  if (single?.url) window.open(single.url, '_blank', 'noopener');
                }}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <title>{ic.title}</title>
                {isNoteKind(ic.kind) ? (
                  // 노트 종류별 배지 글리프 — 문단 T / 코드 C / 표 ⊞ / 체크 ✓
                  <NoteTypeGlyph kind={ic.kind} size={icSize + 2} />
                ) : ic.kind === 'link' || ic.kind === 'file' ? (
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
