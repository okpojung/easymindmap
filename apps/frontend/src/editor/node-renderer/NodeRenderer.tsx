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
import { useDocumentStore, findNodeInMap } from '@/stores/documentStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { resolveNodeColors, readableTextOn } from './resolveNodeColors';
import { copyTable } from '@/utils/copyTable';
import { NodeTagChips } from './NodeTagChips';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { nodeContentIndicators, isNoteKind, type ContentKind } from './nodeContent';
import { IndicatorGlyph, NoteTypeGlyph } from './IndicatorGlyph';
import {
  layoutInlineImages,
  levelFontFamily,
  levelFontSize,
  levelShape,
  levelTextAlign,
  scaleNodeImage,
} from './sizeNodeForText';
import { layoutMdTable, MD_TABLE_CELL_PAD_X, MD_TABLE_COPY_STRIP } from './mdTable';
import { layoutMdCode, MD_CODE_PAD_X, MD_CODE_PAD_Y } from './mdCode';
import { gridXAttr } from '@/utils/monoGrid';
import {
  parseInlineMarks,
  parseInlineMarksWithState,
  toggleMarkRange,
  isInsideOpenFence,
  CODE_BG,
  CODE_TEXT,
  CODE_FONT,
  type MarkState,
} from './inlineMarks';
import { CodeBlockDialog, spliceCodeBlock, replaceCodeBlock } from './CodeBlockDialog';
import {
  computeNodeChecks,
  checkGlyphW,
  toggleCheckInText,
  toggleCheckMarker,
} from './mdCheck';
import { measureTextPx } from './textMeasure';
import { MarkToolbar } from './MarkToolbar';
import { EditPreviewBackdrop } from './EditPreviewBackdrop';
import { useViewportStore } from '@/stores/viewportStore';
import { setHistoryPaused } from '@/stores/documentStore';
import { extractClipboardImage } from '@/utils/clipboardImage';
import { hasForeignMapMarker, stripForeignMapMarkers } from '@/utils/foreignClipboard';
import { openAttachment } from '@/utils/openAttachment';
import { extractArticleContent, probeArticleImages } from '@/utils/articleContent';

type RenderableNode = LaidOutNode & {
  textAlign?: TextAlign;
};

interface Props {
  n: RenderableNode;
  t: ThemeTokens;
  selected: boolean;
  // 검색 결과로 강조 표시 (노란 채움 + 붉은 테두리)
  searchHit?: boolean;
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

