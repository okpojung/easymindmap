// NodeRenderer — renders a single node as an SVG <g> group.
// Includes: selection glow, drop-target highlight, soft-lock border, body shape
// (7 shapeType variants), branch icon, wrapped text, tag chips (via
// NodeTagChips), content indicators (note / link / attachment), collapse toggle,
// inline text edit, soft-lock editor label.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { layoutMdTable, MD_TABLE_CELL_PAD_X } from './mdTable';
import { parseInlineMarks, toggleMarkRange } from './inlineMarks';
import { measureTextPx } from './textMeasure';
import { MarkToolbar } from './MarkToolbar';
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
  if (shape === 'arrow-left') {
    // ◀ 왼쪽 화살표 — 촉이 왼쪽 중앙, 몸통은 오른쪽
    const a = Math.min(26, n.w * 0.24);
    return (
      <polygon
        points={`${x0},${n.y} ${x0 + a},${y0} ${x1},${y0} ${x1},${y1} ${x0 + a},${y1}`}
        {...common}
      />
    );
  }
  if (shape === 'arrow-right') {
    // ▶ 오른쪽 화살표 — 촉이 오른쪽 중앙
    const a = Math.min(26, n.w * 0.24);
    return (
      <polygon
        points={`${x1},${n.y} ${x1 - a},${y1} ${x0},${y1} ${x0},${y0} ${x1 - a},${y0}`}
        {...common}
      />
    );
  }
  if (shape === 'cylinder') {
    // ⛁ 원통 — 위 뚜껑 타원 + 몸통 + 아래 볼록 바닥
    const ry = Math.min(9, n.h * 0.18);
    return (
      <g>
        <path
          d={`M ${x0} ${y0 + ry} V ${y1 - ry} A ${n.w / 2} ${ry} 0 0 0 ${x1} ${y1 - ry} V ${y0 + ry}`}
          {...common}
        />
        <ellipse cx={n.x} cy={y0 + ry} rx={n.w / 2} ry={ry} {...common} />
      </g>
    );
  }
  if (shape === 'star') {
    // ★ 5각 별 — 박스에 맞춰 늘린 별 (텍스트는 중앙)
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const k = i % 2 === 0 ? 1 : 0.45;
      pts.push(`${n.x + Math.cos(ang) * (n.w / 2) * k},${n.y + Math.sin(ang) * (n.h / 2) * k}`);
    }
    return <polygon points={pts.join(' ')} {...common} />;
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
  // 편집 오버레이 위치 측정용 — 노드 박스와 정확히 일치하는 투명 rect
  const boxRef = useRef<SVGRectElement | null>(null);
  // 편집창은 SVG(foreignObject) 안이 아니라 문서 최상위 HTML 오버레이로
  // 띄운다 — 변환(줌/팬)이 걸린 foreignObject 안 textarea는 Chromium이
  // 선택 좌표를 잘못 계산해 선택이 SVG 문서로 새고(주황 하이라이트),
  // 드래그 선택이 끊기는 버그가 있다. HTML 오버레이에서는 네이티브
  // 선택이 완벽하게 동작한다.
  const [ovr, setOvr] = useState<{
    left: number; top: number; width: number; height: number; k: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!editing) { setOvr(null); return; }
    const measure = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r && r.width > 0) {
        setOvr({ left: r.left, top: r.top, width: r.width, height: r.height, k: r.width / n.w });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('wheel', measure, true); // 편집 중 줌/팬 대응
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('wheel', measure, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, n.x, n.y, n.w, n.h]);

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
  // 중앙 정렬은 박스 중앙이 아니라 "텍스트가 실제로 쓸 수 있는 띠"
  // (왼쪽 아이콘 영역과 오른쪽 인디케이터 영역을 뺀 구간)의 중앙에 놓는다
  // — 박스 중앙 기준으로 두면 긴 줄이 아이콘/인디케이터와 겹친다.
  const indicatorReserve = contentIcons.length > 0
    ? contentIcons.length * (fontSize + 5) + 4
    : 0;
  const iconLeftPad = hasIcon && iconSide === 'left' ? (n.depth === 1 ? 22 : 20) : 0;
  const iconRightPad = hasIcon && iconSide === 'right' ? 22 : 0;
  const textX =
    textAlign === 'right'
      ? n.x + n.w / 2 - 14 - indicatorReserve - iconRightPad
      : textAlign === 'center'
        ? n.x + (iconLeftPad - iconRightPad - indicatorReserve) / 2
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

  // 편집 중 선택한 텍스트에 인라인 마커 토글 (부분 강조 — 미니 툴바/
  // Ctrl+B·I·U). 이미 그 마커가 적용돼 있으면 해제한다. inlineMarks.ts 참조.
  const wrapSelection = (mark: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const s0 = ta.selectionStart ?? 0;
    const e0 = ta.selectionEnd ?? s0;
    const r = toggleMarkRange(draftText, s0, e0, mark);
    setDraftText(r.next);
    window.setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(r.selStart, r.selEnd);
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
      {/* 이중선 테두리 — 같은 도형을 살짝 안쪽에 한 번 더 그린다 (SVG는
          CSS double stroke가 없으므로 도형 이중 렌더로 구현) */}
      {style.borderStyle === 'double' && (
        <NodeShape
          shape={shape}
          n={{ ...n, w: Math.max(10, n.w - 9), h: Math.max(8, n.h - 9) }}
          fill="none"
          stroke={border}
          strokeWidth={Math.max(1, strokeWidth * 0.85)}
        />
      )}
      {/* 편집 오버레이 위치 측정용 투명 rect (노드 박스와 동일 좌표) */}
      <rect ref={boxRef} x={n.x - n.w / 2} y={n.y - n.h / 2}
            width={n.w} height={n.h} fill="none" pointerEvents="none" />

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
              // 표시 좌표는 근사 폭이 아니라 캔버스 실측 폭 — 근사로 놓으면
              // 인접 구간(tspan)의 x가 실제 렌더 폭과 어긋나 글자가 겹친다.
              const segWs = segs.map((sg) =>
                measureTextPx(sg.text, fontSize, {
                  weight: sg.b ? 700 : fontWeight,
                  italic: sg.i || fontStyle === 'italic',
                  family: fontFamily,
                }),
              );
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

      {editing && ovr && createPortal(
        // ── 노드 텍스트 편집 오버레이 (SVG 밖 HTML) ──
        // foreignObject 안 textarea는 줌/팬 변환 때문에 Chromium이 선택
        // 좌표를 잘못 계산해 선택이 새는 버그가 있어, 노드의 화면 좌표를
        // 재서 문서 최상위에 HTML로 띄운다. 선택·드래그가 네이티브로
        // 완벽하게 동작한다. 크기·글자는 현재 줌 배율(k)로 스케일.
        <div
          style={{
            position: 'fixed',
            left: ovr.left,
            top: ovr.top,
            width: ovr.width,
            height: ovr.height,
            zIndex: 1000,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* 부분 강조 툴바 (공용 MarkToolbar) — 선택 구간에 마커 토글 */}
          <MarkToolbar
            t={t}
            onApply={wrapSelection}
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              top: -46,
            }}
          />

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
              if (kind === 'file') e.preventDefault();
            }}
            onMouseDown={(e) => {
              // 기존 선택 위를 누르면 브라우저가 '선택 끌기'를 준비하느라
              // 새 드래그 선택이 시작되지 않는다(끌기는 차단됨 → 선택 붕괴).
              // Shift+클릭(선택 확장)이 아니면 누르는 순간 선택을 접어
              // 항상 새로 드래그 선택이 되게 한다.
              const ta2 = e.currentTarget as HTMLTextAreaElement;
              if (!e.shiftKey && ta2.selectionStart !== ta2.selectionEnd) {
                ta2.setSelectionRange(ta2.selectionStart, ta2.selectionStart);
              }
            }}
            onDragStart={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              // 부분 강조 단축키 — 선택한 텍스트를 마커로 감싼다
              if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                const k2 = e.key.toLowerCase();
                if (k2 === 'b') { e.preventDefault(); wrapSelection('**'); return; }
                if (k2 === 'i') { e.preventDefault(); wrapSelection('*'); return; }
                if (k2 === 'u') { e.preventDefault(); wrapSelection('__'); return; }
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
              position: 'absolute',
              inset: 0,
              boxSizing: 'border-box',
              width: '100%',
              height: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: 'transparent',
              color: textColor,
              fontSize: fontSize * ovr.k,
              fontWeight,
              fontStyle,
              lineHeight: `${lineHeight * ovr.k}px`,
              fontFamily,
              textAlign,
              overflow: 'hidden',
              padding: `${6 * ovr.k}px ${8 * ovr.k}px`,
              margin: 0,
            }}
          />
        </div>,
        document.body,
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