  // 도형 없음 — 아무것도 그리지 않는다. 노드 자체는 그대로라 선택
  // 점선·연결선·＋버튼·접기 칩은 모두 따로 그려지므로 영향이 없다.
  if (shape === 'none') return null;

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

export function NodeRenderer({ n, t, selected, searchHit, dropTarget, onSelect, onHover, onOpenPopover, collabs }: Props) {
  const colors = resolveNodeColors(n, t);
  const updateNodeText = useDocumentStore((state) => state.updateNodeText);
  const removeNodeTag = useDocumentStore((state) => state.removeNodeTag);
  const updateNodeSize = useDocumentStore((state) => state.updateNodeSize);
  const setNodeImage = useDocumentStore((state) => state.setNodeImage);
  const setNodeImages = useDocumentStore((state) => state.setNodeImages);
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
  // 코드 패널 ⧉ 복사 피드백 (1.5s 후 원복)
  const [codeCopied, setCodeCopied] = useState(false);
  // 표 복사(⧉) 피드백 — 코드 패널 '복사됨 ✓'과 동일 (1.5초)
  const [tableCopied, setTableCopied] = useState(false);
  // 코드 블록 팝업 편집기 — insert: 편집 중 커서 위치에 새 블록 삽입,
  // edit: 기존 블록(첫 펜스)을 언어·코드째 교체
  const [codeDlg, setCodeDlg] = useState<
    { mode: 'insert'; cursor: number } | { mode: 'edit' } | null
  >(null);
  // blur 핸들러가 최신 팝업 상태를 보게 하는 미러 — 팝업이 여는 blur로
  // 편집이 커밋돼 버리는 경합 방지
  const codeDlgRef = useRef<boolean>(false);
  useEffect(() => { codeDlgRef.current = !!codeDlg; }, [codeDlg]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 편집 중 라이브 미리보기 레이어 (B6) — 스크롤 동기화용
  const previewRef = useRef<HTMLDivElement | null>(null);
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
  // 도형: 노드별 설정 → 레벨 기본 도형(맵 설정) → 둥근
  const shapeSetting: ShapeType =
    style.shapeType ?? (levelShape(n.depth) as ShapeType | undefined) ?? 'rounded';
  // **검색 결과일 때는 '도형 없음'이어도 박스를 그린다** — 검색 강조가
  // 노란 채움 + 붉은 테두리라, 도형을 안 그리면 강조가 통째로 안 보인다.
  const shape: ShapeType =
    searchHit && shapeSetting === 'none' ? 'rounded' : shapeSetting;
  const noShape = shapeSetting === 'none';

  // 검색 결과 표시 — 어떤 스타일보다 우선해 노란 채움 + 붉은 테두리
  const fill = searchHit ? '#FFE066' : (style.fillColor ?? colors.fill);
  const border = searchHit ? '#DC2626' : (style.borderColor ?? colors.border);
  // 검색 강조(노란 채움) 위에서는 항상 진한 글자 — 다크 모드에서 밝은
  // 글자가 노란 배경에 묻혀 안 보이던 문제 (라이트/다크 공통 고정색)
  // 사용자 지정 색이 있는 노드는 라이트/다크 전환에도 글자색 불변:
  // 글자색 지정 = 그대로, 채움색만 지정 = 채움 밝기에 맞는 고정색.
  // **도형이 없으면 글자가 캔버스 배경 위에 놓인다.** 채움색에서 유도한
  // 색(readableTextOn)이나 도형 위에 맞춘 팔레트 색(colors.text)을 그대로
  // 쓰면 다크 모드에서 배경에 묻힌다 — 테마 본문색이 두 모드 모두 안전하다.
  const textColor = searchHit
    ? '#1F1B16'
    : (style.textColor ??
       (noShape
         ? t.text
         : style.fillColor ? readableTextOn(style.fillColor) : colors.text));

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
  const underline = !!style.underline;
  const highlight = !!style.highlight;

  // 노드 텍스트 속 Markdown 코드 펜스/표 — sizeNodeForText와 같은 측정으로
  // 그린다. (lines에는 코드·표를 제외한 텍스트만 들어 있다 — 리치 노드 P1)
  const mdCode = useMemo(() => layoutMdCode(String(n.text || ''), fontSize), [n.text, fontSize]);
  const mdTable = useMemo(
    () => layoutMdTable(
      mdCode ? [mdCode.before, mdCode.after].filter(Boolean).join('\n') : String(n.text || ''),
      fontSize,
    ),
    [n.text, fontSize, mdCode],
  );
  // 체크리스트 항목(- [x] …) — sizeNodeForText가 마커를 뗀 것과 같은
  // 수동 줄 목록을 재구성해 래핑 줄 범위를 얻는다 (리치 노드 P2)
  const glyphW = checkGlyphW(fontSize);
  const nodeChecks = useMemo(() => {
    const baseText = mdCode
      ? [mdCode.before, mdCode.after].filter(Boolean).join('\n')
      : String(n.text || '');
    const plainText = mdTable
      ? [mdTable.before, mdTable.after].filter(Boolean).join('\n')
      : baseText;
    const manualLines =
      (mdTable || mdCode) && plainText === '' ? [] : plainText.split('\n');
    return computeNodeChecks(
      manualLines,
      n._manualStarts,
      (n._lines || String(n.text || '').split('\n')).length,
    );
  }, [n.text, mdCode, mdTable, n._manualStarts, n._lines]);

  const strokeWidth = searchHit ? 2.6 : (style.borderWidth ?? (isRoot ? 2 : selected ? 1.5 : 1));
  const dash = borderDash(style.borderStyle, strokeWidth);

  // Icon can be shown on any node (not only branches), on the left or right.
  const hasIcon = !!n.icon;
  const iconSide: 'left' | 'right' = n.iconSide ?? 'left';
  const iconX = iconSide === 'right' ? n.x + n.w / 2 - 16 : n.x - n.w / 2 + 12;

  // 정렬: 노드별 설정 → 레벨 기본 맞춤(맵 설정) → 중앙
  const textAlign: TextAlign = n.textAlign ?? levelTextAlign(n.depth) ?? 'center';
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

  // 편집 중 기사 붙여넣기로 들어온 인라인 사진 대기 목록 — 저장 시 반영,
  // 취소 시 폐기 (원문 위치 afterLine 포함)
  const pendingImgsRef = useRef<
    { src: string; w: number; h: number; afterLine: number }[] | null
  >(null);

  const startEdit = () => {
    setDraftText(n.text);
    setEditing(true);
    setEditingNodeId(n.id); // 편집 중 +/− 인디케이터 숨김 (겹침 방지)
    onSelect();
  };

  const saveEdit = () => {
    const nextText = draftText.trimEnd();
    // **빈 텍스트도 그대로 저장한다.** 예전에는 `nextText.trim()` 이 비면
    // 통째로 무시했다 — 전체 선택 후 Del/Ctrl+X 로 지운 뒤 Enter 를 치면
    // 지운 글자가 되살아나, 사용자에게는 "지워지지 않는다"로 보였다
    // (2026-08-05 보고). 노드를 지우려는 게 아니라 **내용을 비우려는**
    // 조작이므로 그대로 반영한다. 노드 자체를 없애려면 Del(선택 상태).
    if (nextText !== n.text) {
      updateNodeText(n.id, nextText);
    }
    // 편집 중 기사 붙여넣기로 쌓인 인라인 사진 — 저장 시 함께 반영
    if (pendingImgsRef.current?.length) {
      setNodeImages(n.id, [...(n.images ?? []), ...pendingImgsRef.current]);
    }
    pendingImgsRef.current = null;
    setEditing(false);
    setEditingNodeId(null);
  };

  const cancelEdit = () => {
    setDraftText(n.text);
    pendingImgsRef.current = null; // 취소 = 붙여넣은 사진도 폐기
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
    // '코드블록' 버튼 — 팝업 편집기에서 언어·코드를 입력받아 삽입
    if (mark === '```') {
      setCodeDlg({ mode: 'insert', cursor: e0 });
      return;
    }
    // '체크박스' 버튼 — 커서 줄에 '- [ ] ' 마커 토글
    if (mark === 'check') {
      const rc = toggleCheckMarker(draftText, e0);
      setDraftText(rc.next);
      window.setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(rc.selStart, rc.selStart);
      }, 0);
      return;
    }
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
        // 텍스트 줄(+중간 인라인 사진) + (Markdown 표) + (레거시 사진)을
        // 세로로 쌓아 박스 안 가운데 정렬 (sizeNodeForText와 동일한 배치)
        const padX = n.depth === 0 ? 22 : 14;
        const manualStarts = n._manualStarts;
        // 텍스트 중간 인라인 사진 — afterLine(논리 줄)을 래핑 줄 자리로
        // 바꿔 각 줄·사진의 세로 위치를 구한다 (뷰어와 같은 규칙)
        const inlineImgs = n.images ?? [];
        const inlineScaled = inlineImgs.map((im) => scaleNodeImage(im, n.w, padX));
        const flow = layoutInlineImages(
          inlineImgs, inlineScaled, lines.length, manualStarts, lineHeight,
        );
        const img = n.image && inlineImgs.length === 0
          ? scaleNodeImage(n.image, n.w, padX)
          : null;
        // 표가 끼어드는 줄 위치 — 표 앞 텍스트는 위, 뒤 텍스트는 아래
        // (sizeNodeForText.mdTableAt과 같은 규칙 — 표 뒤 텍스트가 표
        // 위로 올라가던 문제 수정, 2026-07-31. 코드와 함께면 텍스트 뒤)
        const tableAt = !mdTable
          ? lines.length
          : mdCode
            ? lines.length
            : (() => {
                const beforeCount =
                  mdTable.before === '' ? 0 : mdTable.before.split('\n').length;
                const ms = manualStarts && manualStarts.length ? manualStarts : [0];
                return beforeCount < ms.length ? ms[beforeCount] : lines.length;
              })();
        const tableGapAbove = mdTable && tableAt > 0 ? 6 : 0;
        const tableGapBelow = mdTable && lines.length > tableAt ? 6 : 0;
        const tableBlockH = mdTable
          ? MD_TABLE_COPY_STRIP + mdTable.h + tableGapAbove + tableGapBelow
          : 0;
        // 코드 패널이 끼어드는 줄 위치 — 펜스 앞 텍스트는 위, 뒤는 아래
        // (sizeNodeForText.mdCodeAt과 같은 규칙. 표가 있으면 텍스트 뒤)
        const codeAt = !mdCode
          ? lines.length
          : mdTable
            ? lines.length
            : (() => {
                const beforeCount =
                  mdCode.before === '' ? 0 : mdCode.before.split('\n').length;
                const ms = manualStarts && manualStarts.length ? manualStarts : [0];
                return beforeCount < ms.length ? ms[beforeCount] : lines.length;
              })();
        const codeGapAbove = mdCode && (codeAt > 0 || mdTable) ? 6 : 0;
        const codeGapBelow = mdCode && lines.length > codeAt ? 6 : 0;
        const codeBlockH = mdCode ? mdCode.h + codeGapAbove + codeGapBelow : 0;
        const imgGap = img && (lines.length > 0 || mdTable || mdCode) ? 6 : 0;
        const contentH =
          flow.totalH +
          tableBlockH +
          codeBlockH +
          (img ? img.h + imgGap : 0);
        const contentTop = n.y - contentH / 2;
        // 표 상단: 표가 텍스트 중간이면 그 줄 경계, 끝이면 모든 텍스트 아래
        const tableBoundaryY = tableAt >= lines.length
          ? flow.totalH
          : tableAt > 0
            ? flow.lineTops[tableAt - 1] + lineHeight
            : 0;
        // 표 뒤 줄들이 아래로 밀리는 양
        const tableShift = tableBlockH;
        // 패널 상단: 패널이 텍스트 중간이면 그 줄 경계, 끝이면 표 아래
        const codeBoundaryY = codeAt >= lines.length
          ? flow.totalH + tableBlockH
          : codeAt > 0
            ? flow.lineTops[codeAt - 1] + lineHeight
            : 0;
        const codeTop = contentTop + codeBoundaryY + codeGapAbove;
        // 패널 뒤 줄들이 아래로 밀리는 양
        const codeShift = codeBlockH;
        const imgTop = contentTop + contentH - (img ? img.h : 0);

        // 인라인 마커 상태를 자동 줄바꿈 사이로 이월한다 — 마커 구간이
        // 줄 경계에 걸치면 다음 줄에서 여는 마커로 재해석되어 강조
        // 위치가 밀리던 버그 수정. 수동 줄바꿈(\n) 세그먼트가 시작하는
        // 줄(_manualStarts)에서만 상태를 리셋한다 (기존 줄 단위 규칙 유지).
        let markSt: MarkState | undefined;
        const lineSegs = lines.map((ln, li2) => {
          if (!manualStarts || manualStarts.includes(li2)) markSt = undefined;
          const r = parseInlineMarksWithState(ln, markSt);
          markSt = r.end;
          return r.segs;
        });

        return (
          <g>
            {lines.map((line, i) => {
              // 인라인 사진 밴드만큼 아래로 밀린 줄 위치 (flow.lineTops)
              // + 코드 패널 뒤(codeAt 이후) 줄은 패널 높이만큼 아래로
              const lineCenter =
                contentTop + flow.lineTops[i] +
                (i >= tableAt ? tableShift : 0) +
                (i >= codeAt ? codeShift : 0) + lineHeight / 2;
              // 인라인 강조(부분 텍스트) — **굵게** *기울임* ~~취소선~~
              // __밑줄__ ==하이라이트== 마커를 구간(tspan)으로 그린다.
              // 마커 문자는 표시에서 제거되고, 노드 전체 강조(스타일 탭)와
              // 결합된다. (구간은 위 lineSegs — 줄 간 상태 이월 반영)
              const segs = lineSegs[i];
              // 표시 좌표는 근사 폭이 아니라 캔버스 실측 폭 — 근사로 놓으면
              // 인접 구간(tspan)의 x가 실제 렌더 폭과 어긋나 글자가 겹친다.
              const segWs = segs.map((sg) =>
                measureTextPx(sg.text, fontSize, {
                  weight: sg.b ? 700 : fontWeight,
                  italic: sg.i || fontStyle === 'italic',
                  family: sg.c ? CODE_FONT : fontFamily,
                }),
              );
              // 체크리스트 항목(- [x] …) — 이 줄이 속한 항목과 글리프 폭
              // (마커는 sizeNodeForText가 떼었고, 항목의 모든 줄이 글리프
              // 폭만큼 들여쓰기된다. 첫 줄에만 체크박스를 그린다)
              const chkHere = nodeChecks.find((c) => i >= c.at && i < c.end);
              const chkW = chkHere ? glyphW : 0;
              const lineW = segWs.reduce((a, b) => a + b, 0) + chkW;
              const startX =
                textAlign === 'right'
                  ? textX - lineW
                  : textAlign === 'center'
                    ? textX - lineW / 2
                    : textX;
              // 구간별 시작 x (하이라이트 띠와 tspan이 같은 좌표를 쓴다)
              const segXs: number[] = [];
              let acc = startX + chkW;
              for (const w of segWs) { segXs.push(acc); acc += w; }
              return (
                <g key={i}>
                  {chkHere && i === chkHere.at && (() => {
                    // 체크박스 글리프 — 클릭 = 원문 [ ]/[x] 토글
                    const s = Math.round(fontSize * 0.95);
                    const bx = startX;
                    const by = lineCenter - s / 2;
                    return (
                      <g
                        data-node-check
                        data-checked={chkHere.checked ? '1' : '0'}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateNodeText(
                            n.id,
                            toggleCheckInText(String(n.text || ''), chkHere.seq),
                          );
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <title>
                          {chkHere.checked ? '클릭하면 미완료([ ])로' : '클릭하면 완료([x])로'}
                        </title>
                        <rect
                          x={bx} y={by} width={s} height={s} rx={3}
                          fill={chkHere.checked ? '#22A06B' : 'rgba(0,0,0,0.001)'}
                          stroke={chkHere.checked ? '#22A06B' : '#8B94A3'}
                          strokeWidth={1.5}
                        />
                        {chkHere.checked && (
                          <path
                            d={`M ${bx + s * 0.24} ${by + s * 0.54} L ${bx + s * 0.44} ${by + s * 0.72} L ${bx + s * 0.78} ${by + s * 0.3}`}
                            fill="none" stroke="#fff" strokeWidth={1.8}
                            strokeLinecap="round" strokeLinejoin="round"
                          />
                        )}
                      </g>
                    );
                  })()}
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
                      />
                    ) : sg.c && sg.text.trim() !== '' ? (
                      // 인라인 코드 — 회색 배경 띠 (모노스페이스와 세트)
                      <rect
                        key={`c${k}`}
                        x={segXs[k] - 2}
                        y={lineCenter - fontSize * 0.72}
                        width={segWs[k] + 4}
                        height={fontSize * 1.44}
                        rx={3}
                        fill={CODE_BG}
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
                        underline || sg.u ? 'underline' : '',
                      ].filter(Boolean).join(' ');
                      // 형광펜(노란 띠) 위 글자는 진한 고정색 — 다크
                      // 모드에서 밝은 글자가 노란 배경에 묻혀 안 보이던
                      // 문제 (검색 강조와 동일 규칙). 단, 사용자가
                      // 글자색을 직접 지정했으면 그 색이 우선한다 —
                      // 하이라이트 노드에서 지정 글자색이 무시되던 버그.
                      // 띠가 없는 구간은 노드 글자색(textColor) 상속.
                      const onHighlight = highlight || sg.h;
                      const hlColor = style.textColor ?? '#1F1B16';
                      return (
                        <tspan
                          key={k}
                          x={segXs[k]}
                          fontWeight={sg.b ? 700 : fontWeight}
                          fontStyle={sg.i ? 'italic' : fontStyle}
                          fill={onHighlight ? hlColor : sg.c ? CODE_TEXT : undefined}
                          style={{
                            textDecoration: deco || undefined,
                            fontFamily: sg.c ? CODE_FONT : undefined,
                          }}
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
              // (원문 위치: 표 앞 텍스트 아래, 표 뒤 텍스트 위)
              const tX = n.x - n.w / 2 + padX;
              // 블록 맨 위 = 복사(⧉) 스트립, 격자는 그 아래 — 아이콘이
              // 머리글 셀 내용과 겹치지 않는다 (2026-07-31)
              const stripY = contentTop + tableBoundaryY + tableGapAbove;
              const tY = stripY + MD_TABLE_COPY_STRIP;
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
                  {/* 표 복사 (⧉) — 표 바깥 오른쪽 위 스트립 (내용과 겹치지
                      않음). 엑셀(TSV)·웹 에디터(HTML 표) 두 형식 동시 복사 */}
                  <g
                    data-node-table-copy
                    transform={`translate(${tX + tW}, ${stripY + MD_TABLE_COPY_STRIP / 2})`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyTable(headers, rows).then(() => {
                        setTableCopied(true);
                        window.setTimeout(() => setTableCopied(false), 1500);
                      });
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                  >
                    <title>표 복사 — 엑셀·웹 편집기에 붙여넣을 수 있습니다</title>
                    <rect
                      x={-(tableCopied ? cellFs * 4.6 : cellFs * 2.2)}
                      y={-MD_TABLE_COPY_STRIP / 2}
                      width={tableCopied ? cellFs * 4.6 : cellFs * 2.2}
                      height={MD_TABLE_COPY_STRIP}
                      fill="transparent"
                    />
                    <text
                      textAnchor="end"
                      y={cellFs * 0.34}
                      fontSize={Math.max(8, cellFs - 1)}
                      fontWeight={700}
                      fill={tableCopied ? '#15803D' : '#475569'}
                    >
                      {tableCopied ? '복사됨 ✓' : '⧉'}
                    </text>
                  </g>
                  {allRows.map((cells, r) =>
                    cells.map((cell, c) => {
                      // 셀 안 인라인 마커(**굵게** 등) — 마커 문자는 숨기고
                      // 서식만 적용 (tspan 구간, 실측 오프셋)
                      const cSegs = parseInlineMarks(cell);
                      let cx2 = colX[c] + MD_TABLE_CELL_PAD_X;
                      return (
                        <text key={`c${r}-${c}`}
                              y={tY + r * rowH + rowH / 2 + cellFs * 0.34}
                              fontSize={cellFs}
                              fill={textColor}
                              style={{ fontFamily }}>
                          {cSegs.map((sg, k) => {
                            const x2 = cx2;
                            cx2 += measureTextPx(sg.text, cellFs, {
                              weight: r === 0 || sg.b ? 700 : 400,
                              italic: sg.i,
                              family: fontFamily,
                            });
                            const deco = [
                              sg.s ? 'line-through' : '',
                              sg.u ? 'underline' : '',
                            ].filter(Boolean).join(' ');
                            return (
                              <tspan key={k} x={x2}
                                     fontWeight={r === 0 || sg.b ? 700 : 400}
                                     fontStyle={sg.i ? 'italic' : 'normal'}
                                     style={{ textDecoration: deco || undefined }}>
                                {sg.text}
                              </tspan>
                            );
                          })}
                        </text>
                      );
                    }),
                  )}
                </g>
              );
            })()}

            {mdCode && (() => {
              // 노드 속 코드 블록 — 노트 코드와 같은 구성: 헤더(언어 라벨 +
              // ⧉ 복사) + 모노스페이스 코드 줄. 인라인 마크·자동 줄바꿈 없음.
              const cX = n.x - mdCode.w / 2;
              const headFs = Math.max(9, mdCode.codeFs - 2);
              const headBase = codeTop + mdCode.headH / 2 + headFs * 0.34;
              const bodyTop = codeTop + mdCode.headH;
              return (
                <g
                  data-node-code
                  onDoubleClick={(e) => {
                    // 패널 더블클릭 = 팝업 편집기 (노드 텍스트 편집 대신)
                    e.stopPropagation();
                    setCodeDlg({ mode: 'edit' });
                  }}
                >
                  <title>더블클릭하면 팝업에서 언어·코드를 편집합니다</title>
                  <rect
                    x={cX}
                    y={codeTop}
                    width={mdCode.w}
                    height={mdCode.h}
                    rx={5}
                    fill={CODE_BG}
                    stroke="#D8DDE4"
                    strokeWidth={1}
                  />
                  {/* 헤더 구분선 */}
                  <line
                    x1={cX} x2={cX + mdCode.w}
                    y1={codeTop + mdCode.headH} y2={codeTop + mdCode.headH}
                    stroke="#D8DDE4" strokeWidth={1}
                  />
                  {/* 언어 라벨 — 클릭하면 팝업 편집기 (언어·코드 함께 수정) */}
                  <text
                    data-code-lang
                    x={cX + MD_CODE_PAD_X}
                    y={headBase}
                    textAnchor="start"
                    fontSize={headFs}
                    fill="#64748B"
                    style={{ fontFamily: CODE_FONT, cursor: 'pointer', userSelect: 'none' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCodeDlg({ mode: 'edit' });
                    }}
                  >
                    {(mdCode.lang || 'code') + ' ✎'}
                  </text>
                  {/* ⧉ 복사 버튼 — 클릭 시 코드 원문 복사 */}
                  <text
                    data-code-copy
                    x={cX + mdCode.w - MD_CODE_PAD_X}
                    y={headBase}
                    textAnchor="end"
                    fontSize={headFs}
                    fill={codeCopied ? '#15803D' : '#475569'}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const textToCopy = mdCode.code.join('\n');
                      const done = () => {
                        setCodeCopied(true);
                        window.setTimeout(() => setCodeCopied(false), 1500);
                      };
                      if (navigator.clipboard?.writeText) {
                        navigator.clipboard.writeText(textToCopy).then(done, done);
                      } else done();
                    }}
                  >
                    <title>코드 복사</title>
                    {codeCopied ? '복사됨 ✓' : '⧉'}
                  </text>
                  {mdCode.code.map((ln, ci) => {
                    // \uAE00\uC790\uB9C8\uB2E4 x \uB97C \uC9C1\uC811 \uC9C0\uC815\uD574 **\uACA9\uC790\uC5D0 \uC549\uD78C\uB2E4** \u2014 \uD3F0\uD2B8\uAC00
                    // \uBB34\uC5C7\uC774\uB4E0(\uD55C\uAE00 \uD3F4\uBC31\uC774 \uBB34\uC5C7\uC774\uB4E0) \uCE78\uC774 \uBC00\uB9AC\uC9C0 \uC54A\uC544
                    // \uC0C1\uC790 \uB3C4\uC2DD\uC774 \uADF8\uB300\uB85C \uC720\uC9C0\uB41C\uB2E4 (2026-08-05, monoGrid).
                    const line = ln.replace(/ /g, '\u00A0'); // \uACF5\uBC31 \uCD95\uC57D \uBC29\uC9C0
                    return (
                      <text
                        key={ci}
                        x={gridXAttr(line, mdCode.codeFs, cX + MD_CODE_PAD_X)}
                        y={bodyTop + MD_CODE_PAD_Y + ci * mdCode.lineH +
                          mdCode.lineH / 2 + mdCode.codeFs * 0.34}
                        textAnchor="start"
                        fontSize={mdCode.codeFs}
                        fill={CODE_TEXT}
                        style={{ fontFamily: CODE_FONT, whiteSpace: 'pre' }}
                      >
                        {line}
                      </text>
                    );
                  })}
                </g>
              );
            })()}

            {flow.bands.map((band) => {
              // 텍스트 중간 인라인 사진 — 원문 위치(afterLine)의 밴드에
              const sc = inlineScaled[band.idx];
              const im = inlineImgs[band.idx];
              const top = contentTop + band.top;
              return (
                <g key={`inimg${band.idx}`}>
                  <image
                    href={im.src}
                    x={n.x - sc.w / 2}
                    y={top}
                    width={sc.w}
                    height={sc.h}
                    preserveAspectRatio="xMidYMid meet"
                  />
                  {selected && (
                    // 선택 상태에서 사진 우상단 ✕ = 그 사진만 제거
                    <g
                      transform={`translate(${n.x + sc.w / 2 - 9}, ${top + 9})`}
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNodeImages(
                          n.id,
                          inlineImgs.filter((_, k) => k !== band.idx),
                        );
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
              );
            })}

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

          {/* 라이브 미리보기 (B6) — textarea 글자는 투명(캐럿만), 뒤의
              같은 메트릭 레이어가 마커 흐림·형광 띠·코드 띠·가짜 굵게를
              즉시 보여준다. 폭이 변하는 스타일은 금지 (캐럿 정렬). */}
          <EditPreviewBackdrop
            ref={previewRef}
            text={draftText}
            hlTextColor={style.textColor ?? '#1F1B16'}
            style={{
              position: 'absolute',
              inset: 0,
              boxSizing: 'border-box',
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
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onScroll={(e) => {
              // 내용이 박스를 넘쳐 내부 스크롤될 때 미리보기 레이어 동기화
              const ta2 = e.currentTarget;
              const pv = previewRef.current;
              if (pv) { pv.scrollTop = ta2.scrollTop; pv.scrollLeft = ta2.scrollLeft; }
            }}
            onPaste={(e) => {
              // 텍스트 편집 중 붙여넣기도 "모두 노드에" — 기사(text/html에
              // 사진 포함)는 텍스트를 커서 위치에 넣고 사진은 **원문 위치
              // (afterLine)째** 인라인 사진으로 쌓아 두었다가 저장(Enter) 시
              // 반영한다 (Esc 취소 시 폐기). 사진 없는 붙여넣기는 브라우저
              // 기본 동작(텍스트 삽입), 이미지 파일은 노드 사진.
              // 다른 마인드맵 앱의 자기 앱 표시('[--iThinkWise--]')는
              // 편집 중 붙여넣기에서도 걷어낸다 (2026-08-05 보고)
              const rawPlain = e.clipboardData?.getData('text/plain') ?? '';
              if (hasForeignMapMarker(rawPlain)) {
                e.preventDefault();
                const ta2 = e.currentTarget;
                const s0 = ta2.selectionStart ?? draftText.length;
                const e0 = ta2.selectionEnd ?? s0;
                const clean = stripForeignMapMarkers(rawPlain.replace(/\r\n?/g, '\n'));
                setDraftText(draftText.slice(0, s0) + clean + draftText.slice(e0));
                return;
              }
              const rawHtml = e.clipboardData?.getData('text/html');
              if (rawHtml) {
                const art = extractArticleContent(rawHtml);
                // 표만 있는 리치 붙여넣기(그룹웨어 등) — 파이프 MD 표로
                // 변환된 art.text를 커서 위치에 삽입 (사진 경로와 분리 —
                // 사진 대기 목록을 건드리지 않는다)
                if (!art.images.length && /<table[\s>]/i.test(rawHtml) && art.text) {
                  e.preventDefault();
                  const ta2 = e.currentTarget;
                  const s0 = ta2.selectionStart ?? draftText.length;
                  const e0 = ta2.selectionEnd ?? s0;
                  setDraftText(draftText.slice(0, s0) + art.text + draftText.slice(e0));
                  return;
                }
                if (art.images.length) {
                  e.preventDefault();
                  const ta2 = e.currentTarget;
                  const s0 = ta2.selectionStart ?? draftText.length;
                  const e0 = ta2.selectionEnd ?? s0;
                  const before = draftText.slice(0, s0);
                  const after = draftText.slice(e0);
                  // 붙는 지점 앞의 논리 줄 수 — 사진 앵커를 그만큼 이동
                  const base = before.split('\n').length - 1;
                  setDraftText(before + art.text + after);
                  const withBase = (
                    imgs: { src: string; w: number; h: number; afterLine: number }[],
                  ) => imgs.map((im) => ({ ...im, afterLine: im.afterLine + base }));
                  let initialMapped:
                    { src: string; w: number; h: number; afterLine: number }[] = [];
                  const initial = probeArticleImages(art.images, (resolved) => {
                    // 내장(다운로드)·실측 완료 — 아직 편집 중이면 대기 목록
                    // 갱신, 이미 저장됐으면 노드의 해당 사진을 교체.
                    // (내장되면 src가 data URL로 바뀌므로 원래 URL 목록
                    // initialMapped와 짝을 맞춰 찾는다)
                    const mapped = withBase(resolved);
                    if (pendingImgsRef.current) {
                      // 같은 편집 중 이전 붙여넣기분은 보존하고 이번 것만 교체
                      pendingImgsRef.current = pendingImgsRef.current.map((ci) => {
                        const idx = initialMapped.findIndex(
                          (mm) => mm.src === ci.src && mm.afterLine === ci.afterLine,
                        );
                        return idx >= 0 ? mapped[idx] : ci;
                      });
                      return;
                    }
                    const cur = findNodeInMap(
                      useDocumentStore.getState().map, n.id,
                    )?.images;
                    if (!cur) return;
                    setNodeImages(n.id, cur.map((ci) => {
                      const idx = initialMapped.findIndex(
                        (mm) => mm.src === ci.src && mm.afterLine === ci.afterLine,
                      );
                      return idx >= 0 ? mapped[idx] : ci;
                    }));
                  });
                  initialMapped = withBase(initial);
                  pendingImgsRef.current = [
                    ...(pendingImgsRef.current ?? []),
                    ...initialMapped,
                  ];
                  return;
                }
              }
              // 사진 없는 웹 콘텐츠 → 기본 텍스트 삽입 / 이미지 파일 → 노드 사진
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
                // 스마트 Enter — 열린(닫히지 않은) 코드 펜스 안에서는
                // 커밋이 아니라 줄바꿈 (여러 줄 코드를 타이핑으로 입력 가능)
                const ta2 = e.currentTarget;
                if (isInsideOpenFence(draftText, ta2.selectionStart ?? draftText.length)) {
                  return; // 기본 동작(줄바꿈) 허용
                }
                e.preventDefault();
                saveEdit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelEdit();
              }
            }}
            onBlur={() => {
              // 코드 블록 팝업이 열리며 생기는 blur는 커밋이 아니다 —
              // 팝업을 닫으면 편집으로 돌아온다 (삽입 흐름 유지)
              if (codeDlgRef.current) return;
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
              // 글자는 미리보기 레이어가 그린다 — textarea는 캐럿·선택만
              color: 'transparent',
              caretColor: textColor,
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
                data-node-ind={ic.kind}
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
                  // 링크는 외부 URL 그대로. 첨부(파일/미디어)는 반드시
                  // openAttachment 로 — 서버 첨부 저장소(B9)의 URL 은 인증
                  // 토큰을 붙여야 열린다 (2026-08-03 dev 보고: 단수 첨부
                  // 클릭만 window.open 직행이라 401 로 조회가 안 됐다.
                  // 복수는 ChooserPopover→openAttachment 라 정상이었다).
                  if (ic.kind === 'link') {
                    if (single?.url) window.open(single.url, '_blank', 'noopener');
                    return;
                  }
                  if (single) openAttachment(single.label, single.url);
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

      {/* 코드 블록 팝업 편집기 — { } 버튼(삽입) / 패널 더블클릭·언어 라벨(수정) */}
      {codeDlg && (
        <CodeBlockDialog
          t={t}
          initialLang={codeDlg.mode === 'edit' ? mdCode?.lang : undefined}
          initialCode={codeDlg.mode === 'edit' ? mdCode?.code.join('\n') : undefined}
          onCancel={() => {
            setCodeDlg(null);
            if (editing) window.setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          onSave={(lang, code) => {
            if (codeDlg.mode === 'insert') {
              // 편집 중 커서 위치에 새 블록 삽입 — 편집은 계속
              const next = spliceCodeBlock(draftText, codeDlg.cursor, lang, code);
              setDraftText(next);
              window.setTimeout(() => textareaRef.current?.focus(), 0);
            } else {
              // 기존 블록(첫 펜스)을 통째로 교체하고 바로 저장
              updateNodeText(n.id, replaceCodeBlock(String(n.text || ''), lang, code));
            }
            setCodeDlg(null);
          }}
        />
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
