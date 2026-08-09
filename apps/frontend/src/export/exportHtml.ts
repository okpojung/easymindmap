// File: src/export/exportHtml.ts
// Version: MVP-ExportHtml-LayoutPreserving-v2.0.0
// Spec: docs/04-extensions/import-export/20-export.md — EXPORT-02 (Standalone HTML)
// Description:
// - Builds a SINGLE self-contained .html file for the current map:
//   no external CDN, all CSS/JS inlined, works offline (spec § Standalone
//   HTML 요건).
// - LAYOUT-PRESERVING: the embedded viewer arranges every node by its
//   EFFECTIVE layoutType (own override, else inherited — same rule as
//   SubtreeStrategy), so the exported file reproduces the editor's map
//   layout AND per-node subtree overrides:
//   · radial-bidirectional / radial-right / radial-left  (curved edges)
//   · tree-right (indented outline), tree-down (rows below)
//   · hierarchy-right (right column, first child on the parent's row)
//   · process-tree-right (left-anchored rows below, elbow connectors)
//   · freeform / kanban fall back to radial-right (viewer is a mindmap view)
// - READ-ONLY interactive viewer (spec § 뷰어 기능 목록): wheel zoom at the
//   cursor, drag pan, Fit, expand/collapse per node + all, tag badges,
//   links, note panel. Collapsed nodes export with their saved state.
// - The map data is embedded as JSON; '<' is escaped so closing tags inside
//   node text can never break out of the <script> block.

import type { LayoutType, MindNode, NodeAttachment, SampleMap } from '@/editor/__samples__/types';
import brandLogoRaw from '@/assets/brand-logo.svg?raw';
import { computeLayout, type LayoutSpacing } from '@/layout/LayoutEngine';
import {
  setLevelFontConfig, setLevelShapeConfig,
  levelFontFamily, levelTextAlign, levelShape,
} from '@/editor/node-renderer/sizeNodeForText';
import { parseMdCode as parseMdCodeEditor } from '@/editor/node-renderer/mdCode';
import { parseMdTable as parseMdTableEditor } from '@/editor/node-renderer/mdTable';
import { computeNodeChecks } from '@/editor/node-renderer/mdCheck';
import { buildZip, type ZipEntry } from './zip';
import { attachmentFetchUrl } from '@/services/cloud/apiClient';
import {
  buildMapMeta,
  bytesToDataUrl,
  withInlinedAttachments,
  INLINE_ATTACHMENT_LIMIT,
} from './mapMeta';

// 에디터가 계산한 노드의 최종 배치 좌표 — 뷰어는 이 좌표를 그대로 사용해
// 에디터 화면과 100% 동일한 레이아웃을 재현한다 (자체 레이아웃은 좌표가
// 없을 때의 폴백). 접기/펴기는 표시/숨김만 하고 재배치하지 않는다.
interface ExportPos {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  // 수동 줄바꿈 세그먼트 시작 인덱스 — 인라인 마커 이월 리셋 지점
  ms?: number[];
  fs: number;
  lh: number;
  // 맵 설정(레벨별 폰트)의 글꼴 — 없으면 뷰어 기본 글꼴
  ff?: string;
  // 체크리스트 항목(- [x] …) — 래핑 줄 범위 a..e(exclusive)와 체크 여부.
  // 에디터가 계산한 값을 그대로 실어 뷰어가 같은 자리에 글리프를 그린다
  // (뷰어는 읽기 전용 — 리치 노드 P2)
  ck?: { a: number; e: number; c: number }[];
}

interface ExportAttachment {
  name: string;
  // 'files/…' relative path when packaged into the zip next to the HTML,
  // or the original absolute URL when it couldn't be fetched (external).
  href?: string;
  kind: string;
  external?: boolean;
}

interface ExportNode {
  id: string;
  text: string;
  icon?: string;
  tags?: string[];
  links?: { url: string; label?: string }[];
  // id — 뷰어에서 체크리스트를 눌렀을 때 "어느 블록인지" 가리는 열쇠
  notes?: {
    id?: string; type: string; text: string;
    checked?: boolean; lang?: string; html?: string;
  }[];
  attachments?: ExportAttachment[];
  collapsed?: boolean;
  colorKey?: string;
  // 텍스트 강조·정렬 (에디터 스타일 탭과 동일하게 표시)
  textAlign?: string;
  style?: {
    strike?: boolean; underline?: boolean; highlight?: boolean;
    // 노드별 지정 색 — 뷰어가 팔레트보다 우선 적용
    fillColor?: string; borderColor?: string; textColor?: string;
    // 실효 도형 — 노드별 지정이 없으면 맵 설정의 레벨 기본 도형.
    // 뷰어는 'none'(도형 없음)만 구분해 사각형을 생략한다
    shapeType?: string;
  };
  // 노드 안 사진 (data URL 또는 원본 URL) — 노드 폭에 맞춰 축소 표시
  image?: { src: string; w: number; h: number };
  // 텍스트 중간 인라인 사진 — afterLine(논리 줄 기준 위치)째 원문 자리에
  images?: { src: string; w: number; h: number; afterLine: number }[];
  // Layout preservation: per-node subtree override + radial side.
  layoutType?: string;
  side?: string;
  pos?: ExportPos; // 에디터 계산 좌표 (있으면 뷰어가 그대로 사용)
  children?: ExportNode[];
}

type PosResolver = (nodeId: string) => ExportPos | undefined;
// 레이아웃 엔진이 계산한 유효 side (자식이 자라는 방향) — 노드에 저장된
// side(방사형의 left/right)가 아니라 현재 레이아웃 기준이어야 뷰어의
// 접기 토글이 에디터와 같은 자리에 놓인다.
type SideResolver = (nodeId: string) => string | undefined;

// Maps attachment id → packaged relative href ('files/…'). Attachments not in
// the map keep their original URL and are marked external.
type AttachmentHrefResolver = (attachmentId: string) => string | undefined;

function toExportNode(
  node: MindNode,
  resolveHref?: AttachmentHrefResolver,
  resolvePos?: PosResolver,
  resolveSide?: SideResolver,
  depth = 0,
): ExportNode {
  const tags =
    Array.isArray(node.tags) && node.tags.length > 0
      ? node.tags
      : node.tag
        ? [node.tag]
        : undefined;

  // 실효 도형을 굽는다 — 뷰어는 맵 설정(레벨별 기본 도형)을 모른다.
  // 에디터 NodeRenderer 와 같은 우선순위: 노드별 → 레벨 기본 → 둥근.
  // 뷰어가 그리는 도형은 사각형뿐이라 'none'만 의미가 있지만, 규칙은
  // 에디터와 동일하게 유지한다.
  const shapeType = node.style?.shapeType ?? levelShape(depth);

  return {
    id: node.id,
    text: node.text,
    icon: node.icon,
    tags,
    links: node.links?.map((l) => ({ url: l.url, label: l.label })),
    notes: node.notes?.map((n) => ({
      id: n.id, type: n.type, text: n.text, checked: n.checked, lang: n.lang,
      // 리치 붙여넣기(사진+서식) — sanitizeRichHtml을 통과한 HTML만 저장됨
      html: n.html,
    })),
    attachments: node.attachments?.map((a) => {
      const packaged = resolveHref?.(a.id);
      // blob: 원본은 이 브라우저 세션에서만 유효하다 — 패키징하지 못한
      // blob: 을 href 로 내보내면 죽은 링크가 되므로 비워서 뷰어가
      // "(파일 없음)" 으로 표시하게 한다. http(s) 는 외부 링크로 유지.
      const live = packaged ?? (a.url && !a.url.startsWith('blob:') ? a.url : undefined);
      return {
        name: a.name,
        href: live,
        kind: a.kind,
        external: packaged || !live ? undefined : true,
      };
    }),
    collapsed: node.collapsed || undefined,
    colorKey: node.colorKey,
    image: node.image,
    images: node.images?.length ? node.images : undefined,
    // 실효 정렬을 굽는다 — 뷰어는 맵 설정(레벨별 맞춤)을 모른다
    textAlign: node.textAlign ?? levelTextAlign(depth),
    style: (node.style && (node.style.strike || node.style.underline ||
      node.style.highlight ||
      node.style.fillColor || node.style.borderColor || node.style.textColor)) ||
      shapeType
      ? {
        strike: node.style?.strike || undefined,
        underline: node.style?.underline || undefined,
        highlight: node.style?.highlight || undefined,
        // 노드별 지정 색 — 뷰어가 팔레트보다 우선 적용 (원본 색 파리티)
        fillColor: node.style?.fillColor || undefined,
        borderColor: node.style?.borderColor || undefined,
        textColor: node.style?.textColor || undefined,
        shapeType,
      }
      : undefined,
    layoutType: node.layoutType,
    side: resolveSide?.(node.id) ?? node.side,
    pos: resolvePos?.(node.id),
    children: (node.children ?? []).map((c) =>
      toExportNode(c, resolveHref, resolvePos, resolveSide, depth + 1)),
  };
}

// EasyMindMap 로고 (2026-08 v3 — 사용자 제공 원본 벡터 SVG를 그대로 내장).
// 원본 파일 = src/assets/brand-logo.svg (docs/assets/brand/logo.svg와 동일
// 바이트) — I.Logo·index.html 파비콘도 같은 파일을 쓴다 (brand-logo.md).
// 뷰어 헤더 아이콘 + 브라우저 파비콘(data URL)으로 쓰인다. 고정
// width/height 속성은 제거해 사용처에서 크기를 지정한다.
const LOGO_SVG = brandLogoRaw
  .trim()
  .replace(' width="1254" height="1254"', '');

// The read-only viewer that runs inside the exported file. Plain ES5-ish JS,
// no dependencies, no backticks (this whole script lives inside a template
// literal). Layout is a recursive block model: measure() computes each
// subtree's block (bw × bh) plus the node's center offset (nx, ny) inside it
// according to the node's EFFECTIVE layout; arrange() then walks down
// assigning absolute coordinates. Collapse/expand just re-runs both passes.
const VIEWER_JS = String.raw`
(function () {
  'use strict';
  var DATA = window.__MINDMAP__;
  var svg = document.getElementById('mm-svg');
  var world = document.getElementById('mm-world');
  var notePanel = document.getElementById('mm-note');
  var noteBody = document.getElementById('mm-note-body');
  // 노트 글꼴·크기 (맵 설정 — 기본 13pt, 에디터 노트 뷰어와 동일)
  var NOTE_FONT = DATA.noteFont || {};
  noteBody.style.fontSize = ((NOTE_FONT.size > 0 ? NOTE_FONT.size : 15)) + 'px';
  if (NOTE_FONT.family) noteBody.style.fontFamily = NOTE_FONT.family;
  var noteTitle = document.getElementById('mm-note-title');
  var NS = 'http://www.w3.org/2000/svg';

  var COLORS = {
    root: '#C2410C',
    l1A: '#B45309', l1B: '#1D4ED8', l1C: '#15803D',
    l1D: '#BE185D', l1E: '#7C3AED', l2: '#64748B'
  };
  // 노드/엣지 스킨 — 다크 모드에서 에디터(THEMES.dark)와 동일한 느낌으로
  // 노드 카드·글자·연결선까지 통째로 바뀐다 (setDark → render()).
  // 노드 패밀리 팔레트 — 에디터 디자인 토큰(THEMES.light/dark)과 동일.
  // depth1 = colorKey 패밀리(파스텔 채움 + 컬러 테두리), depth2+ = L2
  // (흰 채움 + 황갈 테두리) — "뷰어 테두리 색이 원본과 다르다" 수정.
  var FAM_LIGHT = {
    root: { fill: '#D97706', text: '#FFFFFF', border: '#B45309' },
    l1A: { fill: '#FEF3C7', text: '#78350F', border: '#F59E0B' },
    l1B: { fill: '#DBEAFE', text: '#1E3A8A', border: '#3B82F6' },
    l1C: { fill: '#DCFCE7', text: '#14532D', border: '#22C55E' },
    l1D: { fill: '#FEE2E2', text: '#7F1D1D', border: '#EF4444' },
    l1E: { fill: '#EDE9FE', text: '#4C1D95', border: '#8B5CF6' },
    l2:  { fill: '#FFFFFF', text: '#1F1B16', border: '#D6CBB7' }
  };
  var FAM_DARK = {
    root: { fill: '#F59E0B', text: '#1A120A', border: '#FBBF24' },
    l1A: { fill: '#3B2A0A', text: '#FBBF24', border: '#F59E0B' },
    l1B: { fill: '#0C2340', text: '#93C5FD', border: '#3B82F6' },
    l1C: { fill: '#0F2F1E', text: '#86EFAC', border: '#22C55E' },
    l1D: { fill: '#3B1414', text: '#FCA5A5', border: '#EF4444' },
    l1E: { fill: '#231640', text: '#C4B5FD', border: '#8B5CF6' },
    l2:  { fill: '#1C1F26', text: '#E8E6E3', border: '#3A3F4B' }
  };
  var SKIN_LIGHT = {
    // accent = 에디터 t.primary — 마커 개수 배지 글자색
    fam: FAM_LIGHT, edge: '#B8A888', tagBase: '#FFFDF8', hl: '#FFE066',
    accent: '#D97706'
  };
  var SKIN_DARK = {
    // 형광펜 띠(hl)는 다크에서도 노란색 유지 — 진한 글자(#1F1B16)와
    // 짝을 이뤄 항상 읽힌다 (에디터와 동일). 예전 어두운 갈색 띠는
    // 진한 글자와 대비가 낮아 안 보였다.
    fam: FAM_DARK, edge: '#4A4E5A', tagBase: '#14171D', hl: '#FFE066',
    accent: '#F59E0B'
  };
  var SKIN = SKIN_LIGHT;
  function famOf(colorKey) { return SKIN.fam[colorKey] || SKIN.fam.l2; }
  function branchColor(key) { return COLORS[key] || '#8B7355'; }

  // ---- effective layout ----------------------------------------------------
  // Same inheritance rule as the editor (08-layout.md §6.2 / SubtreeStrategy):
  // a node uses its own layoutType if set, otherwise its parent's effective
  // layout. freeform/kanban render as radial-right in this mindmap viewer.
  var KNOWN = {
    'radial-bidirectional': 1, 'radial-right': 1, 'radial-left': 1,
    'tree-right': 1, 'tree-down': 1, 'hierarchy-right': 1,
    'process-tree-right': 1, 'timeline': 1, 'timeline-center': 1
  };
  function normalize(lt) {
    if (!lt) return null;
    if (lt === 'radial' || lt === 'both-radial') return 'radial-bidirectional';
    if (lt === 'tree') return 'tree-right';
    if (lt === 'hierarchy') return 'hierarchy-right';
    if (lt === 'progress-tree' || lt === 'process-tree-right-a' ||
        lt === 'process-tree-right-b') return 'process-tree-right';
    if (lt === 'freeform' || lt === 'free' || lt === 'kanban') return 'radial-right';
    return KNOWN[lt] ? lt : 'radial-right';
  }

  // ---- geometry constants ----------------------------------------------------
  var H_GAP = 46;        // column layouts: parent edge → child edge
  var V_GAP = 12;        // vertical gap between sibling blocks in a column
  var OUT_INDENT = 34;   // tree-right outline indent
  var OUT_GAP = 8;       // outline row gap
  var OUT_TOP = 14;      // outline: parent box → first child
  var ROW_GAP = 42;      // below-layouts: parent box → children row
  var COL_GAP = 22;      // horizontal gap between sibling blocks in a row
  var PROC_INDENT = 24;  // process: children row starts right of parent left
  var PAD_X = 13, PAD_Y = 8;
  var TAG_H = 15;

  function measureText(text, fontSize) {
    var w = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      w += c > 0x2E7F ? fontSize : (c === 32 ? fontSize * 0.34 : fontSize * 0.56);
    }
    return w;
  }

  // 인라인 강조 구간(tspan)의 표시 좌표용 "실측" 폭 — 근사 폭(measureText)으로
  // x를 정하면 실제 렌더 폭과 어긋나 인접 구간 글자가 겹친다 (에디터
  // textMeasure.ts와 동일한 방식). 캔버스 불가 환경은 근사 폭으로 폴백.
  var _mCtx = null;
  function measureReal(text, fontSize, weight, italic, family) {
    try {
      if (!_mCtx) _mCtx = document.createElement('canvas').getContext('2d');
      if (!_mCtx) return measureText(text, fontSize);
      _mCtx.font = (italic ? 'italic ' : '') + (weight || 500) + ' ' + fontSize + 'px ' +
        (family || "'Pretendard Variable',Pretendard,'Malgun Gothic',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif");
      return _mCtx.measureText(text).width;
    } catch (e) { return measureText(text, fontSize); }
  }

  function wrapText(text, fontSize, maxW) {
    var out = [];
    var starts = []; // 수동 줄바꿈 세그먼트가 시작하는 줄 인덱스 (마커 이월 리셋점)
    var manual = String(text || '').split('\n');
    for (var m = 0; m < manual.length; m++) {
      starts.push(out.length);
      var words = manual[m].split(/(\s+)/), cur = '', curW = 0;
      for (var i = 0; i < words.length; i++) {
        var ww = measureText(words[i], fontSize);
        if (curW + ww > maxW && cur !== '') { out.push(cur.replace(/\s+$/, '')); cur = ''; curW = 0; }
        if (ww > maxW) {
          for (var k = 0; k < words[i].length; k++) {
            var cw = measureText(words[i][k], fontSize);
            if (curW + cw > maxW && cur !== '') { out.push(cur); cur = ''; curW = 0; }
            cur += words[i][k]; curW += cw;
          }
        } else { cur += words[i]; curW += ww; }
      }
      out.push(cur.replace(/\s+$/, ''));
    }
    var w = 0;
    for (var j = 0; j < out.length; j++) w = Math.max(w, measureText(out[j], fontSize));
    return { lines: out, w: w, starts: starts };
  }

  // 노드 텍스트 속 Markdown 표 감지 — 에디터(mdTable.ts)와 같은 규칙.
  // 파이프 행 + 바로 다음 줄이 구분선(:?--:?)이면 표. 첫 표 하나만.
  function parseMdTable(text) {
    var lines = String(text || '').split('\n');
    function trimS(s) { return s.replace(/^\s+|\s+$/g, ''); }
    function isPipe(s) { s = trimS(s); return s.length > 1 && s.indexOf('|') >= 0; }
    function cells(s) {
      s = trimS(s);
      if (s.charAt(0) === '|') s = s.slice(1);
      if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
      var a = s.split('|'), o = [], i2;
      for (i2 = 0; i2 < a.length; i2++) o.push(trimS(a[i2]));
      return o;
    }
    function isSep(s) {
      if (!isPipe(s)) return false;
      var c = cells(s), i2;
      if (!c.length) return false;
      for (i2 = 0; i2 < c.length; i2++) { if (!/^:?-{2,}:?$/.test(c[i2])) return false; }
      return true;
    }
    // MD 구분선(|---|)은 선택 사항 — 구분선 없이 파이프 행 2줄 이상이면
    // 표로 취급 (줄=행, |=열, 첫 행=헤더. 에디터 mdTable.ts와 동일 규칙)
    for (var i = 0; i < lines.length - 1; i++) {
      if (!isPipe(lines[i]) || isSep(lines[i])) continue;
      if (!isPipe(lines[i + 1])) continue;
      var headers = cells(lines[i]);
      if (headers.length < 2) continue;
      var rows = [], j = i + 1;
      if (isSep(lines[j])) j++;
      while (j < lines.length && isPipe(lines[j]) && !isSep(lines[j])) {
        var c2 = cells(lines[j]);
        while (c2.length < headers.length) c2.push('');
        rows.push(c2.slice(0, headers.length));
        j++;
      }
      if (!rows.length) continue;
      // before/after — 표 앞·뒤 텍스트 (원문 위치 렌더용, 에디터와 동일)
      return {
        headers: headers, rows: rows,
        before: lines.slice(0, i).join('\n').replace(/\s+$/, ''),
        after: lines.slice(j).join('\n').replace(/^\s+|\s+$/g, '')
      };
    }
    return null;
  }

  // 노드 속 코드 펜스(백틱x3) 파서 — 에디터 mdCode.ts와 동일 규칙 (P1).
  // 백틱 문자는 템플릿 문자열 안이라 charCode(96)로 검사한다.
  function isFenceLine(s) {
    var t2 = s.replace(/^\s+/, '');
    return t2.charCodeAt(0) === 96 && t2.charCodeAt(1) === 96 && t2.charCodeAt(2) === 96;
  }
  function parseMdCode(text) {
    var lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
      if (!isFenceLine(lines[i])) continue;
      var code = [], j = i + 1;
      while (j < lines.length && !isFenceLine(lines[j])) { code.push(lines[j]); j++; }
      if (!code.join('').replace(/\s/g, '')) return null;
      var lang = lines[i].replace(/^\s+/, '').slice(3).replace(/^\s+|\s+$/g, '');
      // before = 펜스 앞 일반 텍스트 (에디터 mdCode.ts와 동일 trimEnd) —
      // 코드 패널을 원문 순서(앞 텍스트 위 / 뒤 텍스트 아래)에 놓기 위함
      var before = lines.slice(0, i).join('\n').replace(/\s+$/, '');
      return { code: code, lang: lang || undefined, before: before };
    }
    return null;
  }

  // 한 줄 요약(검색 결과·아웃라인 행) — 블록 마커 원문 대신 접어 표시:
  // 코드 펜스 → "⧉코드" · 파이프 표 → "⊞표" · - [x] → ☑/☐ (에디터
  // flattenNodeText와 동일 규칙 — 리치 노드 P4)
  function flattenText(text) {
    var lines = String(text || '').split('\n');
    var out = [], inFence = false, codeChip = false, tableChip = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (isFenceLine(ln)) {
        if (!inFence && !codeChip) { out.push('⧉코드'); codeChip = true; }
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      var t2 = ln.replace(/^\s+|\s+$/g, '');
      if (t2.length > 1 && t2.indexOf('|') >= 0 && t2.split('|').length >= 2) {
        if (!/^[\s|:\-]+$/.test(t2) && !tableChip) { out.push('⊞표'); tableChip = true; }
        continue;
      }
      var m3 = /^[ \t]*[-*+][ \t]+\[([ xX])\][ \t]?(.*)$/.exec(ln);
      if (m3) { out.push((m3[1] === ' ' ? '☐ ' : '☑ ') + m3[2]); continue; }
      if (t2) out.push(t2);
    }
    return out.join(' ');
  }

  // 인라인 강조 파서 — 에디터 inlineMarks.ts와 동일 (마커 토글, 짝이
  // 없으면 줄 끝까지). t=텍스트, b/i/s/u/h=굵게/기울임/취소선/밑줄/형광
  // init 상태에서 시작해 파싱하고 줄 끝 상태를 함께 반환 — 마커 구간이
  // 자동 줄바꿈 경계에 걸치면 다음 줄로 상태를 이월한다 (에디터와 동일)
  function parseInlineSegsState(line, init) {
    var segs = [], buf = '';
    var b = init ? !!init.b : false, it = init ? !!init.i : false,
      st2 = init ? !!init.s : false, u = init ? !!init.u : false,
      h = init ? !!init.h : false, c = init ? !!init.c : false;
    function push() { if (buf) { segs.push({ t: buf, b: b, i: it, s: st2, u: u, h: h, c: c }); buf = ''; } }
    var idx = 0;
    while (idx < line.length) {
      var two = line.substr(idx, 2);
      if (two === '**') { push(); b = !b; idx += 2; continue; }
      if (two === '~~') { push(); st2 = !st2; idx += 2; continue; }
      if (two === '==') { push(); h = !h; idx += 2; continue; }
      if (two === '__') { push(); u = !u; idx += 2; continue; }
      if (line.charAt(idx) === '*') { push(); it = !it; idx += 1; continue; }
      if (line.charCodeAt(idx) === 96) { push(); c = !c; idx += 1; continue; } // 96 = backtick (템플릿 문자열 안이라 문자로 못 씀)
      buf += line.charAt(idx);
      idx += 1;
    }
    push();
    if (!segs.length) segs.push({ t: '' });
    return { segs: segs, end: { b: b, i: it, s: st2, u: u, h: h, c: c } };
  }
  // 인라인 코드 렌더 색 — 에디터 inlineMarks.ts CODE_* 와 동일 (테마 무관 고정)
  var CODE_BG = '#ECEFF3', CODE_TEXT = '#334155';
  var CODE_FONT = "ui-monospace, 'Cascadia Mono', 'Consolas', 'D2Coding', monospace";
  // 코드 격자 (utils/monoGrid 와 같은 규칙) — 글자마다 x 를 지정해
  // 폰트 폴백과 무관하게 칸을 맞춘다. 한글·한자·가나·전각기호 = 2칸.
  var WIDE_RE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
  var CELL_RATIO = 0.6;
  function cellsOf(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) n += WIDE_RE.test(str[i]) ? 2 : 1;
    return n;
  }
  function gridXAttr(str, fs, x0) {
    var cw = fs * CELL_RATIO, col = 0, out = [];
    for (var i = 0; i < str.length; i++) {
      out.push(Math.round((x0 + col * cw) * 100) / 100);
      col += WIDE_RE.test(str[i]) ? 2 : 1;
    }
    return out.join(' ');
  }
  function parseInlineSegs(line) { return parseInlineSegsState(line).segs; }

  // ---- measure pass (bottom-up, per-layout block model) ----------------------
  // Sets on each node: _w/_h (box), _boxH (box + tag reserve), _lines/_fs/
  // _lineH, _open, _eff (effective layout for ITS children), _bw/_bh (block),
  // _nx/_ny (node CENTER offset within the block).
  function sum(kids, f) { var s = 0; for (var i = 0; i < kids.length; i++) s += f(kids[i]); return s; }
  function maxOf(kids, f) { var s = 0; for (var i = 0; i < kids.length; i++) s = Math.max(s, f(kids[i])); return s; }

  // 노트 종류(문단/코드/표/체크) — 종류별로 개별 마커를 그린다.
  // 에디터의 NOTE_KIND_META(nodeContent.ts)와 동일한 규격.
  var NOTE_STYLE = {
    'note-paragraph': { color: '#64748B', letter: 'T', label: '문단 노트', type: 'paragraph' },
    'note-code':      { color: '#B45309', letter: 'C', label: '코드 노트', type: 'code_block' },
    'note-table':     { color: '#1D4ED8', letter: '',  label: '표 노트', type: 'table' },
    'note-check':     { color: '#15803D', letter: '',  label: '체크리스트', type: 'checklist' }
  };
  var NOTE_KIND_ORDER = ['note-paragraph', 'note-code', 'note-table', 'note-check'];
  function noteType(b) {
    return b.type === 'warning' || b.type === 'tip' ? 'paragraph' : b.type;
  }
  function notesOf(node, type) {
    var out = [], i, list = node.notes || [];
    for (i = 0; i < list.length; i++) { if (noteType(list[i]) === type) out.push(list[i]); }
    return out;
  }

  // 마커 옆 선택 팝업 — 에디터 ChooserPopover와 동일 규격 (2026-08-02
  // 파리티 수정: 링크·첨부·미디어 복수 항목은 우상단 상세 패널이 아니라
  // 클릭한 마커 **옆**에 목록을 띄우고, 호버 항목을 강조한다).
  var chooser = null;
  function closeChooser() {
    if (chooser) { chooser.parentNode.removeChild(chooser); chooser = null; }
  }
  document.addEventListener('pointerdown', function (e) {
    if (chooser && !chooser.contains(e.target)) closeChooser();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeChooser();
  });
  // 줌/팬으로 마커가 움직이면 고정 위치 팝업이 어긋난다 — 닫는다.
  document.addEventListener('wheel', function () { closeChooser(); }, true);
  // rows: [{ icon, label, title, act }] — act 없는 행은 비활성(파일 없음).
  function openChooser(markerEl, rows) {
    closeChooser();
    var box = document.createElement('div');
    box.id = 'mm-chooser';
    for (var i = 0; i < rows.length; i++) {
      (function (rowDef) {
        var b = document.createElement('button');
        b.className = 'mm-chooser-item' + (rowDef.act ? '' : ' off');
        b.textContent = rowDef.icon + ' ' + rowDef.label;
        b.setAttribute('title', rowDef.title || rowDef.label);
        if (rowDef.act) {
          b.addEventListener('click', function (ev) {
            ev.stopPropagation();
            rowDef.act();
            closeChooser();
          });
        }
        box.appendChild(b);
      })(rows[i]);
    }
    document.body.appendChild(box);
    // 마커 오른쪽 옆, 세로는 마커 중심 정렬 (화면 밖으로 나가면 안쪽으로)
    var r = markerEl.getBoundingClientRect();
    var bw = box.offsetWidth, bh = box.offsetHeight;
    var left = r.right + 10;
    if (left + bw > window.innerWidth - 8) left = Math.max(8, r.left - 10 - bw);
    var top = r.top + r.height / 2 - bh / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - bh - 8));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    chooser = box;
  }
  // 첨부 열기 — 상세 패널의 attachmentRow와 동일 정책: 새 탭에서 열고,
  // 패키지에 내장된 파일(external 아님)은 download 속성으로 저장 유도.
  function openAttachmentHref(att) {
    if (!att.href) return null;
    return function () {
      var a = document.createElement('a');
      a.href = att.href;
      a.target = '_blank';
      a.rel = 'noopener';
      if (!att.external) a.setAttribute('download', att.name);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  }

  // 인디케이터 개수 — 노드 박스 안(텍스트 뒤)에 그려지므로 폭 계산에
  // 포함해 모든 마커가 박스 안에 들어가게 한다. 노트는 종류 수만큼.
  function markerCount(node) {
    var n = 0, hasFile = false, hasMedia = false, i;
    if (node.links && node.links.length) n++;
    if (node.notes && node.notes.length) {
      var seen = {};
      for (i = 0; i < node.notes.length; i++) {
        var tp = noteType(node.notes[i]);
        if (!seen[tp]) { seen[tp] = 1; n++; }
      }
    }
    if (node.attachments) {
      for (i = 0; i < node.attachments.length; i++) {
        if (node.attachments[i].kind === 'audio' || node.attachments[i].kind === 'video') hasMedia = true;
        else hasFile = true;
      }
    }
    if (hasFile) n++;
    if (hasMedia) n++;
    return n;
  }

  function measure(node, depth, inheritedEff, parentEff, parentRole) {
    var eff = normalize(node.layoutType) || inheritedEff;
    node._eff = eff;

    // 시간배치에서 이 노드가 맡은 자리 (에디터 _timelineRole 과 같은 뜻).
    //   'axis'  = 시간축 위에 놓인 노드 (축 시작점 바로 아래 단계)
    //   'stack' = 그 아래로 세로로 쌓이는 노드
    // **깊이로 판정하지 않는다** — 시간배치를 서브트리에 걸면 축 노드의
    // 깊이가 1 이 아니다 (2026-08-07 에디터와 같은 수정).
    node._tlRole = null;
    if (parentEff === 'timeline' || parentEff === 'timeline-center') {
      node._tlRole = parentRole ? 'stack' : 'axis';
    }

    var fontSize = depth === 0 ? 17 : depth === 1 ? 13.5 : 12.5;
    var wrapped = wrapText(node.text, fontSize, depth === 0 ? 240 : 220);
    var lineH = fontSize * 1.35;
    var iconW = node.icon ? fontSize + 6 : 0;
    var mfs = fontSize + 1;
    var marks = markerCount(node);
    var marksW = marks ? marks * (mfs + 3) + 5 : 0; // 마커 영역(텍스트 뒤)
    node._marksW = marksW;
    var w = Math.max(depth === 0 ? 120 : 90, wrapped.w + iconW + marksW) + PAD_X * 2;
    var h = wrapped.lines.length * lineH + PAD_Y * 2;
    // 사진 높이 (폴백 측정 모드 — 에디터 좌표가 없을 때만 쓰인다)
    var mInner = Math.max(40, w - PAD_X * 2);
    if (node.images && node.images.length) {
      for (var mi2 = 0; mi2 < node.images.length; mi2++) {
        var mim = node.images[mi2];
        h += Math.round(mim.h * Math.min(1, mInner / Math.max(1, mim.w))) + 6;
      }
    } else if (node.image && node.image.src) {
      h += Math.round(node.image.h * Math.min(1, mInner / Math.max(1, node.image.w))) + 6;
    }
    var tagsH = (node.tags && node.tags.length) ? TAG_H + 7 : 0;

    node._fs = fontSize; node._lines = wrapped.lines; node._lineH = lineH;
    node._manualStarts = wrapped.starts;
    node._w = w; node._h = h; node._boxH = h + tagsH;
    node._open = !node.collapsed;

    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) measure(kids[i], depth + 1, eff, eff, node._tlRole);
    layoutBlock(node, depth);
  }

  // 블록(서브트리 묶음) 크기·자기 위치 계산 — 크기(_w/_h/_boxH)·_eff·
  // _open이 준비된 노드에 대해 동작한다. measure()(자체 측정)와
  // reflowFixed()(에디터 좌표 크기 유지 + 접기 재배치)가 공유한다.
  // depth는 방사형·양쪽 루트(depth 0)의 좌/우 분할 판정에만 쓰인다 —
  // 빠뜨리면 그 분기에서만 ReferenceError로 재배치 전체가 죽는다 (2026-07
  // 방사형·양쪽 모두 접기 백지 버그).
  function layoutBlock(node, depth) {
    var w = node._w, h = node._h, eff = node._eff;
    var kids = node.children || [];

    if (!node._open || kids.length === 0) {
      node._bw = w; node._bh = node._boxH;
      node._nx = w / 2; node._ny = h / 2;
      // 접힌 노드의 +N 칩 자리 확보 — 칩이 다음 노드에 겹치지 않게
      // (하단 칩 = 트리/진행트리, 그 외 = 좌우 칩)
      if (!node._open && kids.length) {
        var effC = node._eff || '';
        if (effC === 'tree-right' || effC === 'tree-down' ||
            effC.indexOf('process-tree') === 0) {
          node._bh += 26;
        } else if (effC === 'radial-left' || effC === 'hierarchy-left') {
          node._bw += 28; node._nx += 28;
        } else {
          node._bw += 28;
        }
      }
      return;
    }

    var kidsColH, kidsColW, kidsRowW, kidsRowH, j;

    if (eff === 'radial-bidirectional' && depth === 0) {
      // root splits children by their side
      var L = [], R = [];
      for (j = 0; j < kids.length; j++) (kids[j].side === 'left' ? L : R).push(kids[j]);
      node._left = L; node._right = R;
      var lW = maxOf(L, function (k) { return k._bw; });
      var rW = maxOf(R, function (k) { return k._bw; });
      var lH = sum(L, function (k) { return k._bh; }) + Math.max(0, L.length - 1) * V_GAP;
      var rH = sum(R, function (k) { return k._bh; }) + Math.max(0, R.length - 1) * V_GAP;
      var leftPart = L.length ? lW + H_GAP : 0;
      node._bw = leftPart + w + (R.length ? H_GAP + rW : 0);
      node._bh = Math.max(node._boxH, lH, rH);
      node._nx = leftPart + w / 2; node._ny = node._bh / 2;
    } else if (eff === 'radial-left' ||
               (eff === 'radial-bidirectional' && node.side === 'left')) {
      // column of children to the LEFT, node at the right edge
      kidsColW = maxOf(kids, function (k) { return k._bw; });
      kidsColH = sum(kids, function (k) { return k._bh; }) + (kids.length - 1) * V_GAP;
      node._bw = kidsColW + H_GAP + w;
      node._bh = Math.max(node._boxH, kidsColH);
      node._nx = node._bw - w / 2; node._ny = node._bh / 2;
    } else if (eff === 'tree-right') {
      // indented outline below the node
      kidsColW = maxOf(kids, function (k) { return k._bw; });
      kidsColH = sum(kids, function (k) { return k._bh; }) + (kids.length - 1) * OUT_GAP;
      node._bw = Math.max(w, OUT_INDENT + kidsColW);
      node._bh = node._boxH + OUT_TOP + kidsColH;
      node._nx = w / 2; node._ny = h / 2;
    } else if (eff === 'tree-down') {
      // centered row below
      kidsRowW = sum(kids, function (k) { return k._bw; }) + (kids.length - 1) * COL_GAP;
      kidsRowH = maxOf(kids, function (k) { return k._bh; });
      node._bw = Math.max(w, kidsRowW);
      node._bh = node._boxH + ROW_GAP + kidsRowH;
      node._nx = node._bw / 2; node._ny = h / 2;
    } else if (eff === 'process-tree-right') {
      // left-anchored row below, indented (진행트리)
      kidsRowW = sum(kids, function (k) { return k._bw; }) + (kids.length - 1) * COL_GAP;
      kidsRowH = maxOf(kids, function (k) { return k._bh; });
      node._bw = Math.max(w, PROC_INDENT + kidsRowW);
      node._bh = node._boxH + ROW_GAP + kidsRowH;
      node._nx = w / 2; node._ny = h / 2;
    } else if (eff === 'hierarchy-right') {
      // column to the right, FIRST child on the parent's row (top-aligned)
      kidsColW = maxOf(kids, function (k) { return k._bw; });
      kidsColH = sum(kids, function (k) { return k._bh; }) + (kids.length - 1) * V_GAP;
      node._bw = w + H_GAP + kidsColW;
      node._bh = Math.max(node._boxH, kidsColH);
      node._nx = w / 2;
      node._ny = kids[0]._ny; // parent row = first child's row
    } else {
      // radial-right and everything else: column of children to the RIGHT,
      // vertically centered on the node
      kidsColW = maxOf(kids, function (k) { return k._bw; });
      kidsColH = sum(kids, function (k) { return k._bh; }) + (kids.length - 1) * V_GAP;
      node._bw = w + H_GAP + kidsColW;
      node._bh = Math.max(node._boxH, kidsColH);
      node._nx = w / 2; node._ny = node._bh / 2;
    }
  }

  // ---- arrange pass (top-down): block origin → absolute node centers --------
  function arrange(node, bx, by) {
    node._cx = bx + node._nx; node._cy = by + node._ny;
    var kids = node.children || [];
    if (!node._open || kids.length === 0) return;
    var eff = node._eff, cy, cx, j, k;

    if (eff === 'radial-bidirectional' && node._left) {
      var L = node._left, R = node._right;
      var lH = sum(L, function (n) { return n._bh; }) + Math.max(0, L.length - 1) * V_GAP;
      var rH = sum(R, function (n) { return n._bh; }) + Math.max(0, R.length - 1) * V_GAP;
      var leftPart = L.length ? maxOf(L, function (n) { return n._bw; }) + H_GAP : 0;
      cy = by + node._bh / 2 - lH / 2;
      for (j = 0; j < L.length; j++) {
        k = L[j];
        arrange(k, bx + leftPart - H_GAP - k._bw, cy); // right-align left blocks
        cy += k._bh + V_GAP;
      }
      cy = by + node._bh / 2 - rH / 2;
      for (j = 0; j < R.length; j++) {
        k = R[j];
        arrange(k, bx + leftPart + node._w + H_GAP, cy);
        cy += k._bh + V_GAP;
      }
    } else if (eff === 'radial-left' ||
               (eff === 'radial-bidirectional' && node.side === 'left')) {
      var colH = sum(kids, function (n) { return n._bh; }) + (kids.length - 1) * V_GAP;
      cy = by + node._bh / 2 - colH / 2;
      var rightEdge = bx + node._bw - node._w - H_GAP;
      for (j = 0; j < kids.length; j++) {
        arrange(kids[j], rightEdge - kids[j]._bw, cy);
        cy += kids[j]._bh + V_GAP;
      }
    } else if (eff === 'tree-right') {
      cy = by + node._boxH + OUT_TOP;
      for (j = 0; j < kids.length; j++) {
        arrange(kids[j], bx + OUT_INDENT, cy);
        cy += kids[j]._bh + OUT_GAP;
      }
    } else if (eff === 'tree-down') {
      var rowW = sum(kids, function (n) { return n._bw; }) + (kids.length - 1) * COL_GAP;
      cx = bx + node._bw / 2 - rowW / 2;
      for (j = 0; j < kids.length; j++) {
        arrange(kids[j], cx, by + node._boxH + ROW_GAP);
        cx += kids[j]._bw + COL_GAP;
      }
    } else if (eff === 'process-tree-right') {
      cx = bx + PROC_INDENT;
      for (j = 0; j < kids.length; j++) {
        arrange(kids[j], cx, by + node._boxH + ROW_GAP);
        cx += kids[j]._bw + COL_GAP;
      }
    } else if (eff === 'hierarchy-right') {
      cy = by; // top-aligned: first child's row == parent's row
      for (j = 0; j < kids.length; j++) {
        arrange(kids[j], bx + node._w + H_GAP, cy);
        cy += kids[j]._bh + V_GAP;
      }
    } else { // radial-right & fallbacks
      var colH2 = sum(kids, function (n) { return n._bh; }) + (kids.length - 1) * V_GAP;
      cy = by + node._bh / 2 - colH2 / 2;
      for (j = 0; j < kids.length; j++) {
        arrange(kids[j], bx + node._w + H_GAP, cy);
        cy += kids[j]._bh + V_GAP;
      }
    }
  }

  // ---- edges (style follows the PARENT's effective layout, 08-layout §18) ----
  function edgePath(p, c) {
    var eff = p._eff;
    if (eff === 'timeline' || eff === 'timeline-center') {
      // 시간배치 — 루트→주제: 시간축을 따라가다 주제로 꺾임.
      // 주제 이하: 왼쪽 스파인 세로 아웃라인 (위/아래 방향).
      // **축 시작점 → 축 위 노드** — 판정은 역할(_tlRole)이다. 예전에는
      // p === DATA.root 로 봤는데, 서브트리에 걸면 시작점이 중심 주제가
      // 아니라 고른 노드라 이 경로를 못 찾았다 (2026-08-07).
      if (c._tlRole === 'axis') {
        // 중앙노드: 시작점과 축 노드가 **모두 축 위**라 시간축 토막이 곧
        // 연결선이다. 여기서 또 그으면 축과 겹치고, 먼 노드로 가는 선은
        // 앞 노드들을 관통한다 (에디터 Canvas 와 같은 규칙).
        if (eff === 'timeline-center') return '';
        var edgeY0 = c._cy < p._cy ? c._cy + c._h / 2 : c._cy - c._h / 2;
        return 'M ' + (p._cx + p._w / 2) + ' ' + p._cy + ' H ' + c._cx + ' V ' + edgeY0;
      }
      var up = c._cy < p._cy;
      var tagPad0 = (!up && p.tags && p.tags.length) ? TAG_H + 7 : 0;
      var fy = up ? p._cy - p._h / 2 : p._cy + p._h / 2 + tagPad0;
      var sp = p._cx - p._w / 2 + 12;
      return 'M ' + sp + ' ' + fy + ' V ' + c._cy + ' H ' + (c._cx - c._w / 2);
    }
    var childLeft = c._cx - c._w / 2, childRight = c._cx + c._w / 2;
    var childTop = c._cy - c._h / 2;
    var pLeft = p._cx - p._w / 2, pRight = p._cx + p._w / 2;
    // 태그 칩은 박스 바깥 아래(+4~+19)에 그려지므로, 아래로 내려가는
    // 직각 연결선은 태그 밑에서 시작해 태그를 관통하지 않는다.
    var pTagPad = (p.tags && p.tags.length) ? TAG_H + 7 : 0;
    var pBottom = p._cy + p._h / 2 + pTagPad;
    var mx, my;

    if (eff === 'tree-right') {
      // outline: parent bottom-left spine → down → into child's left edge
      var spine = pLeft + 12;
      return 'M ' + spine + ' ' + pBottom + ' V ' + c._cy + ' H ' + childLeft;
    }
    if (eff === 'tree-down') {
      my = (pBottom + childTop) / 2;
      return 'M ' + p._cx + ' ' + pBottom + ' V ' + my + ' H ' + c._cx + ' V ' + childTop;
    }
    if (eff === 'process-tree-right') {
      var fx = pLeft + 14, tx = c._cx - c._w / 2 + 14;
      if (Math.abs(tx - fx) < 1) return 'M ' + fx + ' ' + pBottom + ' V ' + childTop;
      my = (pBottom + childTop) / 2;
      return 'M ' + fx + ' ' + pBottom + ' V ' + my + ' H ' + tx + ' V ' + childTop;
    }
    if (eff === 'hierarchy-right') {
      mx = (pRight + childLeft) / 2;
      return 'M ' + pRight + ' ' + p._cy + ' H ' + mx + ' V ' + c._cy + ' H ' + childLeft;
    }
    // radial family: markmap-style bump curve toward the child's side
    var goesLeft = c._cx < p._cx;
    var x1 = goesLeft ? pLeft : pRight;
    var x2 = goesLeft ? childRight : childLeft;
    mx = (x1 + x2) / 2;
    return 'M ' + x1 + ' ' + p._cy + ' C ' + mx + ' ' + p._cy + ', ' + mx + ' ' + c._cy + ', ' + x2 + ' ' + c._cy;
  }

  // ---- render ----------------------------------------------------------------
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Content-marker glyphs, centered at (cx, cy) and scaled to size.
  // link/file are drawn as bold SVG (globe+gold chain / violet clip badge —
  // the editor's IndicatorGlyph.tsx design; emojis render faint on some OSes).
  // note/media keep their vivid emojis. Returns the clickable <g>.
  function drawMarkerGlyph(parent, kind, cx, cy, size) {
    var g2 = el('g', { cursor: 'pointer' }, parent);
    var s = size / 24;

    if (kind === 'link' || kind === 'file') {
      var inner = el('g', {
        transform: 'translate(' + cx + ',' + cy + ') scale(' + s + ') translate(-12,-12)'
      }, g2);
      if (kind === 'link') {
        el('circle', { cx: 10, cy: 9.5, r: 7.2, fill: '#3B82F6', stroke: '#1D4ED8', 'stroke-width': 1.6 }, inner);
        el('ellipse', { cx: 10, cy: 9.5, rx: 3.1, ry: 7.2, fill: 'none', stroke: '#DBEAFE', 'stroke-width': 1.2 }, inner);
        el('line', { x1: 2.8, y1: 9.5, x2: 17.2, y2: 9.5, stroke: '#DBEAFE', 'stroke-width': 1.2 }, inner);
        el('rect', { x: 10.2, y: 14.4, width: 6.6, height: 4.8, rx: 2.4, fill: '#F59E0B', stroke: '#92400E', 'stroke-width': 1.5 }, inner);
        el('rect', { x: 15.2, y: 14.4, width: 6.6, height: 4.8, rx: 2.4, fill: '#FBBF24', stroke: '#92400E', 'stroke-width': 1.5 }, inner);
      } else {
        // 첨부파일 — 에디터 IndicatorGlyph와 동일한 보라 배지 + 흰 클립
        // (맨클립 선만 그리면 다크 모드 노드 배경에서 안 보인다)
        el('rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, fill: '#7C3AED' }, inner);
        var clipG = el('g', {
          transform: 'translate(12,12) scale(0.68) translate(-12,-11.5)'
        }, inner);
        el('path', {
          d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
          fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.7,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        }, clipG);
      }
      // transparent hit area so clicks land anywhere on the glyph
      el('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, fill: 'transparent' }, g2);
    } else if (NOTE_STYLE[kind]) {
      // 노트 종류별 배지 — 문단 T(회색) / 코드 C(주황) / 표 ⊞(파랑) /
      // 체크 ✓(초록). 에디터 NoteTypeGlyph와 동일한 모양.
      var innerN = el('g', {
        transform: 'translate(' + cx + ',' + cy + ') scale(' + s + ') translate(-12,-12)'
      }, g2);
      el('rect', { x: 2, y: 2, width: 20, height: 20, rx: 5, fill: NOTE_STYLE[kind].color }, innerN);
      if (kind === 'note-table') {
        el('rect', { x: 6, y: 6, width: 12, height: 12, rx: 1, fill: 'none',
          stroke: '#FFFFFF', 'stroke-width': 1.8 }, innerN);
        el('line', { x1: 6, y1: 12, x2: 18, y2: 12, stroke: '#FFFFFF', 'stroke-width': 1.8 }, innerN);
        el('line', { x1: 12, y1: 6, x2: 12, y2: 18, stroke: '#FFFFFF', 'stroke-width': 1.8 }, innerN);
      } else if (kind === 'note-check') {
        el('path', { d: 'M6.5 12.5l3.6 3.6 7.4-8', fill: 'none', stroke: '#FFFFFF',
          'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, innerN);
      } else {
        var lt2 = el('text', { x: 12, y: 17, 'text-anchor': 'middle', 'font-size': 14.5,
          'font-weight': 800, fill: '#FFFFFF', 'font-family': 'Arial, sans-serif' }, innerN);
        lt2.textContent = NOTE_STYLE[kind].letter;
      }
      el('rect', { x: cx - size / 2, y: cy - size / 2, width: size, height: size, fill: 'transparent' }, g2);
    } else {
      var t2 = el('text', { x: cx, y: cy + size * 0.32, 'font-size': size - 2, 'text-anchor': 'middle' }, g2);
      t2.textContent = '▶️';
    }
    return g2;
  }

  // 에디터 계산 좌표(pos)가 있으면 그대로 사용 — 에디터 화면과 동일한
  // 배치를 재현한다. (최초 표시 전용 — 접기를 한 번이라도 조작하면
  // reflowFixed()로 전환해 에디터처럼 간격을 재배치한다)
  function assignFixed(node, depth, inheritedEff, parentEff, parentRole) {
    var eff = normalize(node.layoutType) || inheritedEff;
    node._eff = eff;
    // 시간배치 역할 — measure() 와 같은 규칙 (2026-08-07)
    node._tlRole = null;
    if (parentEff === 'timeline' || parentEff === 'timeline-center') {
      node._tlRole = parentRole ? 'stack' : 'axis';
    }
    node._cx = node.pos.x; node._cy = node.pos.y;
    node._w = node.pos.w; node._h = node.pos.h;
    node._lines = node.pos.lines; node._lineH = node.pos.lh;
    node._manualStarts = node.pos.ms;
    node._checks = node.pos.ck; // 체크리스트 항목(래핑 줄 범위 — P2)
    node._fs = node.pos.fs;
    node._ff = node.pos.ff; // 맵 설정(레벨별 폰트)의 글꼴
    // 에디터 좌표 모드 — _lines가 Markdown 표를 제외한 텍스트만 담고
    // 있으므로 drawNode가 표를 직접 그린다.
    node._fixed = true;
    node._open = !node.collapsed;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].pos) assignFixed(kids[i], depth + 1, eff, eff, node._tlRole);
    }
  }

  // 접기 재배치(dynamic) 모드 — 접기/펴기를 한 번이라도 조작하면 켜져,
  // 이후에는 에디터 좌표의 "크기"만 유지한 채 위치를 다시 계산한다
  // (에디터처럼 접으면 간격이 줄고, 펴면 다시 늘어난다).
  var DYN = false;

  // 에디터 좌표 모드에서의 재배치 — 노드 크기·글꼴·줄바꿈은 에디터가
  // 계산한 값(pos)을 그대로 쓰고, 위치만 layoutBlock+arrange로 다시 계산.
  function reflowFixed(rootEff) {
    (function prep(n, inheritedEff, depth, parentEff, parentRole) {
      var eff = normalize(n.layoutType) || inheritedEff;
      n._eff = eff;
      n._tlRole = null;
      if (parentEff === 'timeline' || parentEff === 'timeline-center') {
        n._tlRole = parentRole ? 'stack' : 'axis';
      }
      n._open = !n.collapsed;
      n._fixed = true;
      n._w = n.pos.w; n._h = n.pos.h;
      n._lines = n.pos.lines; n._lineH = n.pos.lh;
      n._manualStarts = n.pos.ms;
      n._checks = n.pos.ck;
      n._fs = n.pos.fs; n._ff = n.pos.ff;
      var tagsH = (n.tags && n.tags.length) ? TAG_H + 7 : 0;
      n._boxH = n._h + tagsH;
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].pos) prep(kids[i], eff, depth + 1, eff, n._tlRole);
      }
      layoutBlock(n, depth); // 자식 블록 계산 후 자기 블록 (후위 순회)
    })(DATA.root, rootEff, 0);
    arrange(DATA.root, 40, 40);
  }

  // 접힌 노드의 +N 칩을 담는 최상위 레이어 — 형제 노드가 나중에
  // 그려지며 칩 숫자를 덮던 문제 수정 (항상 노드들 위에 보인다)
  var chipLayer = null;

  function render() {
    while (world.firstChild) world.removeChild(world.firstChild);
    chipLayer = el('g', { 'class': 'mm-chip-layer' });
    var rootEff = normalize(DATA.root.layoutType) || normalize(DATA.mapLayout) || 'radial-bidirectional';
    DATA.root.layoutType = DATA.root.layoutType || rootEff;
    if (DATA.root.pos && !DYN) {
      assignFixed(DATA.root, 0, rootEff);
    } else if (DATA.root.pos) {
      reflowFixed(rootEff);
    } else {
      measure(DATA.root, 0, rootEff);
      arrange(DATA.root, 40, 40);
    }
    // Focus 모드(에디터 Alt+F 파리티) — 배치는 전체 기준 그대로 두고,
    // 선택 노드의 서브트리만 그린다 (fit이 곧 서브트리 맞춤이 된다)
    var start = DATA.root, sd = 0, scol = null;
    if (FOCUS && FOCUS !== DATA.root.id) {
      (function walk(n, depth, color) {
        var c2 = depth === 0 ? null
          : (depth === 1 ? famOf(n.colorKey).border : (color || SKIN.fam.l2.border));
        if (n.id === FOCUS) { start = n; sd = depth; scol = color; return true; }
        var kids = n.children || [];
        for (var i = 0; i < kids.length; i++) {
          if (walk(kids[i], depth + 1, c2)) return true;
        }
        return false;
      })(DATA.root, 0, null);
      if (start._cx == null) { start = DATA.root; sd = 0; scol = null; }
    }
    drawNode(start, sd, scol);
    world.appendChild(chipLayer); // 접힘 칩을 마지막에 올려 항상 위에
    updateCount();
    syncOutline(); // 아웃라인 페인이 보이면 함께 갱신 (function 선언 호이스팅)
  }

  // 사용자 지정 채움색 위 글자색 — 에디터 readableTextOn과 동일 규칙.
  // 커스텀 색 노드는 라이트/다크 전환에도 글자색이 바뀌지 않는다 (고정색).
  function readableOn(fill) {
    var hex = String(fill || '').replace(/^#/, '');
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
    }
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#1F1B16';
    var v = parseInt(hex, 16);
    var lum = 0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
    return lum > 140 ? '#1F1B16' : '#F8F5EF';
  }

  function drawNode(node, depth, parentColor) {
    // 액센트(접기 칩·태그·표 격자) = 브랜치 테두리 색 (에디터와 동일 계열)
    var color = depth === 0 ? SKIN.fam.root.border
      : (depth === 1 ? famOf(node.colorKey).border : (parentColor || SKIN.fam.l2.border));
    // 노드 채움·테두리·글자 = 에디터 패밀리 팔레트, 노드별 지정 색 우선
    var fam0 = depth === 0 ? SKIN.fam.root : (depth === 1 ? famOf(node.colorKey) : SKIN.fam.l2);
    var stPre = node.style || {};
    var nodeFill2 = stPre.fillColor || fam0.fill;
    var nodeStroke2 = stPre.borderColor || fam0.border;
    // 검색 결과 — 어떤 스타일보다 우선해 또렷하게 (에디터와 동일).
    // 글자도 항상 진한 색 — 다크 모드에서 밝은 글자가 노란 배경에
    // 묻혀 안 보이던 문제 (라이트/다크 공통 고정색)
    // 도형 없음 (2026-08-08) — 테두리·채움 없이 글자만. 글자가 캔버스
    // 배경 위에 놓이므로 채움색에서 유도한 색이나 패밀리 색을 쓰면
    // 다크 모드에서 묻힌다. 본문 글자색(l2.text)이 두 모드 모두 안전하다.
    var noShape = stPre.shapeType === 'none';
    var nodeText2 = stPre.textColor ||
      (noShape ? SKIN.fam.l2.text
        : (stPre.fillColor ? readableOn(stPre.fillColor) : fam0.text));
    if (SEARCHHIT === node.id) {
      // 검색 강조는 도형 없음이어도 박스를 그려 보여 준다 (에디터와 동일)
      noShape = false;
      nodeFill2 = '#FFE066'; nodeStroke2 = '#DC2626'; nodeText2 = '#1F1B16';
    }
    var kids = node.children || [];

    // 축 화살표는 **축 시작점마다** 그린다 (2026-08-07) — 예전에는
    // depth === 0 이라 맵 전체 시간배치에서만 나왔고, 서브트리에 걸면
    // 축도 화살촉도 없었다. 시작점 = 자식 레이아웃이 시간배치인데
    // 자기 자신은 축 위 노드가 아닌 노드.
    if (node._tlRole !== 'axis' && node._tlRole !== 'stack'
        && (node._eff === 'timeline' || node._eff === 'timeline-center')) {
      // 수평 시간축 화살표 — 에디터 Canvas 와 같은 규칙.
      //  · timeline        : 루트 오른쪽 변 → 마지막 주제 너머 **한 줄**
      //  · timeline-center : 중심 주제·2레벨 주제가 모두 축 위에 얹히므로
      //                      **노드 사이 빈 칸에만** 토막으로 긋는다
      //                      (한 줄로 그으면 선이 노드 글자를 가로지른다)
      var maxX = node._cx + node._w / 2;
      (function scan(n2) {
        maxX = Math.max(maxX, n2._cx + n2._w / 2);
        var ks = n2._open ? (n2.children || []) : [];
        for (var q = 0; q < ks.length; q++) if (ks[q]._cx != null) scan(ks[q]);
      })(node);
      var endX = maxX + 46;
      var onAxis = [node];
      if (node._eff === 'timeline-center') {
        var kids0 = node._open ? (node.children || []) : [];
        for (var q2 = 0; q2 < kids0.length; q2++) {
          // 축 위에 얹힌 노드만 — 그 하위(스택)는 축을 가리지 않는다
          if (kids0[q2]._cx != null && kids0[q2]._tlRole === 'axis') {
            onAxis.push(kids0[q2]);
          }
        }
        onAxis.sort(function (a, b) { return a._cx - b._cx; });
      }
      for (var q3 = 0; q3 < onAxis.length; q3++) {
        var segFrom = onAxis[q3]._cx + onAxis[q3]._w / 2;
        var segTo = q3 + 1 < onAxis.length
          ? onAxis[q3 + 1]._cx - onAxis[q3 + 1]._w / 2 : endX;
        el('line', { x1: segFrom, y1: node._cy, x2: segTo, y2: node._cy,
          stroke: '#C9BBA4', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, world);
      }
      el('polygon', { points: (endX + 12) + ',' + node._cy + ' ' + (endX - 2) + ',' +
        (node._cy - 6) + ' ' + (endX - 2) + ',' + (node._cy + 6), fill: '#C9BBA4' }, world);
    }

    if (node._open) {
      for (var i = 0; i < kids.length; i++) {
        // 빈 경로 = "이 엣지는 그리지 않는다" (시간배치 중앙노드의
        // 루트→주제 — 시간축 토막이 곧 연결선이다)
        var dPath = edgePath(node, kids[i]);
        if (dPath) {
          el('path', { d: dPath, fill: 'none',
            stroke: SKIN.edge, 'stroke-width': depth === 0 ? 2.2 : 1.6,
            'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, world);
        }
        drawNode(kids[i], depth + 1, color);
      }
    }

    var g = el('g', { 'class': 'mm-node' + (SEL === node.id ? ' mm-selected' : '') }, world);
    if (SEL === node.id) {
      // 에디터와 동일: 노드 테두리 "밖" 별도 점선 사각형으로 선택 표시
      // (도형 테두리 스타일을 바꾸면 원래 점선 테두리로 오해된다)
      el('rect', {
        x: node._cx - node._w / 2 - 5, y: node._cy - node._h / 2 - 5,
        width: node._w + 10, height: node._h + 10, rx: 12,
        fill: 'none', stroke: '#D97706', 'stroke-width': 1.8,
        'stroke-dasharray': '4 3'
      }, g);
    }
    g.addEventListener('click', function (ev) {
      ev.stopPropagation();
      SEL = node.id;
      // 맵에서 직접 조작하면 검색 강조 해제 (에디터 selectOne과 동일 —
      // 강조된 노드 자체를 클릭한 경우는 유지)
      if (SEARCHHIT && SEARCHHIT !== node.id) SEARCHHIT = null;
      render();
    });
    var isRoot = depth === 0;
    var x0 = node._cx - node._w / 2, y0 = node._cy - node._h / 2;
    if (!noShape) {
      // 도형 — 에디터 NodeShape 와 **같은 좌표 공식**을 쓴다. 예전에는
      // 무엇을 골라도 사각형만 그려서 육각·타원·별이 뷰어에서 전부
      // 네모로 보였다 (도형 값 자체가 안 실려 오던 시절엔 드러나지
      // 않던 문제 — 2026-08-08).
      // class 'mm-box' = **노드 도형** 표식. 코드·표 패널 배경도 같은
      // 그룹 안의 rect 라, 이게 없으면 도형을 셀 때 섞인다.
      var com = {
        'class': 'mm-box',
        fill: nodeFill2,
        stroke: isRoot ? (stPre.borderColor || SKIN.fam.root.fill) : nodeStroke2,
        'stroke-width': isRoot ? 0 : 1.4
      };
      var put = function (tag, extra) {
        var at = {}, k;
        for (k in extra) at[k] = extra[k];
        for (k in com) at[k] = com[k];
        return el(tag, at, g);
      };
      var x1s = x0 + node._w, y1s = y0 + node._h;
      var cxs = node._cx, cys = node._cy, W = node._w, H = node._h;
      var sh = stPre.shapeType;
      if (sh === 'ellipse') {
        put('ellipse', { cx: cxs, cy: cys, rx: W / 2, ry: H / 2 });
      } else if (sh === 'diamond') {
        put('polygon', { points: cxs + ',' + y0 + ' ' + x1s + ',' + cys
          + ' ' + cxs + ',' + y1s + ' ' + x0 + ',' + cys });
      } else if (sh === 'hexagon') {
        var hi = Math.min(22, W * 0.18);
        put('polygon', { points: (x0 + hi) + ',' + y0 + ' ' + (x1s - hi) + ',' + y0
          + ' ' + x1s + ',' + cys + ' ' + (x1s - hi) + ',' + y1s
          + ' ' + (x0 + hi) + ',' + y1s + ' ' + x0 + ',' + cys });
      } else if (sh === 'parallelogram') {
        var ps = Math.min(20, W * 0.16);
        put('polygon', { points: (x0 + ps) + ',' + y0 + ' ' + x1s + ',' + y0
          + ' ' + (x1s - ps) + ',' + y1s + ' ' + x0 + ',' + y1s });
      } else if (sh === 'arrow-left') {
        // ◀ 촉이 왼쪽 중앙, 몸통은 오른쪽
        var al = Math.min(26, W * 0.24);
        put('polygon', { points: x0 + ',' + cys + ' ' + (x0 + al) + ',' + y0
          + ' ' + x1s + ',' + y0 + ' ' + x1s + ',' + y1s + ' ' + (x0 + al) + ',' + y1s });
      } else if (sh === 'arrow-right') {
        // ▶ 촉이 오른쪽 중앙
        var ar = Math.min(26, W * 0.24);
        put('polygon', { points: x1s + ',' + cys + ' ' + (x1s - ar) + ',' + y1s
          + ' ' + x0 + ',' + y1s + ' ' + x0 + ',' + y0 + ' ' + (x1s - ar) + ',' + y0 });
      } else if (sh === 'cylinder') {
        // ⛁ 위 뚜껑 타원 + 몸통 + 아래 볼록 바닥
        var cry = Math.min(9, H * 0.18);
        put('path', { d: 'M ' + x0 + ' ' + (y0 + cry) + ' V ' + (y1s - cry)
          + ' A ' + (W / 2) + ' ' + cry + ' 0 0 0 ' + x1s + ' ' + (y1s - cry)
          + ' V ' + (y0 + cry) });
        put('ellipse', { cx: cxs, cy: y0 + cry, rx: W / 2, ry: cry });
      } else if (sh === 'star') {
        // ★ 박스에 맞춰 늘린 5각 별 (글자는 중앙)
        var pts = [];
        for (var sti = 0; sti < 10; sti++) {
          var ang = -Math.PI / 2 + (sti * Math.PI) / 5;
          var kk = sti % 2 === 0 ? 1 : 0.45;
          pts.push((cxs + Math.cos(ang) * (W / 2) * kk) + ','
            + (cys + Math.sin(ang) * (H / 2) * kk));
        }
        put('polygon', { points: pts.join(' ') });
      } else {
        // 사각형 계열 — 뷰어의 기존 모서리 반경을 유지 (루트 13 / 그 외 9)
        put('rect', { x: x0, y: y0, width: W, height: H,
          rx: sh === 'rectangle' ? 2 : sh === 'pill' ? H / 2 : (isRoot ? 13 : 9) });
      }
    }

    var textColor = nodeText2;
    var tx = x0 + PAD_X;
    if (node.icon) {
      var ic = el('text', { x: tx, y: y0 + PAD_Y + node._fs * 0.85, 'font-size': node._fs + 1 }, g);
      ic.textContent = node.icon;
      tx += node._fs + 6;
    }
    // 텍스트 강조(취소선·하이라이트)·정렬·글꼴 + Markdown 표 — 에디터와 동일
    var st = node.style || {};
    var align = node.textAlign || 'center'; // 기본 정렬 = 중앙 (에디터와 동일)
    var mdt = node._fixed ? parseMdTable(node.text) : null;
    var mdc = node._fixed ? parseMdCode(node.text) : null;
    var cellFs = 0, rowH2 = 0, tblH = 0;
    // 표가 끼어드는 래핑 줄 인덱스(tAt)·위/아래 여백 — 에디터
    // sizeNodeForText.mdTableAt과 동일 규칙 (표 뒤 텍스트가 표 위로
    // 올라가던 문제 수정. 코드와 함께면 텍스트 뒤)
    var tAt = node._lines.length, tGapAbove = 0, tGapBelow = 0, tBlockH = 0;
    if (mdt) {
      cellFs = Math.max(10, node._fs - 2);
      rowH2 = cellFs + 10;
      tblH = (1 + mdt.rows.length) * rowH2;
      if (!mdc) {
        var tBeforeCnt = mdt.before === '' ? 0 : mdt.before.split('\n').length;
        var ms4 = (node._manualStarts && node._manualStarts.length) ? node._manualStarts : [0];
        tAt = tBeforeCnt < ms4.length ? ms4[tBeforeCnt] : node._lines.length;
      }
      tGapAbove = tAt > 0 ? 6 : 0;
      tGapBelow = node._lines.length > tAt ? 6 : 0;
      // 13 = 복사(⧉) 스트립 — 표 바깥 위 (에디터 MD_TABLE_COPY_STRIP 동일)
      tBlockH = 13 + tblH + tGapAbove + tGapBelow;
    }
    // 코드 패널 크기 — 에디터 mdCode.ts와 동일 (codeFs=fs-2, lineH=fs+6? → codeFs+6)
    var cFs = 0, cLineH = 0, cH = 0, cW = 0, CPX = 8, CPY = 6;
    var cHeadFs = 0, cHeadH = 0;
    // 패널이 끼어드는 래핑 줄 인덱스(cAt)·위/아래 여백 — 에디터
    // sizeNodeForText.mdCodeAt과 동일 규칙 (표가 있으면 텍스트 뒤)
    var cAt = node._lines.length, cGapAbove = 0, cGapBelow = 0;
    if (mdc) {
      cFs = Math.max(10, node._fs - 2);
      cLineH = cFs + 6;
      cHeadFs = Math.max(9, cFs - 2);
      cHeadH = cHeadFs + 10;
      if (!mdt) {
        var beforeCnt = mdc.before === '' ? 0 : mdc.before.split('\n').length;
        var ms3 = (node._manualStarts && node._manualStarts.length) ? node._manualStarts : [0];
        cAt = beforeCnt < ms3.length ? ms3[beforeCnt] : node._lines.length;
      }
      cGapAbove = (cAt > 0 || mdt) ? 6 : 0;
      cGapBelow = node._lines.length > cAt ? 6 : 0;
      cH = cHeadH + mdc.code.length * cLineH + CPY * 2;
      for (var cwi = 0; cwi < mdc.code.length; cwi++) {
        // 격자 폭 — 에디터 mdCode.monoMeasure 와 같은 계산
        cW = Math.max(cW, cellsOf(mdc.code[cwi]) * cFs * CELL_RATIO);
      }
      cW = Math.max(cW,
        cellsOf(mdc.lang || 'code') * cHeadFs * CELL_RATIO + cHeadFs * 7 + 16);
      cW = Math.ceil(cW) + CPX * 2;
    }
    // 텍스트 중간 인라인 사진(기사 붙여넣기) — 에디터 layoutInlineImages와
    // 동일 규칙: afterLine(논리 줄)을 _manualStarts로 래핑 줄 자리로 바꿔
    // 각 줄(flowTops)·사진(flowBands)의 세로 위치를 구한다.
    var inImgs = node.images && node.images.length ? node.images : null;
    var inScaled = null, flowTops = null, flowBands = null;
    var flowH = node._lines.length * node._lineH;
    if (inImgs) {
      var innerW2 = Math.max(40, node._w - PAD_X * 2);
      inScaled = inImgs.map(function (im) {
        var s2 = Math.min(1, innerW2 / Math.max(1, im.w));
        return { w: Math.round(im.w * s2), h: Math.round(im.h * s2) };
      });
      var ws2 = (node._manualStarts && node._manualStarts.length) ? node._manualStarts : [0];
      var insAt2 = inImgs.map(function (im) {
        var a2 = Math.max(0, Math.round(im.afterLine || 0));
        return a2 < ws2.length ? ws2[a2] : node._lines.length;
      });
      flowTops = []; flowBands = [];
      var yy = 0, IPAD = 3;
      for (var fi = 0; fi <= node._lines.length; fi++) {
        for (var fk = 0; fk < inImgs.length; fk++) {
          if (insAt2[fk] !== fi) continue;
          flowBands.push({ idx: fk, top: yy + IPAD });
          yy += inScaled[fk].h + IPAD * 2;
        }
        if (fi < node._lines.length) { flowTops.push(yy); yy += node._lineH; }
      }
      flowH = yy;
    }
    // 노드 안 사진(레거시 단일 — 텍스트 아래) — 인라인 사진이 있으면 생략
    var img = null;
    if (!inImgs && node.image && node.image.src) {
      var innerW = Math.max(40, node._w - PAD_X * 2);
      var isc = Math.min(1, innerW / Math.max(1, node.image.w));
      img = { w: Math.round(node.image.w * isc), h: Math.round(node.image.h * isc) };
    }
    var imgGap = img && (node._lines.length || mdt || mdc) ? 6 : 0;
    var stacked = !!(mdt || img || inImgs || mdc); // 표·코드·사진이 있으면 세로 스택
    var cBlockH = mdc ? cH + cGapAbove + cGapBelow : 0;
    var contentH = flowH +
      tBlockH + cBlockH + (img ? img.h + imgGap : 0);
    var topY = node._cy - contentH / 2;
    var anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
    // 체크리스트 항목(- [x] …) — 에디터가 실어 보낸 래핑 줄 범위(_checks).
    // 항목의 모든 줄은 글리프 폭만큼 들여쓰고 첫 줄에 체크박스를 그린다
    // (읽기 전용 — 리치 노드 P2)
    var cks = node._checks || null;
    var CKW = Math.round(node._fs * 0.95) + 7;
    // 인라인 마커 상태를 자동 줄바꿈 사이로 이월 (수동 \n 시작 줄에서 리셋)
    var markCarry;
    for (var li = 0; li < node._lines.length; li++) {
      // 인라인 강조(부분 텍스트) — 에디터 inlineMarks.ts와 동일 규칙:
      // **굵게** *기울임* ~~취소선~~ __밑줄__ ==하이라이트== (마커는 숨김)
      if (!node._manualStarts || node._manualStarts.indexOf(li) >= 0) markCarry = undefined;
      var segParse = parseInlineSegsState(node._lines[li], markCarry);
      markCarry = segParse.end;
      var segs = segParse.segs;
      var segWs = [], lw2 = 0, si;
      var baseW2 = isRoot ? 700 : (depth === 1 ? 600 : 500);
      for (si = 0; si < segs.length; si++) {
        segWs.push(measureReal(segs[si].t, node._fs,
          segs[si].b ? 700 : baseW2, segs[si].i,
          segs[si].c ? CODE_FONT : node._ff));
        lw2 += segWs[si];
      }
      // 이 줄이 체크 항목에 속하면 글리프 폭을 줄 폭에 더한다 (들여쓰기)
      var ck0 = null;
      if (cks) {
        for (var cki = 0; cki < cks.length; cki++) {
          if (li >= cks[cki].a && li < cks[cki].e) { ck0 = cks[cki]; break; }
        }
      }
      var ckw2 = ck0 ? CKW : 0;
      lw2 += ckw2;
      // 표(tAt)·코드 패널(cAt) 뒤 줄은 그 높이만큼 아래로 (원문 순서 보존)
      var baseY = stacked
        ? topY + (flowTops ? flowTops[li] : li * node._lineH) +
          (mdt && li >= tAt ? tBlockH : 0) +
          (mdc && li >= cAt ? cBlockH : 0) +
          node._lineH / 2 + node._fs * 0.34
        : y0 + PAD_Y + node._fs * 0.85 + li * node._lineH;
      // 중앙 정렬은 아이콘(왼쪽)·마커(오른쪽) 영역을 뺀 띠의 중앙 —
      // 박스 중앙 기준이면 긴 줄이 아이콘/마커와 겹친다 (에디터와 동일 보정)
      var iconW2 = node.icon ? node._fs + 6 : 0;
      var mW2 = node._marksW != null ? node._marksW
        : (markerCount(node) ? markerCount(node) * (node._fs + 1 + 3) + 5 : 0);
      var sx = align === 'center'
        ? x0 + node._w / 2 + (iconW2 - mW2) / 2 - lw2 / 2
        : (align === 'right' ? x0 + node._w - PAD_X - mW2 - lw2 : tx);
      if (ck0 && li === ck0.a) {
        // 체크박스 글리프 — 항목 첫 줄 왼쪽 (에디터와 동일 좌표 규칙).
        // **누를 수 있다** (2026-08-09 요청) — 예전에는 읽기 전용이라
        // 뷰어에서 할 일을 표시할 수 없었다. 토글은 이 브라우저에
        // 저장되어(localStorage) 다시 열어도 남는다 — 원본 맵 파일은
        // 바뀌지 않으므로, 맵에 남기려면 에디터에서 체크해야 한다.
        var bs = Math.round(node._fs * 0.95);
        var bx3 = sx, by3 = (baseY - node._fs * 0.34) - bs / 2;
        var ckOn = checkState(node.id, ck0.s, ck0.c);
        var ckG = el('g', { 'class': 'mm-check', style: 'cursor:pointer' }, g);
        var ttl = el('title', {}, ckG);
        ttl.textContent = ckOn ? '클릭하면 미완료로' : '클릭하면 완료로';
        el('rect', { x: bx3, y: by3, width: bs, height: bs, rx: 3,
          fill: ckOn ? '#22A06B' : 'none',
          stroke: ckOn ? '#22A06B' : '#8B94A3', 'stroke-width': 1.5,
          'data-viewer-check': ckOn ? '1' : '0' }, ckG);
        if (ckOn) {
          el('path', { d: 'M ' + (bx3 + bs * 0.24) + ' ' + (by3 + bs * 0.54) +
            ' L ' + (bx3 + bs * 0.44) + ' ' + (by3 + bs * 0.72) +
            ' L ' + (bx3 + bs * 0.78) + ' ' + (by3 + bs * 0.3),
            fill: 'none', stroke: '#fff', 'stroke-width': 1.8,
            'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ckG);
        }
        // 누르기 쉬우라고 **글리프보다 넓은 투명 판**을 덮는다 —
        // 13px 사각형만 판정하면 조금만 빗나가도 노드가 선택된다
        var pad = 6;
        var hitR = el('rect', { x: bx3 - pad, y: by3 - pad,
          width: bs + pad * 2, height: bs + pad * 2,
          fill: 'transparent' }, ckG);
        (function (nid, seq2) {
          hitR.addEventListener('click', function (ev) {
            ev.stopPropagation();
            toggleCheck(nid, seq2);
          });
        })(node.id, ck0.s);
      }
      var segX = [], accX = sx + ckw2;
      for (si = 0; si < segs.length; si++) { segX.push(accX); accX += segWs[si]; }
      for (si = 0; si < segs.length; si++) {
        if ((st.highlight || segs[si].h) && segs[si].t.replace(/\s/g, '')) {
          el('rect', { x: segX[si] - 2, y: baseY - node._fs * 1.06,
            width: segWs[si] + 4, height: node._fs * 1.44, rx: 2,
            fill: SKIN.hl }, g);
        } else if (segs[si].c && segs[si].t.replace(/\s/g, '')) {
          // 인라인 코드 — 회색 배경 띠 (에디터와 동일 고정색)
          el('rect', { x: segX[si] - 2, y: baseY - node._fs * 1.06,
            width: segWs[si] + 4, height: node._fs * 1.44, rx: 3,
            fill: CODE_BG }, g);
        }
      }
      var tEl = el('text', { y: baseY, 'font-size': node._fs, fill: textColor }, g);
      if (node._ff) tEl.setAttribute('font-family', node._ff);
      for (si = 0; si < segs.length; si++) {
        var sp = el('tspan', {
          x: segX[si],
          'font-weight': segs[si].b ? 700 : (isRoot ? 700 : (depth === 1 ? 600 : 500)),
          'font-style': segs[si].i ? 'italic' : 'normal'
        }, tEl);
        // 형광펜(노란 띠) 위 글자는 진한 고정색 — 다크 모드에서 밝은
        // 글자가 노란 배경에 묻히던 문제. 단 지정 글자색이 있으면 그
        // 색이 우선 (에디터와 동일 규칙)
        if (st.highlight || segs[si].h) sp.setAttribute('fill', st.textColor || '#1F1B16');
        else if (segs[si].c) {
          sp.setAttribute('fill', CODE_TEXT);
          sp.setAttribute('font-family', CODE_FONT);
        }
        var deco = [];
        if (st.strike || segs[si].s) deco.push('line-through');
        if (st.underline || segs[si].u) deco.push('underline');
        if (deco.length) sp.setAttribute('text-decoration', deco.join(' '));
        sp.textContent = segs[si].t;
      }
    }
    if (mdt) {
      // Markdown 표 그리기 — 헤더 행 배경 + 격자선 + 셀 텍스트
      var gridC = color || textColor;
      var tblX = x0 + PAD_X;
      // 원문 위치: 표 앞 텍스트 아래, 표 뒤 텍스트 위 (에디터 파리티).
      // 블록 맨 위 13px = 복사(⧉) 스트립, 격자는 그 아래
      var tStripY = topY + (tAt >= node._lines.length
        ? flowH
        : (tAt > 0
            ? (flowTops ? flowTops[tAt - 1] : (tAt - 1) * node._lineH) + node._lineH
            : 0)) + tGapAbove;
      var tblY = tStripY + 13;
      var colWs = [], ci, ri, mmax;
      for (ci = 0; ci < mdt.headers.length; ci++) {
        mmax = measureText(mdt.headers[ci], cellFs);
        for (ri = 0; ri < mdt.rows.length; ri++) {
          mmax = Math.max(mmax, measureText(mdt.rows[ri][ci] || '', cellFs));
        }
        colWs.push(Math.max(26, Math.ceil(mmax) + 12));
      }
      var tblW = 0;
      for (ci = 0; ci < colWs.length; ci++) tblW += colWs[ci];
      el('rect', { x: tblX, y: tblY, width: tblW, height: rowH2,
        fill: gridC, opacity: 0.16 }, g);
      el('rect', { x: tblX, y: tblY, width: tblW, height: tblH, fill: 'none',
        stroke: gridC, 'stroke-width': 1, opacity: 0.75 }, g);
      var allRows = [mdt.headers].concat(mdt.rows);
      for (ri = 1; ri < allRows.length; ri++) {
        el('line', { x1: tblX, y1: tblY + ri * rowH2, x2: tblX + tblW, y2: tblY + ri * rowH2,
          stroke: gridC, 'stroke-width': 0.7, opacity: 0.55 }, g);
      }
      var vlx = tblX;
      for (ci = 1; ci < colWs.length; ci++) {
        vlx += colWs[ci - 1];
        el('line', { x1: vlx, y1: tblY, x2: vlx, y2: tblY + tblH,
          stroke: gridC, 'stroke-width': 0.7, opacity: 0.55 }, g);
      }
      for (ri = 0; ri < allRows.length; ri++) {
        var cellX = tblX;
        for (ci = 0; ci < allRows[ri].length; ci++) {
          var cellT = el('text', {
            x: cellX + 6, y: tblY + ri * rowH2 + rowH2 / 2 + cellFs * 0.34,
            'font-size': cellFs, 'font-weight': ri === 0 ? 700 : 400, fill: textColor
          }, g);
          if (node._ff) cellT.setAttribute('font-family', node._ff);
          cellT.textContent = allRows[ri][ci];
          cellX += colWs[ci];
        }
      }
      // 표 복사(⧉) — 표 바깥 오른쪽 위 스트립 (머리글과 겹치지 않음,
      // 에디터 파리티: 엑셀·웹 에디터 붙여넣기)
      var tCopyHit = el('rect', { x: tblX + tblW - cellFs * 2.2, y: tStripY,
        width: cellFs * 2.2, height: 13, fill: 'transparent' }, g);
      var tCopyT = el('text', { x: tblX + tblW, y: tStripY + 6.5 + cellFs * 0.34,
        'text-anchor': 'end', 'font-size': Math.max(8, cellFs - 1),
        'font-weight': 700, fill: '#475569' }, g);
      tCopyT.textContent = '⧉';
      tCopyT.setAttribute('title', '표 복사 — 엑셀·웹 편집기에 붙여넣을 수 있습니다');
      tCopyT.style.cursor = 'pointer';
      tCopyHit.style.cursor = 'pointer';
      (function (hdrs, rws, btnEl, hitEl) {
        var run = function (ev) {
          ev.stopPropagation();
          copyTableData(hdrs, rws, btnEl);
        };
        btnEl.addEventListener('click', run);
        hitEl.addEventListener('click', run);
      })(mdt.headers, mdt.rows, tCopyT, tCopyHit);
    }
    if (mdc) {
      // 노드 속 코드 블록 — 헤더(언어 라벨 + ⧉ 복사) + 모노 줄 (에디터 파리티)
      // 패널 상단 — 텍스트 중간이면 그 줄 경계, 끝이면 표 아래 (에디터 동일)
      var cBoundY = cAt >= node._lines.length
        ? flowH + tBlockH
        : (cAt > 0
            ? (flowTops ? flowTops[cAt - 1] : (cAt - 1) * node._lineH) + node._lineH
            : 0);
      var codeY = topY + cBoundY + cGapAbove;
      var codeX = node._cx - cW / 2;
      el('rect', { x: codeX, y: codeY, width: cW, height: cH, rx: 5,
        fill: CODE_BG, stroke: '#D8DDE4', 'stroke-width': 1 }, g);
      el('line', { x1: codeX, x2: codeX + cW, y1: codeY + cHeadH, y2: codeY + cHeadH,
        stroke: '#D8DDE4', 'stroke-width': 1 }, g);
      var headBase = codeY + cHeadH / 2 + cHeadFs * 0.34;
      var langT = el('text', { x: codeX + CPX, y: headBase, 'text-anchor': 'start',
        'font-size': cHeadFs, fill: '#64748B', 'font-family': CODE_FONT }, g);
      langT.textContent = mdc.lang || 'code';
      var copyT = el('text', { x: codeX + cW - CPX, y: headBase, 'text-anchor': 'end',
        'font-size': cHeadFs, fill: '#475569' }, g);
      copyT.textContent = '⧉';
      copyT.setAttribute('title', '코드 복사');
      copyT.style.cursor = 'pointer';
      (function (codeJoined, btnEl) {
        btnEl.addEventListener('click', function (ev) {
          ev.stopPropagation();
          copyText(codeJoined, btnEl);
        });
      })(mdc.code.join('\n'), copyT);
      for (var cli = 0; cli < mdc.code.length; cli++) {
        var cLine = mdc.code[cli].replace(/ /g, '\u00A0');
        var cT = el('text', {
          x: gridXAttr(cLine, cFs, codeX + CPX),
          y: codeY + cHeadH + CPY + cli * cLineH + cLineH / 2 + cFs * 0.34,
          'text-anchor': 'start', 'font-size': cFs, fill: CODE_TEXT,
          'font-family': CODE_FONT
        }, g);
        cT.setAttribute('xml:space', 'preserve');
        cT.textContent = cLine;
      }
    }
    if (flowBands) {
      // 텍스트 중간 인라인 사진 — 원문 위치(afterLine) 밴드에 그린다
      for (var bi = 0; bi < flowBands.length; bi++) {
        var bd = flowBands[bi];
        el('image', {
          href: inImgs[bd.idx].src,
          x: node._cx - inScaled[bd.idx].w / 2, y: topY + bd.top,
          width: inScaled[bd.idx].w, height: inScaled[bd.idx].h,
          preserveAspectRatio: 'xMidYMid meet'
        }, g);
      }
    }
    if (img) {
      // 노드 안 사진 — 텍스트(·표) 아래 가운데 정렬
      var imgY = topY + contentH - img.h;
      el('image', {
        href: node.image.src,
        x: node._cx - img.w / 2, y: imgY,
        width: img.w, height: img.h,
        preserveAspectRatio: 'xMidYMid meet'
      }, g);
    }

    if (node.tags && node.tags.length) {
      var bx2 = x0 + 6;
      for (var ti = 0; ti < node.tags.length; ti++) {
        var label = node.tags[ti];
        var bw2 = measureText(label, 9.5) + 14;
        // 배경을 불투명하게(흰 바탕 + 파스텔 칩) — 반투명이면 뒤로 지나가는
        // 연결선이 비쳐 태그와 겹쳐 보인다.
        el('rect', { x: bx2, y: node._cy + node._h / 2 + 4, width: bw2, height: TAG_H,
          rx: 3, fill: SKIN.tagBase }, g);
        el('rect', { x: bx2, y: node._cy + node._h / 2 + 4, width: bw2, height: TAG_H,
          rx: 3, fill: color + '1A', stroke: color + '55', 'stroke-width': 0.8 }, g);
        var bt = el('text', { x: bx2 + 7, y: node._cy + node._h / 2 + 4 + TAG_H - 4,
          'font-size': 9.5, 'font-weight': 600, fill: color }, g);
        bt.textContent = label;
        bx2 += bw2 + 4;
      }
    }

    // Content markers — one per kind, sized like the node's leading icon
    // (에디터 인디케이터와 동일: 🔗 링크, 📝 노트, 📎 파일, ▶️ 멀티미디어).
    // 툴팁·클릭 동작 모두 에디터 파리티(nodeContent.ts): 호버 = 복수면
    // "종류 N개", 단수면 이름/URL. 클릭 = 단수는 바로 열고, 복수는 마커
    // 옆 선택 팝업(openChooser). 노트만 상세 패널(에디터 노트 뷰어 팝업도
    // 우상단이라 파리티가 맞다).
    var files = [], media = [], ai;
    if (node.attachments) {
      for (ai = 0; ai < node.attachments.length; ai++) {
        (node.attachments[ai].kind === 'audio' || node.attachments[ai].kind === 'video'
          ? media : files).push(node.attachments[ai]);
      }
    }
    var markers = [];
    function attachmentRows(arr, icon) {
      var rows = [];
      for (var i2 = 0; i2 < arr.length; i2++) {
        rows.push({
          icon: icon,
          label: arr[i2].name + (arr[i2].href ? (arr[i2].external ? ' ↗' : '') : ' (파일 없음)'),
          title: arr[i2].name,
          act: openAttachmentHref(arr[i2])
        });
      }
      return rows;
    }
    if (node.links && node.links.length) {
      (function (links) {
        markers.push({ kind: 'link', n: links.length,
          tip: links.length > 1 ? '링크 ' + links.length + '개'
            : (links[0].label || links[0].url),
          act: (links.length === 1
          ? function () { window.open(links[0].url, '_blank'); }
          : function (mk) {
              var rows = [];
              for (var li = 0; li < links.length; li++) {
                (function (l) {
                  rows.push({ icon: '🔗', label: l.label || l.url, title: l.url,
                    act: function () { window.open(l.url, '_blank'); } });
                })(links[li]);
              }
              openChooser(mk, rows);
            }) });
      })(node.links);
    }
    if (node.notes && node.notes.length) {
      // 노트 종류별 개별 마커 — 클릭하면 그 종류의 노트만 상세 패널에 표시
      for (var nk = 0; nk < NOTE_KIND_ORDER.length; nk++) {
        (function (kind) {
          var def = NOTE_STYLE[kind];
          var blocks = notesOf(node, def.type);
          if (!blocks.length) return;
          markers.push({
            kind: kind, n: blocks.length,
            tip: blocks.length > 1 ? def.label + ' ' + blocks.length + '개' : def.label,
            act: function () { showDetail(node, kind); }
          });
        })(NOTE_KIND_ORDER[nk]);
      }
    }
    if (files.length) {
      markers.push({ kind: 'file', n: files.length,
        tip: files.length > 1 ? '첨부파일 ' + files.length + '개' : files[0].name,
        act: (files.length === 1 && files[0].href
        ? function () { window.open(files[0].href, '_blank'); }
        : function (mk) { openChooser(mk, attachmentRows(files, '📎')); }) });
    }
    if (media.length) {
      markers.push({ kind: 'media', n: media.length,
        tip: media.length > 1 ? '멀티미디어 ' + media.length + '개' : media[0].name,
        act: (media.length === 1 && media[0].href
        ? function () { window.open(media[0].href, '_blank'); }
        : function (mk) { openChooser(mk, attachmentRows(media, '▶️')); }) });
    }
    if (markers.length) {
      var mfs = node._fs + 1; // same size as the node's leading icon
      // INSIDE the box, right of the text (leading-icon style) — the measure
      // pass reserved node._marksW so every marker fits within the border.
      var mx0 = x0 + node._w - PAD_X - markers.length * (mfs + 3) + 3;
      for (var mi = 0; mi < markers.length; mi++) {
        var mk = drawMarkerGlyph(g, markers[mi].kind, mx0 + mfs / 2, node._cy, mfs + 2);
        if (markers[mi].tip) {
          var tt = el('title', {}, mk); // SVG 네이티브 툴팁 — 호버 시 URL/이름 표시
          tt.textContent = markers[mi].tip;
        }
        // 개수 배지 — 2개 이상이면 글리프 오른쪽 위에 작은 숫자.
        // 에디터 NodeRenderer 와 같은 규칙·같은 자리(icSize/2+2, -icSize/2+3).
        // 없으면 "몇 개가 들어 있는지" 열어 보기 전에는 알 수 없다.
        if (markers[mi].n > 1) {
          var icS = mfs + 2;
          var cnt = el('text', {
            x: mx0 + mfs / 2 + icS / 2 + 2, y: node._cy - icS / 2 + 3,
            'font-size': 8, 'font-weight': 700, fill: SKIN.accent,
            'text-anchor': 'middle', 'data-marker-count': markers[mi].kind
          }, mk);
          cnt.textContent = String(markers[mi].n);
        }
        (function (act, mkEl) {
          mkEl.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
          // act는 마커 엘리먼트를 받는다 — 선택 팝업을 마커 옆에 띄운다.
          mkEl.addEventListener('click', function (ev) { ev.stopPropagation(); act(mkEl); });
        })(markers[mi].act, mk);
        mx0 += mfs + 3;
      }
    }

    if (kids.length) {
      // 접기 토글 위치 — 레이아웃 종류로 "결정론적으로" 정한다. 예전의
      // 자식 좌표 평균 방향 방식은 같은 레이아웃에서도 자식 수·높이에
      // 따라 노드마다 하단/오른쪽이 뒤섞이는 문제가 있었다 (2026-07:
      // 트리·오른쪽에서 자식이 적은 노드만 토글이 오른쪽에 붙던 현상).
      // 방사형·양쪽/타임라인처럼 방향이 데이터에 달린 레이아웃만 자식
      // 좌표 평균으로 판단한다. (에디터 CollapseControl과 동일 규칙)
      var effT = node._eff || '';
      var sd = node.side;
      if (node._open) {
        var adx = 0, ady = 0, acnt = 0;
        for (var kg = 0; kg < kids.length; kg++) {
          if (kids[kg]._cx == null) continue;
          adx += kids[kg]._cx - node._cx;
          ady += kids[kg]._cy - node._cy;
          acnt++;
        }
        if (acnt) {
          sd = Math.abs(ady) > Math.abs(adx)
            ? (ady > 0 ? 'down' : 'up')
            : (adx > 0 ? 'right' : 'left');
        }
      }
      // **연결선이 노드를 떠나는 지점**에 아이콘을 놓는다 (2026-08-05).
      // 트리·진행트리는 변 한가운데가 아니라 왼쪽 스파인에서 선이
      // 시작한다 — drawEdge 의 경로 시작점과 한 쌍이다.
      // (에디터 collapseAnchor.ts 와 같은 규칙)
      var cnt0 = node._open ? '' : String(countDescendants(node));
      var cr0 = node._open ? 8.5 : (cnt0.length >= 3 ? 13 : cnt0.length === 2 ? 10.5 : 8.5);
      var OUT = cr0 + 1, OUTLINE_INSET = 12, PROCESS_INSET = 14;
      var bx0 = x0, bx1 = x0 + node._w;
      var byTop = node._cy - node._h / 2, byBot = node._cy + node._h / 2;
      var ccx, ccy;
      if (effT.indexOf('process-tree') === 0) {
        ccx = bx0 + PROCESS_INSET; ccy = byBot + OUT;
      } else if (effT === 'tree' || effT === 'tree-right') {
        ccx = bx0 + OUTLINE_INSET; ccy = byBot + OUT;
      } else if (effT === 'tree-down') {
        ccx = node._cx; ccy = byBot + OUT;
      } else if (effT === 'timeline' || effT === 'timeline-center') {
        if (depth === 0) { ccx = bx1 + OUT; ccy = node._cy; }
        else if (node.side === 'up') { ccx = bx0 + OUTLINE_INSET; ccy = byTop - OUT; }
        else { ccx = bx0 + OUTLINE_INSET; ccy = byBot + OUT; }
      } else if (effT === 'hierarchy-right' || effT === 'radial-right' ||
                 effT === 'freeform' || effT === 'free') {
        ccx = bx1 + OUT; ccy = node._cy;
      } else if (effT === 'hierarchy-left' || effT === 'radial-left') {
        ccx = bx0 - OUT; ccy = node._cy;
      } else if (effT === 'radial' || effT === 'both-radial' ||
                 effT === 'radial-bidirectional') {
        if (node.side === 'left') { ccx = bx0 - OUT; ccy = node._cy; }
        else { ccx = bx1 + OUT; ccy = node._cy; }
      } else if (sd === 'down') { ccx = node._cx; ccy = byBot + OUT; }
      else if (sd === 'up') { ccx = node._cx; ccy = byTop - OUT; }
      else if (sd === 'left') { ccx = bx0 - OUT; ccy = node._cy; }
      else { ccx = bx1 + OUT; ccy = node._cy; }
      // 펼쳐진 노드의 접기(−) 토글은 항상 보이지 않고 노드에 마우스를
      // 올렸을 때만 나타난다 (에디터와 동일). 접힌 노드의 +N 배지는 숨은
      // 서브트리를 알려야 하므로 항상 표시.
      // 펼침 '−' 칩은 호버 표시용으로 노드 그룹에, 접힘 +N 칩은 숫자가
      // 가려지지 않게 최상위 chipLayer에 그린다
      var chip = el('g', { cursor: 'pointer',
        'class': node._open ? 'mm-toggle mm-toggle-open' : 'mm-toggle' },
        node._open ? g : chipLayer);
      var cnt = cnt0;
      // 숫자 자릿수에 맞춰 칩 크기 확대 (두 자리 10.5, 세 자리+ 13)
      var cr = cr0;
      el('circle', { cx: ccx, cy: ccy, r: cr, fill: node._open ? SKIN.fam.l2.fill : color,
        stroke: color, 'stroke-width': 1.3 }, chip);
      var chTitle = el('title', {}, chip);
      chTitle.textContent = node._open ? '접기' : ('펼치기 — 숨은 노드 ' + cnt + '개');
      var ct = el('text', { x: ccx, y: ccy + 3.4, 'text-anchor': 'middle',
        'font-size': 9.5, 'font-weight': 700, fill: node._open ? color : '#FFFFFF' }, chip);
      ct.textContent = node._open ? '−' : cnt;
      (function (n) {
        chip.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        chip.addEventListener('click', function (ev) {
          ev.stopPropagation();
          n.collapsed = !n.collapsed;
          DYN = true; // 이후로는 에디터처럼 접기/펴기 시 간격 재배치
          render();
        });
      })(node);
    }
  }

  function countDescendants(node) {
    var c = 0, kids = node.children || [];
    for (var i = 0; i < kids.length; i++) c += 1 + countDescendants(kids[i]);
    return c;
  }

  // Detail panel: everything attached to a node — tags, hyperlinks, notes,
  // and attachments (packaged files link to ./files/…, external ones to the
  // original URL with an ↗ mark).
  function section(title) {
    var h = document.createElement('div');
    h.className = 'mm-sec';
    h.textContent = title;
    noteBody.appendChild(h);
  }
  // 표 복사 — 엑셀(TSV)·웹 에디터(HTML 표) 두 형식 동시 (에디터 파리티)
  function copyTableData(headers, rows, btn) {
    function done() {
      var prev = btn.textContent;
      btn.textContent = '복사됨 ✓';
      setTimeout(function () { btn.textContent = prev; }, 1200);
    }
    function escH(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    // 인라인 테두리 스타일 — 웹 에디터가 style 블록은 버려도 인라인
    // 속성은 유지한다 (에디터 copyTable과 동일 규칙)
    var CELL_ST = 'border:1px solid #999;padding:4px 8px;';
    var TH_ST = CELL_ST + 'background:#F1F3F5;font-weight:700;text-align:left;';
    var all = [headers].concat(rows);
    var html = '<table style="border-collapse:collapse;border:1px solid #999;"><thead><tr>' +
      headers.map(function (c) { return '<th style="' + TH_ST + '">' + escH(c) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + r.map(function (c) { return '<td style="' + CELL_ST + '">' + escH(c) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
    var tsv = all.map(function (r) {
      return r.map(function (c) { return String(c).replace(/\t/g, ' '); }).join('\t');
    }).join('\n');
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([tsv], { type: 'text/plain' })
      })]).then(done, function () { fallbackCopy(tsv); done(); });
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tsv).then(done, function () { fallbackCopy(tsv); done(); });
    } else { fallbackCopy(tsv); done(); }
  }

  function copyText(text, btn) {
    function done() {
      var prev = btn.textContent;
      btn.textContent = '복사됨 ✓';
      setTimeout(function () { btn.textContent = prev; }, 1200);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function renderNoteBlock(note) {
    // 폐기된 옛 타입(warning/tip)은 문단으로 렌더링 (하위호환)
    var type = note.type === 'warning' || note.type === 'tip' ? 'paragraph' : note.type;

    // 리치 문단(웹 기사 붙여넣기) — 에디터에서 sanitize된 HTML을 그대로 표시
    if (type === 'paragraph' && note.html) {
      var rich = document.createElement('div');
      rich.className = 'mm-note-block mm-note-rich';
      rich.innerHTML = note.html;
      return rich;
    }

    if (type === 'table') {
      // 줄 = 행, '|' = 열. 첫 행은 헤더. 우상단 ⧉ 복사 (엑셀·웹 에디터)
      var tblWrap = document.createElement('div');
      tblWrap.style.position = 'relative';
      // 표 바깥 위 복사(⧉) 스트립 예약 — 머리글과 겹치지 않음 (2026-07-31)
      tblWrap.style.paddingTop = '18px';
      var tbl = document.createElement('table');
      tbl.className = 'mm-table';
      var rows = String(note.text || '').split('\n');
      var tblData = [];
      for (var r = 0; r < rows.length; r++) {
        if (!rows[r].trim()) continue;
        if (/^[\s|:\-]+$/.test(rows[r])) continue; // 구분선 행 제외
        var tr = document.createElement('tr');
        var cells = rows[r].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
        var rowCells = [];
        for (var cIdx = 0; cIdx < cells.length; cIdx++) {
          var cell = document.createElement(tblData.length === 0 ? 'th' : 'td');
          cell.textContent = cells[cIdx].trim();
          rowCells.push(cells[cIdx].trim());
          tr.appendChild(cell);
        }
        tblData.push(rowCells);
        tbl.appendChild(tr);
      }
      var tBtn = document.createElement('button');
      tBtn.className = 'mm-copy';
      tBtn.textContent = '⧉';
      tBtn.setAttribute('title', '표 복사 — 엑셀·웹 편집기에 붙여넣을 수 있습니다');
      tBtn.style.position = 'absolute';
      tBtn.style.top = '0';
      tBtn.style.right = '0';
      (function (data, b) {
        b.addEventListener('click', function () {
          if (data.length > 1) copyTableData(data[0], data.slice(1), b);
        });
      })(tblData, tBtn);
      tblWrap.appendChild(tBtn);
      tblWrap.appendChild(tbl);
      return tblWrap;
    }

    if (type === 'code_block') {
      var wrap = document.createElement('div');
      wrap.className = 'mm-code';
      var head = document.createElement('div');
      head.className = 'mm-code-head';
      var langEl = document.createElement('span');
      langEl.textContent = note.lang || 'code';
      var btn = document.createElement('button');
      btn.className = 'mm-copy';
      btn.textContent = '⧉';
      btn.setAttribute('title', '코드 복사');
      (function (text, b) {
        b.addEventListener('click', function () { copyText(text, b); });
      })(note.text, btn);
      head.appendChild(langEl);
      head.appendChild(btn);
      var pre = document.createElement('pre');
      pre.textContent = note.text;
      wrap.appendChild(head);
      wrap.appendChild(pre);
      return wrap;
    }

    var pEl = document.createElement('div');
    pEl.className = 'mm-note-block mm-note-' + type;
    if (type === 'checklist') {
      // 체크 글리프를 **누를 수 있다** — 맵 노드의 체크와 같은 규칙으로
      // 이 브라우저(localStorage)에 저장된다. 원본 맵 파일은 그대로다.
      var on = noteCheckState(note);
      var gl = document.createElement('span');
      gl.className = 'mm-note-check';
      gl.setAttribute('data-viewer-note-check', on ? '1' : '0');
      gl.textContent = on ? '☑' : '☐';
      gl.setAttribute('title', on ? '클릭하면 미완료로' : '클릭하면 완료로');
      var txt = document.createElement('span');
      txt.textContent = ' ' + note.text;
      // 완료해도 **취소선을 긋지 않는다** (2026-08-09 사용자 결정) —
      // 맵 노드 안의 체크는 안 긋는데 여기만 그어 규칙이 갈렸다.
      if (note.id) {
        gl.style.cursor = 'pointer';
        (function (nt, span) {
          span.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var next = !noteCheckState(nt);
            setNoteCheck(nt, next);
            span.textContent = next ? '☑' : '☐';
            span.setAttribute('data-viewer-note-check', next ? '1' : '0');
            span.setAttribute('title', next ? '클릭하면 미완료로' : '클릭하면 완료로');
          });
        })(note, gl);
      }
      pEl.appendChild(gl);
      pEl.appendChild(txt);
      return pEl;
    }
    pEl.textContent = note.text;
    return pEl;
  }

  function attachmentRow(att, icon) {
    var row = document.createElement('div');
    row.className = 'mm-note-block';
    if (att.href) {
      var a = document.createElement('a');
      a.href = att.href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = icon + ' ' + att.name + (att.external ? ' ↗' : '');
      if (!att.external) a.setAttribute('download', att.name);
      row.appendChild(a);
    } else {
      row.textContent = icon + ' ' + att.name + ' (파일 없음)';
    }
    return row;
  }

  // kind: 'links' | 'notes' | 'files' | 'media' — 클릭한 마커의 정보만 표시.
  function showDetail(node, kind) {
    // 제목은 **원문 그대로가 아니라** 블록 마커를 접어 보여 준다 —
    // 체크 노드는 '- [x] 할링\n- [ ] 할리2' 가 그대로 찍혀 엉망이었다
    // (2026-08-09 보고). 아웃라인·검색 결과와 같은 flattenText 규칙.
    noteTitle.textContent = flattenText(node.text);
    noteBody.textContent = '';
    var i, a, row;

    if (kind === 'links' && node.links) {
      section('링크');
      for (i = 0; i < node.links.length; i++) {
        row = document.createElement('div');
        row.className = 'mm-note-block';
        a = document.createElement('a');
        a.href = node.links[i].url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = '🔗 ' + (node.links[i].label || node.links[i].url);
        row.appendChild(a);
        noteBody.appendChild(row);
      }
    }

    if (kind === 'notes' && node.notes) {
      section('메모');
      for (i = 0; i < node.notes.length; i++) {
        noteBody.appendChild(renderNoteBlock(node.notes[i]));
      }
    }

    // 노트 종류별 상세 — 클릭한 마커의 종류(문단/코드/표/체크)만 표시
    if (NOTE_STYLE[kind]) {
      var noteDef = NOTE_STYLE[kind];
      section(noteDef.label);
      var typed = notesOf(node, noteDef.type);
      for (i = 0; i < typed.length; i++) {
        noteBody.appendChild(renderNoteBlock(typed[i]));
      }
    }

    if ((kind === 'files' || kind === 'media') && node.attachments) {
      var wantMedia = kind === 'media';
      section(wantMedia ? '멀티미디어' : '첨부 파일');
      for (i = 0; i < node.attachments.length; i++) {
        var att = node.attachments[i];
        var isMedia = att.kind === 'audio' || att.kind === 'video';
        if (isMedia !== wantMedia) continue;
        noteBody.appendChild(attachmentRow(att, wantMedia ? '▶️' : '📎'));
      }
    }

    notePanel.style.display = 'block';
    // 자동 크기 — 에디터 노트 뷰어 팝업과 동일: 내용의 자연 크기에 맞추되
    // 최소 220×120 ~ 최대 "화면 4분할 시 우측 상단"(화면의 1/2 × 1/2).
    // 먼저 최대 폭으로 그려 내용 폭(max-content)을 재고 즉시 줄인다.
    var maxW2 = Math.floor(window.innerWidth / 2);
    var maxH2 = Math.floor(window.innerHeight / 2);
    notePanel.style.width = maxW2 + 'px';
    notePanel.style.height = 'auto';
    notePanel.style.maxHeight = maxH2 + 'px';
    var prevW3 = noteBody.style.width;
    noteBody.style.width = 'max-content';
    var natW3 = noteBody.offsetWidth;
    noteBody.style.width = prevW3;
    var w3 = Math.min(maxW2, Math.max(220, natW3 + 34));
    notePanel.style.width = w3 + 'px';
    var h3 = Math.min(maxH2, Math.max(120, notePanel.scrollHeight + 4));
    notePanel.style.height = h3 + 'px';
  }
  document.getElementById('mm-note-close').addEventListener('click', function () {
    notePanel.style.display = 'none';
  });

  // 상세 패널 이동 — 제목줄을 드래그하면 창이 움직인다 (크기 조절은
  // 우하단 모서리 드래그: CSS resize). 에디터 노트 뷰어 팝업과 동일 조작.
  (function () {
    var drag = null;
    noteTitle.addEventListener('pointerdown', function (e) {
      var r = notePanel.getBoundingClientRect();
      drag = { id: e.pointerId, px: e.clientX, py: e.clientY, left: r.left, top: r.top };
      noteTitle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    noteTitle.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      notePanel.style.right = 'auto';
      notePanel.style.left = Math.max(0, drag.left + e.clientX - drag.px) + 'px';
      notePanel.style.top = Math.max(0, drag.top + e.clientY - drag.py) + 'px';
    });
    noteTitle.addEventListener('pointerup', function (e) {
      if (drag && drag.id === e.pointerId) drag = null;
    });
  })();

  // ---- viewport: wheel zoom (cursor-anchored) + drag pan + fit ---------------
  var view = { x: 0, y: 0, k: 1 };
  var SEL = null; // 클릭으로 선택한 노드 id (⌖ 보기 대상)
  var SEARCHHIT = null; // 검색 결과로 강조할 노드 id (노란 채움 + 붉은 테두리)
  var FOCUS = null; // ⌖ Focus 모드 — 이 노드의 서브트리만 표시 (null=전체)
  function applyView() {
    world.setAttribute('transform',
      'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')');
    var pct = document.getElementById('mm-zoom-pct');
    if (pct) pct.textContent = Math.round(view.k * 100) + '%';
  }
  // 화면 중앙 기준 줌 (에디터 축소/확대 버튼과 동일: 10% 단위)
  function zoomTo(kNext) {
    var rect = svg.getBoundingClientRect();
    var cx = rect.width / 2, cy = rect.height / 2;
    var k2 = Math.min(4, Math.max(0.02, kNext));
    view.x = cx - ((cx - view.x) / view.k) * k2;
    view.y = cy - ((cy - view.y) / view.k) * k2;
    view.k = k2;
    applyView();
  }

  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = svg.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    var k2 = Math.min(4, Math.max(0.02, view.k * factor)); // 에디터와 동일 (2%~400%)
    view.x = px - ((px - view.x) / view.k) * k2;
    view.y = py - ((py - view.y) / view.k) * k2;
    view.k = k2;
    applyView();
  }, { passive: false });

  // Pan은 에디터와 동일 규칙: 기본은 꺼짐 — Pan 모드(✋ 토글)일 때의 왼쪽
  // 드래그, 또는 마우스 오른쪽/미들 버튼 드래그(임시 Pan, 떼면 해제)만.
  var panMode = false;
  var drag = null;
  svg.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  var panMoved = false; // Pan 드래그 직후의 click은 "클릭"으로 치지 않는다
  svg.addEventListener('click', function () {
    if (panMoved) { panMoved = false; return; }
    // 빈 캔버스 클릭 — 선택·검색 강조 해제 (노드 클릭은 stopPropagation)
    if (SEL || SEARCHHIT) {
      SEL = null;
      SEARCHHIT = null;
      render();
    }
  });
  svg.addEventListener('pointerdown', function (e) {
    var temp = e.button === 1 || e.button === 2;
    if (!panMode && !temp) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    svg.setPointerCapture(e.pointerId);
    svg.style.cursor = 'grabbing';
  });
  svg.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) panMoved = true;
    view.x = drag.vx + (e.clientX - drag.x);
    view.y = drag.vy + (e.clientY - drag.y);
    applyView();
  });
  svg.addEventListener('pointerup', function () {
    drag = null;
    svg.style.cursor = panMode ? 'grab' : 'default';
  });

  function fit() {
    var bb = world.getBBox();
    var rect = svg.getBoundingClientRect();
    if (!bb.width || !bb.height) return;
    var k = Math.min((rect.width - 80) / bb.width, (rect.height - 80) / bb.height, 1.6);
    view.k = k;
    view.x = (rect.width - bb.width * k) / 2 - bb.x * k;
    view.y = (rect.height - bb.height * k) / 2 - bb.y * k;
    applyView();
  }

  function setAll(node, collapsed) {
    var kids = node.children || [];
    if (kids.length) node.collapsed = collapsed;
    for (var i = 0; i < kids.length; i++) setAll(kids[i], collapsed);
  }

  function updateCount() {
    var layoutLabels = {
      'radial-bidirectional': '방사형·양쪽', 'radial-right': '방사형·오른쪽',
      'radial-left': '방사형·왼쪽', 'tree-right': '트리·오른쪽',
      'tree-down': '트리·아래', 'hierarchy-right': '계층형·오른쪽',
      'process-tree-right': '진행트리·오른쪽', 'timeline': '시간배치',
      'timeline-center': '시간배치·중앙'
    };
    var eff = normalize(DATA.root.layoutType) || 'radial-bidirectional';
    document.getElementById('mm-count').textContent =
      (1 + countDescendants(DATA.root)) + ' 노드 · ' + (layoutLabels[eff] || eff);
  }

  document.getElementById('mm-fit').addEventListener('click', fit);

  // ── 검색 — 에디터 검색 패널과 동일한 인터페이스: 입력하면 결과
  //    목록("결과 N건" + 제목·경로·일치 위치)이 드롭다운으로 나오고,
  //    결과를 클릭하면 노란 채움 + 붉은 테두리로 강조하고 접힌 조상을
  //    펼친 뒤 화면 중앙으로 이동한다. Enter = 첫(다음) 결과로 이동.
  var searchInput = document.getElementById('mm-search');
  var searchResults = document.getElementById('mm-search-results');
  var searchHits = [], searchSel = -1;
  function escapeHtml2(x) {
    return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function collectHits(q) {
    var out = [];
    (function walk(n, path) {
      var text = (n.text || '');
      var inText = text.toLowerCase().indexOf(q) >= 0;
      var inTags = (n.tags || []).some(function (tg) {
        return String(tg).toLowerCase().indexOf(q) >= 0;
      });
      var inNotes = (n.notes || []).some(function (b) {
        return String(b.text || '').toLowerCase().indexOf(q) >= 0;
      });
      var inLinks = (n.links || []).some(function (l) {
        return String(l.label || '').toLowerCase().indexOf(q) >= 0 ||
          String(l.url || '').toLowerCase().indexOf(q) >= 0;
      });
      if (inText || inTags || inNotes || inLinks) {
        var kinds = [];
        if (inText) kinds.push('노드');
        if (inTags) kinds.push('태그');
        if (inNotes) kinds.push('노트');
        if (inLinks) kinds.push('링크');
        // 제목의 블록 마커는 접어 표시 (⧉코드·☑/☐·⊞표 — P4)
        out.push({ id: n.id, title: flattenText(text), path: path.join(' › '), kinds: kinds });
      }
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], path.concat([flattenText(text)]));
    })(DATA.root, []);
    return out.slice(0, 50);
  }
  function expandTo(id) {
    var path = [];
    (function walk(n, anc) {
      if (n.id === id) { path = anc.slice(); return true; }
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) {
        if (walk(kids[i], anc.concat([n]))) return true;
      }
      return false;
    })(DATA.root, []);
    for (var i = 0; i < path.length; i++) path[i].collapsed = false;
  }
  function jumpToHit(id) {
    if (SEARCHHIT === id) {
      // 같은 결과를 다시 클릭 = 강조 해제 (선택하지 않은 상태로 복귀)
      SEARCHHIT = null;
      render();
      renderSearchList();
      return;
    }
    SEARCHHIT = id;
    if (FOCUS) { FOCUS = null; setCenterIcon(false); } // 전체 맵에서 찾는다
    expandTo(id);
    render();
    var found = null;
    (function walk(n) {
      if (n.id === id) { found = n; return; }
      var kids = n.children || [];
      for (var i = 0; i < kids.length && !found; i++) walk(kids[i]);
    })(DATA.root);
    if (found && found._cx != null) {
      // 결과 클릭 = 해당 노드를 화면 중앙 + 100% 보기 (에디터와 동일)
      var rect = svg.getBoundingClientRect();
      view.k = 1;
      view.x = rect.width / 2 - found._cx;
      view.y = rect.height / 2 - found._cy;
      applyView();
    }
    renderSearchList(); // 선택 항목 표시 갱신
    // 결과 목록이 맵(강조 노드)을 가리지 않게 닫는다 — 검색창을 다시
    // 클릭하면 목록이 다시 열린다 (강조는 유지)
    searchResults.style.display = 'none';
  }
  function renderSearchList() {
    if (!searchHits.length) {
      var q0 = (searchInput.value || '').trim();
      searchResults.style.display = q0 ? 'block' : 'none';
      searchResults.innerHTML = q0 ? '<div class="cnt">결과 0건</div>' : '';
      return;
    }
    var q = (searchInput.value || '').trim().toLowerCase();
    var html = '<div class="cnt">결과 ' + searchHits.length + '건</div>';
    for (var i = 0; i < searchHits.length; i++) {
      var h = searchHits[i];
      var t2 = escapeHtml2(h.title);
      var idx = h.title.toLowerCase().indexOf(q);
      if (idx >= 0) {
        t2 = escapeHtml2(h.title.slice(0, idx)) + '<mark>' +
          escapeHtml2(h.title.slice(idx, idx + q.length)) + '</mark>' +
          escapeHtml2(h.title.slice(idx + q.length));
      }
      // 일치 위치 배지 — 제목 앞 색 칩 ([태그] [노드] … 에디터와 동일)
      var kb2 = '';
      for (var ki = 0; ki < (h.kinds || []).length; ki++) {
        var kn = h.kinds[ki];
        var kcls = kn === '노드' ? 'kb-node' : kn === '태그' ? 'kb-tag' :
          kn === '노트' ? 'kb-note' : 'kb-link';
        kb2 += '<span class="kb ' + kcls + '">' + escapeHtml2(kn) + '</span>';
      }
      html += '<div class="hit' + (h.id === SEARCHHIT ? ' on' : '') +
        '" data-hit="' + escapeHtml2(h.id) + '" title="클릭하면 노란 강조로 표시됩니다">' +
        '<div class="ttl">' + kb2 + t2 + '</div>' +
        '<div class="sub">' + escapeHtml2(h.path || '루트') + '</div></div>';
    }
    searchResults.innerHTML = html;
    searchResults.style.display = 'block';
    var items = searchResults.querySelectorAll('.hit');
    for (var j = 0; j < items.length; j++) {
      (function (el2) {
        el2.addEventListener('click', function () {
          searchSel = Array.prototype.indexOf.call(items, el2);
          jumpToHit(el2.getAttribute('data-hit'));
        });
      })(items[j]);
    }
  }
  function runSearch() {
    var q = (searchInput.value || '').trim().toLowerCase();
    if (!q) {
      searchHits = []; searchSel = -1;
      if (SEARCHHIT) { SEARCHHIT = null; render(); }
      searchResults.style.display = 'none';
      searchResults.innerHTML = '';
      return;
    }
    searchHits = collectHits(q);
    searchSel = -1;
    renderSearchList();
  }
  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', function () {
    if ((searchInput.value || '').trim()) runSearch();
  });
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!searchHits.length) return;
      searchSel = (searchSel + 1) % searchHits.length;
      jumpToHit(searchHits[searchSel].id);
    }
    if (e.key === 'Escape') {
      searchInput.value = '';
      runSearch();
      searchInput.blur();
    }
  });
  // 바깥 클릭 시 결과 목록 닫기 (강조는 유지)
  document.addEventListener('pointerdown', function (e) {
    if (!document.getElementById('mm-search-wrap').contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });

  // ── 전체화면 모드 — 에디터 툴바와 동일 (F11식 토글, 아이콘·title 전환) ──
  var fsBtn = document.getElementById('mm-fullscreen');
  var FS_ENTER = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><polyline points="14 8 16 8 16 10"/><polyline points="10 16 8 16 8 14"/><line x1="16" y1="8" x2="12.5" y2="11.5"/><line x1="8" y1="16" x2="11.5" y2="12.5"/></svg>';
  var FS_EXIT = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><polyline points="13 9 13 11 15 11"/><polyline points="11 15 11 13 9 13"/><line x1="16" y1="8" x2="13" y2="11"/><line x1="8" y1="16" x2="11" y2="13"/></svg>';
  function syncFsBtn() {
    var on = !!document.fullscreenElement;
    fsBtn.innerHTML = on ? FS_EXIT : FS_ENTER;
    fsBtn.className = on ? 'icon active' : 'icon';
    fsBtn.setAttribute('title', on ? '전체화면 종료' : '전체화면 모드');
  }
  fsBtn.addEventListener('click', function () {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', syncFsBtn);
  document.getElementById('mm-zoom-out').addEventListener('click', function () {
    zoomTo((Math.round(view.k * 100) - 5) / 100); // 에디터와 동일: 5%p 단위
  });
  document.getElementById('mm-zoom-in').addEventListener('click', function () {
    zoomTo((Math.round(view.k * 100) + 5) / 100);
  });
  // % 클릭 = 직접 입력 (2~400 사이 숫자, Enter 적용 / Esc 취소)
  var zoomPctBtn = document.getElementById('mm-zoom-pct');
  var zoomInput = document.getElementById('mm-zoom-input');
  zoomPctBtn.addEventListener('click', function () {
    zoomInput.value = String(Math.round(view.k * 100));
    zoomPctBtn.style.display = 'none';
    zoomInput.style.display = 'inline-block';
    zoomInput.focus();
    zoomInput.select();
  });
  function commitZoomInput(apply) {
    zoomInput.style.display = 'none';
    zoomPctBtn.style.display = '';
    if (!apply) return;
    var v = parseInt(zoomInput.value, 10);
    if (!isNaN(v)) zoomTo(Math.min(400, Math.max(2, v)) / 100);
  }
  zoomInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') commitZoomInput(true);
    else if (e.key === 'Escape') commitZoomInput(false);
  });
  zoomInput.addEventListener('blur', function () { commitZoomInput(true); });
  document.getElementById('mm-zoom-100').addEventListener('click', function () {
    zoomTo(1);
  });
  // 선택 노드 화면 중앙 보기 — 배치 좌표(_cx/_cy)를 현재 줌 유지한 채 중앙에
  // ⌖ 선택 노드 화면 중앙 보기 — 에디터(Alt+F)와 동일한 토글:
  // 켜면 선택 노드(없으면 중심 주제)의 서브트리만 표시하고 화면에 맞추고,
  // 다시 누르면 전체 맵으로 복귀. 활성 상태는 버튼 하이라이트 + 아이콘
  // 전환(FocusOff)으로 표시한다.
  var centerBtn = document.getElementById('mm-center');
  function setCenterIcon(on) {
    centerBtn.innerHTML = on
      ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/><line x1="8.6" y1="8.6" x2="13.4" y2="13.4"/><line x1="13.4" y1="8.6" x2="8.6" y2="13.4"/></svg>'
      : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg>';
    centerBtn.className = on ? 'icon active' : 'icon';
    centerBtn.setAttribute('title', on
      ? '선택 노드 보기 취소 — 맵 전체 보기'
      : '선택 노드 화면 중앙 보기 (노드를 클릭해 선택 · 다시 누르면 전체 보기)');
  }
  centerBtn.addEventListener('click', function () {
    if (FOCUS) {
      FOCUS = null;
      setCenterIcon(false);
      render();
      fit();
      return;
    }
    FOCUS = SEL || DATA.root.id;
    setCenterIcon(true);
    render();
    fit(); // 그려진 것이 서브트리뿐이므로 fit = 서브트리 맞춤
  });
  var panBtn = document.getElementById('mm-pan');
  panBtn.addEventListener('click', function () {
    panMode = !panMode;
    panBtn.className = panMode ? 'icon active' : 'icon';
    document.body.classList.toggle('mm-panmode', panMode);
    svg.style.cursor = panMode ? 'grab' : 'default';
  });
  // ── 체크 상태 (2026-08-09 요청) ──────────────────────────────
  // 뷰어에서 누른 체크는 **이 브라우저에 저장**된다. 내보낸 HTML 은
  // 정적 파일이라 파일 자체를 고칠 수 없다 — 대신 파일별 키로
  // localStorage 에 담아, 같은 파일을 다시 열면 그대로 살아난다.
  //   · 키    = easymindmap.viewer.checks:<파일 경로>
  //   · 값    = { "<노드id>:<항목순번>": 1 | 0 }  (원본과 다른 것만)
  //   · 원본 = 내보낼 때의 맵 상태. 저장된 값이 없으면 원본을 쓴다.
  // ⚠️ **맵 파일에는 반영되지 않는다.** 맵에 남기려면 에디터에서 체크한
  //    뒤 다시 내보내야 한다 (뷰어는 읽기 전용 사본이다).
  var CHECK_KEY = 'easymindmap.viewer.checks:' + (location.pathname || '');
  var checkOverrides = {};
  try {
    var savedChecks = localStorage.getItem(CHECK_KEY);
    if (savedChecks) checkOverrides = JSON.parse(savedChecks) || {};
  } catch (e) { checkOverrides = {}; }
  function checkKey(nodeId, seq) { return nodeId + ':' + seq; }
  function saveChecks() {
    try { localStorage.setItem(CHECK_KEY, JSON.stringify(checkOverrides)); } catch (e) {}
  }
  // 노트 체크리스트 블록 — 열쇠는 블록 id (같은 저장소를 함께 쓴다)
  function noteCheckState(note) {
    var v = note.id ? checkOverrides['note:' + note.id] : undefined;
    return v === undefined ? !!note.checked : v === 1;
  }
  function setNoteCheck(note, on) {
    if (!note.id) return;
    checkOverrides['note:' + note.id] = on ? 1 : 0;
    saveChecks();
  }
  function checkState(nodeId, seq, base) {
    var v = checkOverrides[checkKey(nodeId, seq)];
    return v === undefined ? !!base : v === 1;
  }
  function toggleCheck(nodeId, seq) {
    var k = checkKey(nodeId, seq);
    var cur = checkOverrides[k];
    // 지금 화면 상태를 뒤집는다 — 원본을 모르는 자리에서는 base 를 찾아온다
    var base = false;
    (function scan(n) {
      if (!n) return;
      if (n.id === nodeId && n._checks) {
        for (var i = 0; i < n._checks.length; i++) {
          if (n._checks[i].s === seq) base = !!n._checks[i].c;
        }
      }
      var ks = n.children || [];
      for (var j = 0; j < ks.length; j++) scan(ks[j]);
    })(DATA.root);
    var now = cur === undefined ? base : cur === 1;
    checkOverrides[k] = now ? 0 : 1;
    saveChecks();
    render();
  }

  // 다크 모드 — 처음 열 때는 **내보낼 때의 에디터 모드**(DATA.dark)를 따른다
  // (2026-08-08 사용자 요청: "내가 본 화면 그대로 보내진다").
  // 이 파일 안에서 ☀/🌙 로 직접 바꾼 값은 파일별로 기억해 다음에 열 때
  // 유지한다 — 예전에는 저장 키가 전역이라, 다른 맵에서 한 번 다크로
  // 바꾸면 그 뒤 내보낸 파일이 전부 다크로 열렸다.
  var darkBtn = document.getElementById('mm-dark');
  var DARK_KEY = 'easymindmap.viewer.dark:' + (location.pathname || '');
  function setDark(on) {
    document.body.classList.toggle('mm-dark', on);
    darkBtn.textContent = on ? '☀' : '🌙';
    darkBtn.setAttribute('title', on ? '라이트 모드로 전환' : '다크 모드로 전환');
    SKIN = on ? SKIN_DARK : SKIN_LIGHT;
    render(); // 노드 카드·글자·연결선까지 스킨 교체 (에디터 다크와 파리티)
    try { localStorage.setItem(DARK_KEY, on ? '1' : '0'); } catch (e) {}
  }
  darkBtn.addEventListener('click', function () {
    setDark(!document.body.classList.contains('mm-dark'));
  });
  var savedDark = null;
  try { savedDark = localStorage.getItem(DARK_KEY); } catch (e) {}
  // 이 파일에서 직접 바꾼 적이 있으면 그 값, 없으면 내보낼 때의 에디터 모드
  if (savedDark === '1' || (savedDark !== '0' && DATA.dark)) setDark(true);

  // ── 커스텀 툴팁: 커서가 설명을 가리지 않게 요소 "위쪽 중앙"에 표시 ──
  var tipEl = document.createElement('div');
  tipEl.id = 'mm-tip';
  document.body.appendChild(tipEl);
  var tipSavedAttr = null, tipSavedSvg = null;
  function tipRestore() {
    if (tipSavedAttr) {
      if (!tipSavedAttr.el.getAttribute('title')) tipSavedAttr.el.setAttribute('title', tipSavedAttr.t);
      tipSavedAttr = null;
    }
    if (tipSavedSvg) {
      if (tipSavedSvg.node.parentNode !== tipSavedSvg.parent) {
        tipSavedSvg.parent.insertBefore(tipSavedSvg.node, tipSavedSvg.parent.firstChild);
      }
      tipSavedSvg = null;
    }
    tipEl.style.display = 'none';
  }
  function tipShow(anchor, text, cursorY) {
    tipEl.textContent = text;
    tipEl.style.display = 'block';
    var r = anchor.getBoundingClientRect();
    var tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var left = Math.max(4, Math.min(window.innerWidth - tw - 4, r.left + r.width / 2 - tw / 2));
    var top = r.top - th - 8;
    // 위 공간이 없어 아래에 표시할 때는 마우스 커서 그림(핫스팟 아래로
    // ~22px)보다 더 아래에 — 최상단 아이콘에서 커서가 설명을 가리던 문제
    if (top < 4) top = Math.max(r.bottom + 8, (cursorY || 0) + 24);
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  document.addEventListener('mouseover', function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    tipRestore();
    var host = target.closest('[title]');
    if (host && (host.getAttribute('title') || '').replace(/\s/g, '')) {
      var text = host.getAttribute('title');
      host.removeAttribute('title');
      tipSavedAttr = { el: host, t: text };
      tipShow(host, text, e.clientY);
      return;
    }
    var n = target;
    while (n && n.tagName && n.tagName.toLowerCase() !== 'svg' && n.tagName.toLowerCase() !== 'body') {
      var tt = n.querySelector && n.querySelector(':scope > title');
      if (tt && (tt.textContent || '').replace(/\s/g, '')) {
        tipSavedSvg = { parent: n, node: tt };
        var txt2 = tt.textContent;
        tt.parentNode.removeChild(tt);
        tipShow(n, txt2, e.clientY);
        return;
      }
      n = n.parentElement;
    }
  });
  document.addEventListener('mouseout', function (e) {
    var anchor = tipSavedAttr ? tipSavedAttr.el : (tipSavedSvg ? tipSavedSvg.parent : null);
    if (!anchor) return;
    if (e.relatedTarget && anchor.contains(e.relatedTarget)) return;
    tipRestore();
  });
  document.addEventListener('pointerdown', tipRestore, true);
  document.getElementById('mm-expand').addEventListener('click', function () {
    setAll(DATA.root, false); DATA.root.collapsed = false; DYN = true; render(); fit();
  });
  document.getElementById('mm-collapse').addEventListener('click', function () {
    setAll(DATA.root, true); DATA.root.collapsed = false; DYN = true; render(); fit();
  });

  // ── 아웃라인 페인 (읽기 전용 네비게이션) — 에디터의 아웃라인과 짝 ──
  //   분할 보기(mm-outline-split): 좌 아웃라인 + 우 맵
  //   전체 모드(mm-outline-full): 화면 전체 아웃라인 (맵 숨김)
  //   행 클릭 = 그 노드를 맵에서 중앙+강조(검색 이동과 동일). 캐럿 =
  //   접기/펴기. 노트 배지 클릭 = 노트 팝업.
  var olBody = document.getElementById('mm-outline-body');
  var NOTE_BADGE = { paragraph: { c: '#6B7280', t: 'T' }, code_block: { c: '#D97706', t: 'C' },
    table: { c: '#0EA5E9', t: '⊞' }, checklist: { c: '#16A34A', t: '✓' } };
  function outlineVisible() {
    return document.body.classList.contains('mm-outline-split') ||
      document.body.classList.contains('mm-outline-full');
  }
  function focusNodeFromOutline(id) {
    // 검색 이동과 동일: 강조 + 접힌 조상 펼침 + 중앙(맵이 보일 때만 이동)
    SEARCHHIT = id;
    if (FOCUS) { FOCUS = null; setCenterIcon(false); }
    expandTo(id);
    render();
    if (!document.body.classList.contains('mm-outline-full')) {
      var found = null;
      (function walk(n) {
        if (n.id === id) { found = n; return; }
        var kids = n.children || [];
        for (var i = 0; i < kids.length && !found; i++) walk(kids[i]);
      })(DATA.root);
      if (found && found._cx != null) {
        var rect = svg.getBoundingClientRect();
        view.k = 1;
        view.x = rect.width / 2 - found._cx;
        view.y = rect.height / 2 - found._cy;
        applyView();
      }
    }
  }
  function buildOutline() {
    olBody.textContent = '';
    (function walk(node, depth) {
      var row = el2('div', 'mm-ol-row' + (depth === 0 ? ' root' : '') +
        (SEARCHHIT === node.id ? ' on' : ''));
      row.setAttribute('data-oid', node.id);
      row.style.paddingLeft = (6 + depth * 16) + 'px';
      var kids = node.children || [];
      // 캐럿(접기) 또는 점
      if (kids.length) {
        var car = el2('span', 'mm-ol-caret');
        car.textContent = node.collapsed ? '▸' : '▾';
        car.addEventListener('click', function (e) {
          e.stopPropagation();
          node.collapsed = !node.collapsed; DYN = true; render();
        });
        row.appendChild(car);
      } else {
        var dot = el2('span', 'mm-ol-caret mm-ol-dot'); dot.textContent = '·';
        row.appendChild(dot);
      }
      // 블록 마커(코드 펜스·- [x]·파이프)는 접어 표시 — ⧉코드·☑/☐·⊞표 (P4)
      var txt = el2('span', 'mm-ol-txt'); txt.textContent = flattenText(node.text || '');
      row.appendChild(txt);
      // 노트 배지
      var notes = node.notes || [];
      var kinds = {};
      for (var n2 = 0; n2 < notes.length; n2++) {
        var tp = noteType(notes[n2]); if (!kinds[tp]) kinds[tp] = true;
      }
      Object.keys(kinds).forEach(function (k) {
        var meta = NOTE_BADGE[k] || NOTE_BADGE.paragraph;
        var b = el2('span', 'mm-ol-badge'); b.style.background = meta.c;
        b.textContent = meta.t; b.title = '노트 보기';
        b.addEventListener('click', function (e) { e.stopPropagation(); showDetail(node, 'notes'); });
        row.appendChild(b);
      });
      row.addEventListener('click', function () { focusNodeFromOutline(node.id); });
      olBody.appendChild(row);
      if (!node.collapsed) for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    })(DATA.root, 0);
  }
  function el2(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  // render()가 끝날 때마다 호출됨 (호이스팅) — 보일 때만 재구축
  function syncOutline() { if (outlineVisible()) buildOutline(); }

  // 헤더 토글 — 분할 / 전체(아웃라인·맵)
  var olSplitBtn = document.getElementById('mm-outline-split');
  var viewToggleBtn = document.getElementById('mm-view-toggle');
  // 아웃라인 모드(불릿 목록) / 맵 모드(마인드맵 노드) 아이콘 — 에디터와 동일 도안.
  var OUTLINE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/></svg>';
  var MINDMAP_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7.1 10.9 16.9 6"/><line x1="7.3" y1="12" x2="17" y2="12"/><path d="M7.1 13.1 16.9 18"/><circle cx="5" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="19" cy="5.5" r="1.9"/><circle cx="19" cy="12" r="1.9"/><circle cx="19" cy="18.5" r="1.9"/></svg>';
  function syncViewToggle() {
    var split = document.body.classList.contains('mm-outline-split');
    var full = document.body.classList.contains('mm-outline-full');
    olSplitBtn.className = split ? 'icon active' : 'icon';
    olSplitBtn.setAttribute('title', split ? '분할 보기 닫기' : '아웃라인 분할 보기');
    // 분할 중에는 전체 토글 비활성 (에디터와 동일 규칙)
    viewToggleBtn.disabled = split;
    viewToggleBtn.style.opacity = split ? '0.4' : '1';
    viewToggleBtn.style.cursor = split ? 'default' : 'pointer';
    viewToggleBtn.innerHTML = full ? MINDMAP_ICON : OUTLINE_ICON;
    viewToggleBtn.className = full ? 'icon active' : 'icon';
    viewToggleBtn.setAttribute('title', split
      ? '분할 보기 중에는 사용할 수 없습니다 (분할 닫은 뒤 전환)'
      : (full ? '맵 모드로 전환' : '아웃라인 모드로 전환 (화면 전체)'));
  }
  olSplitBtn.addEventListener('click', function () {
    var on = document.body.classList.toggle('mm-outline-split');
    if (on) document.body.classList.remove('mm-outline-full');
    syncViewToggle();
    if (outlineVisible()) buildOutline();
  });
  viewToggleBtn.addEventListener('click', function () {
    if (document.body.classList.contains('mm-outline-split')) return; // 비활성
    document.body.classList.toggle('mm-outline-full');
    syncViewToggle();
    if (outlineVisible()) buildOutline();
  });

  render();
  fit();
  syncViewToggle();
})();
`;

const VIEWER_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; }
  body {
    font-family: 'Pretendard Variable', Pretendard, 'Malgun Gothic',
      -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #F5EFE4; color: #3F3428;
    display: flex; flex-direction: column;
  }
  header {
    height: 46px; flex-shrink: 0; display: flex; align-items: center; gap: 10px;
    padding: 0 14px; background: #FFFDF8; border-bottom: 1px solid #E4D9C3;
  }
  header h1 { font-size: 14px; font-weight: 700; }
  header .meta { font-size: 11px; color: #8B7D68; }
  header .spacer { flex: 1; }
  header button {
    padding: 5px 11px; border: 1px solid #D8CBB2; border-radius: 6px;
    background: #FFF; color: #3F3428; font-size: 11.5px; font-weight: 600;
    cursor: pointer;
  }
  header button:hover { background: #F3ECDD; }
  #mm-main { flex: 1; min-height: 0; display: flex; }
  #mm-svg {
    flex: 1; min-width: 0; height: 100%; cursor: default; touch-action: none;
    background: radial-gradient(circle, #E4D9C377 1px, transparent 1px) 0 0 / 24px 24px;
  }
  body.mm-panmode #mm-svg { cursor: grab; }
  /* 아웃라인 페인 — 기본 숨김. 분할(mm-outline-split) 또는 전체
     (mm-outline-full) 모드에서만 표시. 읽기 전용 네비게이션 리스트. */
  #mm-outline {
    display: none; overflow: auto; flex-shrink: 0;
    background: #FFFDF8; border-right: 1px solid #E4D9C3;
    padding: 8px 6px 20px;
  }
  body.mm-outline-split #mm-outline { display: block; width: 40%; min-width: 240px; max-width: 620px; }
  body.mm-outline-full  #mm-outline { display: block; width: 100%; border-right: none; }
  body.mm-outline-full  #mm-svg { display: none; }
  body.mm-outline-full  #mm-zoombar { display: none; }
  .mm-ol-row {
    display: flex; align-items: flex-start; gap: 4px; padding: 4px 6px;
    border-radius: 6px; cursor: pointer; font-size: 13px; line-height: 1.4;
    color: #3F3428;
  }
  .mm-ol-row:hover { background: #F3ECDD; }
  .mm-ol-row.on { background: #FDF0D5; }
  .mm-ol-row.root { font-weight: 700; }
  .mm-ol-caret {
    width: 15px; flex-shrink: 0; color: #958A78; text-align: center;
    user-select: none;
  }
  .mm-ol-dot { color: #B8A888; flex-shrink: 0; }
  .mm-ol-txt { flex: 1; min-width: 0; white-space: pre-wrap; word-break: break-word; }
  .mm-ol-badge {
    flex-shrink: 0; font-size: 9px; font-weight: 800; color: #FFF;
    border-radius: 3.5px; padding: 1px 4px; margin-left: 3px;
    font-family: Arial, sans-serif;
  }
  body.mm-dark #mm-outline { background: #1F2229; border-color: #33363E; }
  body.mm-dark .mm-ol-row { color: #D8D4CC; }
  body.mm-dark .mm-ol-row:hover { background: #262A31; }
  body.mm-dark .mm-ol-row.on { background: #3B2A0A; }
  body.mm-dark .mm-ol-caret, body.mm-dark .mm-ol-dot { color: #6B6E78; }
  header button.icon {
    width: 30px; height: 28px; padding: 0; font-size: 15px; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center;
  }
  header button.active { background: #F0E2C4; border-color: #D8B25E; color: #8A5A00; }
  #mm-search-wrap { position: relative; display: inline-flex; align-items: center; }
  #mm-search-ic {
    position: absolute; left: 8px; color: #8B7D68; pointer-events: none;
  }
  #mm-search {
    width: 190px; height: 27px; padding: 0 8px 0 27px; font-size: 12.5px;
    border: 1px solid #D8CBB2; border-radius: 7px; background: #FFFDF8;
    color: #3F3428; outline: none; font-family: inherit;
  }
  #mm-search:focus { border-color: #D8B25E; }
  /* 결과 드롭다운 — 에디터 검색 패널과 동일한 목록 형식 */
  #mm-search-results {
    display: none; position: absolute; top: 31px; left: 0; z-index: 60;
    width: 320px; max-height: 55vh; overflow: auto;
    background: #FFFDF8; border: 1px solid #D8CBB2; border-radius: 10px;
    box-shadow: 0 8px 24px rgba(80, 60, 20, 0.15); padding: 8px;
  }
  #mm-search-results .cnt {
    font-size: 11px; color: #958A78; margin: 2px 2px 6px; font-weight: 600;
    letter-spacing: 0.4px; text-transform: uppercase;
  }
  #mm-search-results .hit {
    padding: 8px 10px; border-radius: 7px; margin-bottom: 4px; cursor: pointer;
    border: 1px solid transparent;
  }
  #mm-search-results .hit:hover { background: #F3ECDD; }
  #mm-search-results .hit.on { background: #FDF0D5; border-color: #D8B25E; }
  #mm-search-results .hit .ttl {
    font-size: 13px; font-weight: 500; color: #3F3428; margin-bottom: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #mm-search-results .hit .ttl mark {
    background: #D9770644; border-radius: 2px; padding: 0 2px; color: inherit;
  }
  #mm-search-results .hit .sub { font-size: 11px; color: #958A78; }
  #mm-search-results .hit .sub b { color: #6B6358; }
  /* 일치 위치 배지 — 제목 앞 색 칩 (라이트/다크 공통 고정색, 에디터 동일) */
  #mm-search-results .kb {
    display: inline-block; font-size: 9.5px; font-weight: 700;
    line-height: 14px; padding: 0 5px; border-radius: 4px;
    margin-right: 4px; vertical-align: text-bottom; letter-spacing: 0.3px;
  }
  #mm-search-results .kb-node { background: #3B82F6; color: #fff; }
  #mm-search-results .kb-tag  { background: #F59E0B; color: #1F1B16; }
  #mm-search-results .kb-note { background: #10B981; color: #fff; }
  #mm-search-results .kb-link { background: #8B5CF6; color: #fff; }
  body.mm-dark #mm-search {
    background: #262A31; color: #D8D4CC; border-color: #3A3E47;
  }
  body.mm-dark #mm-search-results {
    background: #20242B; border-color: #3A3E47;
  }
  body.mm-dark #mm-search-results .hit:hover { background: #262A31; }
  body.mm-dark #mm-search-results .hit.on { background: #3B2A0A; border-color: #8A6A24; }
  body.mm-dark #mm-search-results .hit .ttl { color: #D8D4CC; }
  body.mm-dark #mm-search-results .hit .sub { color: #8A8DA0; }
  /* 커스텀 툴팁 — 커서가 설명을 가리지 않게 요소 "위쪽"에 표시 */
  #mm-tip {
    position: fixed; z-index: 99999; pointer-events: none; display: none;
    background: rgba(32,30,26,0.95); color: #FFF; font-size: 11px;
    line-height: 1.45; padding: 4px 8px; border-radius: 5px;
    max-width: 280px; white-space: pre-line; box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  }
  /* ── 다크 모드 ── */
  body.mm-dark { background: #17191E; color: #D8D4CC; }
  body.mm-dark header { background: #1F2229; border-color: #33363E; }
  body.mm-dark header h1, body.mm-dark header .meta { color: #E8E4DC; }
  body.mm-dark header button {
    background: #262A31; color: #D8D4CC; border-color: #3A3E47;
  }
  body.mm-dark header button:hover { background: #2E333C; }
  body.mm-dark header button.active { background: #4A3B18; border-color: #8A6A24; color: #F0C86A; }
  body.mm-dark #mm-svg {
    background: #17191E radial-gradient(circle, #2A2D3466 1px, transparent 1px) 0 0 / 24px 24px;
  }
  body.mm-dark #mm-note {
    background: #20242B; color: #D8D4CC; border-color: #3A3E47;
  }
  body.mm-dark footer { background: #1F2229; color: #8A8DA0; border-color: #33363E; }
  .mm-toggle:hover circle { filter: brightness(0.93); }
  /* 우하단 줌 바 — 에디터 하단 상태바의 축소/100%/확대와 동일 */
  #mm-zoombar {
    position: fixed; right: 12px; bottom: 34px; z-index: 40;
    display: flex; align-items: center; gap: 3px;
    background: #FFFDF8; border: 1px solid #D8CBB2; border-radius: 8px;
    padding: 3px 4px; box-shadow: 0 2px 8px rgba(80, 60, 20, 0.12);
  }
  #mm-zoombar button {
    border: 1px solid #E4D9C3; background: #FFF; color: #3F3428;
    border-radius: 5px; cursor: pointer; font-size: 12px; height: 22px;
    min-width: 24px; padding: 0 5px;
  }
  #mm-zoombar button:hover { background: #F3ECDD; }
  #mm-zoom-pct { min-width: 46px; font-weight: 700; }
  #mm-zoom-input {
    width: 52px; padding: 4px 6px; border: 1px solid #D97706;
    border-radius: 6px; font-size: 12px; font-weight: 700;
    text-align: center; outline: none; background: #FFFDF8; color: #4A3B28;
  }
  body.mm-dark #mm-zoom-input { background: #14171D; color: #E7E3DA; }
  #mm-zoom-100 { display: inline-flex; align-items: center; justify-content: center; }
  body.mm-dark #mm-zoombar { background: #1F2229; border-color: #3A3E47; }
  body.mm-dark #mm-zoombar button {
    background: #262A31; color: #D8D4CC; border-color: #3A3E47;
  }
  body.mm-dark #mm-zoombar button:hover { background: #2E333C; }
  /* 다크 모드 — 노트 패널 내부(블록·표·코드·글자)까지 다크 (에디터 파리티) */
  body.mm-dark #mm-note h2, body.mm-dark #mm-note .mm-sec { color: #E8E4DC; }
  body.mm-dark #mm-note .mm-note-block { color: #D8D4CC; }
  body.mm-dark #mm-note .mm-table th {
    background: #262A31; color: #E8E4DC; border-color: #3A3E47;
  }
  body.mm-dark #mm-note .mm-table td { border-color: #3A3E47; color: #D8D4CC; }
  body.mm-dark #mm-note .mm-code { border-color: #3A3E47; }
  body.mm-dark #mm-note .mm-code-head {
    background: #262A31; color: #A8ABB8; border-color: #3A3E47;
  }
  body.mm-dark #mm-note .mm-code pre { background: #14171D; color: #D8D4CC; }
  body.mm-dark #mm-note .mm-copy {
    background: #262A31; color: #D8D4CC; border-color: #3A3E47;
  }
  body.mm-dark #mm-note a { color: #FBBF24; }
  body.mm-dark #mm-note-close { color: #A8ABB8; }
  /* 펼쳐진 노드의 접기(−) 토글 — 노드/토글에 호버할 때만 표시 (에디터 동일) */
  .mm-toggle-open { opacity: 0; transition: opacity 0.12s; }
  .mm-node:hover .mm-toggle-open, .mm-toggle-open:hover { opacity: 1; }
  /* 노트 뷰어 창 크기.
     [서버 연결 예정] 시스템 기본 크기는 관리자 설정(system_settings),
     사용자별 크기는 users.ui_preferences_json.noteViewer 로 이관 —
     docs/02-domain/db-schema.md §향후 관리 테이블, 32-settings.md 참조. */
  #mm-note {
    display: none; position: fixed; right: 14px; top: 60px; width: 280px;
    max-height: 60vh; overflow: auto; background: #FFFDF8;
    border: 1px solid #D8CBB2; border-radius: 10px; padding: 12px 14px;
    box-shadow: 0 8px 24px rgba(80, 60, 20, 0.15); font-size: 12px;
    /* 우하단 모서리 드래그로 크기 조절, 제목줄 드래그로 이동 */
    resize: both; min-width: 220px; min-height: 120px;
  }
  #mm-note h2 {
    font-size: 12.5px; margin-bottom: 8px; padding-right: 20px;
    cursor: move; user-select: none;
  }
  #mm-note-close {
    position: absolute; top: 8px; right: 10px; border: none; background: none;
    font-size: 14px; cursor: pointer; color: #8B7D68;
  }
  /* 마커 옆 링크/첨부/미디어 선택 팝업 — 에디터 ChooserPopover 파리티 */
  #mm-chooser {
    position: fixed; z-index: 60; width: 260px; max-height: 300px;
    overflow: auto; background: #FFFDF8; border: 1px solid #D8CBB2;
    border-radius: 6px; padding: 4px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  }
  .mm-chooser-item {
    display: block; width: 100%; text-align: left; padding: 5px 8px;
    border: none; background: transparent; border-radius: 4px;
    font-size: 11.5px; font-family: inherit; color: #1F1B16; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  /* 호버 항목 강조 — 배경 + 왼쪽 바 + 굵게 + ↗ (에디터와 동일) */
  .mm-chooser-item:not(.off):hover {
    background: #FEF3C7; box-shadow: inset 3px 0 0 #D97706;
    color: #B45309; font-weight: 700;
  }
  .mm-chooser-item:not(.off):hover::after { content: ' ↗'; }
  .mm-chooser-item.off { color: #A89B85; cursor: default; }
  body.mm-dark #mm-chooser { background: #20242B; border-color: #3A3E47; }
  body.mm-dark .mm-chooser-item { color: #D8D4CC; }
  body.mm-dark .mm-chooser-item:not(.off):hover {
    background: #3B2A0A; box-shadow: inset 3px 0 0 #F59E0B; color: #FBBF24;
  }
  body.mm-dark .mm-chooser-item.off { color: #6B6E78; }
  /* 문단·코드 글자 크기 10 통일. 문단은 입력한 줄 그대로(pre) 표시하고
     창 폭보다 길면 블록에 가로 스크롤바가 나타난다. */
  .mm-note-block {
    margin-bottom: 6px; line-height: 1.5; font-size: inherit;
    white-space: pre; overflow-x: auto;
  }
  .mm-note-block a { color: #1D4ED8; text-decoration: none; word-break: break-all; }
  .mm-note-block a:hover { text-decoration: underline; }
  /* 체크리스트 글리프 — 누르기 쉬우라고 좌우 여백째 클릭 판정.
     ⚠️ 위아래 padding 은 주면 안 된다 — .mm-note-block 이
     overflow-x:auto 라 세로가 한 줄보다 커지는 순간 **줄마다 세로
     스크롤바**가 생긴다 (2026-08-09 보고: "체크 오른쪽 상하 화살표").
     inline-block 의 높이는 이미 줄높이(1.5)라 세로 판정은 충분하다. */
  .mm-note-check {
    display: inline-block; padding: 0 5px; margin: 0 -5px;
    user-select: none;
  }
  .mm-note-check[data-viewer-note-check="1"] { color: #22A06B; }
  .mm-sec {
    font-size: 10px; font-weight: 700; color: #8B7D68; letter-spacing: 0.5px;
    margin: 10px 0 5px; padding-top: 8px; border-top: 1px solid #EFE7D6;
  }
  .mm-sec:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  .mm-tagrow { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  .mm-table {
    border-collapse: collapse; width: 100%; margin-bottom: 8px; font-size: 0.93em;
  }
  .mm-table th, .mm-table td {
    border: 1px solid #DDD0BA; padding: 4px 7px; text-align: left;
  }
  .mm-table th { background: #F3ECDD; font-weight: 700; }
  .mm-code { margin-bottom: 8px; border: 1px solid #DDD0BA; border-radius: 6px; overflow: hidden; }
  .mm-code-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 3px 8px; background: #EFE7D6; font-size: 10px; font-weight: 700;
    color: #6E5F49; letter-spacing: 0.4px; text-transform: uppercase;
  }
  .mm-copy {
    border: 1px solid #D8CBB2; border-radius: 4px; background: #FFF;
    font-size: 10px; padding: 1px 7px; cursor: pointer; color: #3F3428;
    font-weight: 600; text-transform: none;
  }
  .mm-copy:hover { background: #F3ECDD; }
  .mm-code pre {
    margin: 0; padding: 7px 9px; font-size: 0.87em; line-height: 1.5;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    white-space: pre; overflow-x: auto; background: #FBF7EE;
  }
  .mm-chip {
    font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 4px;
    background: #C2410C1A; color: #C2410C; border: 1px solid #C2410C44;
  }
  .mm-note-code_block {
    font-family: ui-monospace, monospace; background: #F3ECDD;
    border-radius: 5px; padding: 6px 8px; font-size: 11px;
  }
  .mm-note-warning { color: #B45309; }
  .mm-note-tip { color: #15803D; }
  /* 리치 문단(웹 기사 붙여넣기) — 사진+서식 표시 */
  .mm-note-rich { white-space: normal; font-size: inherit; line-height: 1.6; }
  .mm-note-rich img {
    max-width: 100%; height: auto; border-radius: 4px;
    display: block; margin: 4px 0;
  }
  .mm-note-rich p, .mm-note-rich div { margin: 0 0 6px; }
  .mm-note-rich table { border-collapse: collapse; max-width: 100%; }
  .mm-note-rich td, .mm-note-rich th { border: 1px solid #E4D9C3; padding: 3px 6px; }
  .mm-note-rich pre { overflow-x: auto; background: #F3ECDD; padding: 6px 8px; border-radius: 4px; }
  .mm-note-rich h1, .mm-note-rich h2, .mm-note-rich h3,
  .mm-note-rich h4 { font-size: 1.1em; margin: 8px 0 4px; }
  footer {
    height: 26px; flex-shrink: 0; display: flex; align-items: center;
    padding: 0 14px; gap: 8px; background: #FFFDF8;
    border-top: 1px solid #E4D9C3; font-size: 10.5px; color: #8B7D68;
  }
`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Builds the complete standalone HTML document for the given map.
// `mapLayoutType` = the editor's current whole-map layout (editorUiStore);
// per-node overrides ride along on each node's layoutType field.
export function buildStandaloneHtml(
  map: SampleMap,
  mapLayoutType?: LayoutType,
  resolveHref?: AttachmentHrefResolver,
  spacing?: LayoutSpacing,
  // 메타데이터에 실을 맵 (작은 첨부가 data URL로 인라인된 사본) —
  // 없으면 map 그대로. 뷰어 표시용 데이터에는 영향 없다.
  metaMap?: SampleMap,
  // 내보낼 때의 에디터 테마가 다크인지 — 뷰어의 최초 모드가 된다
  dark?: boolean,
): string {
  const layoutType = (mapLayoutType ??
    map.root.layoutType ??
    'radial-bidirectional') as LayoutType;

  // 에디터와 동일한 레이아웃 엔진으로 최종 좌표(간격 배율 포함)를 계산해
  // 노드마다 실어 보낸다 — 뷰어가 에디터 화면과 똑같이 그린다.
  // 맵 설정(레벨별 폰트)도 측정에 반영하고 글꼴(ff)을 노드마다 실어 보낸다.
  setLevelFontConfig(map.settings?.levelFonts);
  // 레벨별 기본 도형도 주입해야 toExportNode 가 '도형 없음'을 구울 수 있다
  // (에디터 Canvas 와 동일 — 없으면 맵 설정 경로의 도형 없음이 누락된다)
  setLevelShapeConfig(map.settings?.levelShapes);
  const laid = computeLayout(map, layoutType, 700, 400, spacing);
  // 체크리스트 항목 범위 — 에디터(NodeRenderer)와 같은 재구성 규칙으로
  // 계산해 노드마다 실어 보낸다 (뷰어는 계산 없이 그대로 그린다)
  const bakeChecks = (n: (typeof laid)[number]) => {
    const text = String(n.text ?? '');
    const mdc = parseMdCodeEditor(text);
    const baseText = mdc ? [mdc.before, mdc.after].filter(Boolean).join('\n') : text;
    const mdt = parseMdTableEditor(baseText);
    const plainText = mdt ? [mdt.before, mdt.after].filter(Boolean).join('\n') : baseText;
    const manualLines = (mdt || mdc) && plainText === '' ? [] : plainText.split('\n');
    const checks = computeNodeChecks(manualLines, n._manualStarts, (n._lines ?? []).length);
    return checks.length
      // s = 항목 순번 — 뷰어에서 "몇 번째 체크를 눌렀나"를 가리는 열쇠
      // (줄 번호는 접기·줄바꿈으로 흔들려 열쇠가 될 수 없다)
      ? checks.map((c) => ({ a: c.at, e: c.end, c: c.checked ? 1 : 0, s: c.seq }))
      : undefined;
  };
  const posById = new Map<string, ExportPos>(
    laid.map((n) => [
      n.id,
      {
        x: Math.round(n.x * 10) / 10,
        y: Math.round(n.y * 10) / 10,
        w: Math.round(n.w * 10) / 10,
        h: Math.round(n.h * 10) / 10,
        lines: n._lines ?? [String(n.text ?? '')],
        ms: n._manualStarts,
        fs: n._fontSize ?? 13,
        lh: n._lineHeight ?? 18,
        ff: levelFontFamily(n.depth),
        ck: bakeChecks(n),
      },
    ]),
  );
  const resolvePos: PosResolver = (id) => posById.get(id);
  const sideById = new Map<string, string | undefined>(laid.map((n) => [n.id, n.side]));
  const resolveSide: SideResolver = (id) => sideById.get(id);

  const data = {
    title: map.title,
    mapLayout: layoutType,
    // 내보낼 때의 에디터 테마 — 뷰어가 이 모드로 열린다 (☀/🌙 로 바꾼
    // 값이 그 파일에 저장돼 있으면 그쪽이 우선)
    dark: dark || undefined,
    // 노트 글꼴·크기 (맵 설정 — 뷰어 노트 패널에 적용, 기본 13pt)
    noteFont: map.settings?.noteFont,
    root: {
      // 루트도 일반 노드처럼 링크·노트·첨부·태그·아이콘을 가질 수 있다 —
      // 전체를 넘겨야 뷰어 마커가 에디터와 같게 그려진다 (2026-08-02:
      // text·style만 넘겨 루트의 링크/첨부 마커가 뷰어에서 사라지던 버그).
      ...toExportNode({
        ...map.root,
        textAlign: map.root.textAlign ?? levelTextAlign(0),
      } as MindNode, resolveHref, resolvePos, resolveSide),
      colorKey: 'root',
      layoutType: map.root.layoutType ?? mapLayoutType,
      children: map.branches.map((b) =>
        toExportNode(b, resolveHref, resolvePos, resolveSide, 1)),
    },
  };

  // <-escape so node text like "</script>" cannot terminate the block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const exportedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

  // 맵 메타데이터 — EasyMindMap 생성 파일 표시 + 편집 가능한 원본 맵
  // 전체(스타일·노트·설정 포함). '새 맵 > 불러오기'가 이 블록을 읽어
  // 내보낸 맵을 그대로 복원한다 (mapMeta.ts / importMapFile.ts).
  const metaJson = JSON.stringify(buildMapMeta(metaMap ?? map, layoutType, spacing))
    .replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(map.title)} — EasyMindMap</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}">
<style>${VIEWER_CSS}</style>
</head>
<body>
<header>
  <h1>${LOGO_SVG.replace('<svg ', '<svg width="20" height="20" style="vertical-align:-4px;margin-right:6px" ')}${escapeHtml(map.title)}</h1>
  <span class="meta" id="mm-count"></span>
  <span class="spacer"></span>
  <span id="mm-search-wrap">
    <svg id="mm-search-ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="20" y1="20" x2="16.65" y2="16.65"/></svg>
    <input id="mm-search" type="search" placeholder="노드 · 태그 · 노트 검색"
      title="노드 텍스트·태그·노트·링크 검색 — 결과를 클릭하면 노란 강조로 표시됩니다" />
    <div id="mm-search-results"></div>
  </span>
  <button id="mm-center" class="icon" title="선택 노드 화면 중앙 보기 (노드를 클릭해 선택 · 다시 누르면 전체 보기)"><svg id="mm-center-ic" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg></button>
  <button id="mm-pan" class="icon" title="Pan 모드 — 드래그로 화면 이동 (마우스 오른쪽 버튼 드래그로도 이동)">✋</button>
  <button id="mm-fit" class="icon" title="맵 전체를 화면에 맞추기">⛶</button>
  <button id="mm-expand" class="icon" title="모두 펼치기">+</button>
  <button id="mm-collapse" class="icon" title="모두 접기">−</button>
  <button id="mm-outline-split" class="icon" title="아웃라인 분할 보기">◫</button>
  <button id="mm-view-toggle" class="icon" title="아웃라인 모드로 전환 (화면 전체)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="4.5" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.3" fill="currentColor" stroke="none"/><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/></svg></button>
  <button id="mm-fullscreen" class="icon" title="전체화면 모드"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><polyline points="14 8 16 8 16 10"/><polyline points="10 16 8 16 8 14"/><line x1="16" y1="8" x2="12.5" y2="11.5"/><line x1="8" y1="16" x2="11.5" y2="12.5"/></svg></button>
  <button id="mm-dark" class="icon" title="다크 모드로 전환">🌙</button>
</header>
<div id="mm-main">
  <div id="mm-outline"><div id="mm-outline-body"></div></div>
  <svg id="mm-svg"><g id="mm-world"></g></svg>
</div>
<div id="mm-note">
  <button id="mm-note-close">✕</button>
  <h2 id="mm-note-title"></h2>
  <div id="mm-note-body"></div>
</div>
<div id="mm-zoombar">
  <button id="mm-zoom-out" title="축소 (5% 단위)">−</button>
  <button id="mm-zoom-pct" title="클릭해서 배율 직접 입력 (2~400)">100%</button>
  <input id="mm-zoom-input" type="number" min="2" max="400" style="display:none" title="배율 입력 후 Enter" />
  <button id="mm-zoom-in" title="확대 (5% 단위)">+</button>
  <button id="mm-zoom-100" title="100%로 보기"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="10" cy="10" r="7"/><line x1="20" y1="20" x2="15" y2="15"/><text x="10" y="12.3" font-size="6.3" font-weight="700" text-anchor="middle" fill="currentColor" stroke="none">100</text></svg></button>
</div>
<footer>EasyMindMap 내보내기 · 읽기 전용 뷰어 · ${exportedAt}</footer>
<!-- EasyMindMap 생성 파일 · 제목: ${escapeHtml(map.title)} · 내보낸 시각: ${exportedAt}
     아래 메타데이터(#easymindmap-map)로 '새 맵 > 불러오기'에서 편집 가능하게 복원됩니다 -->
<script type="application/json" id="easymindmap-map">${metaJson}</script>
<script>window.__MINDMAP__ = ${json};</script>
<script>${VIEWER_JS}</script>
</body>
</html>`;
}

function safeName(s: string, fallback: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|]/g, '_').trim();
  return cleaned || fallback;
}

function collectAttachments(nodes: MindNode[], out: NodeAttachment[]): void {
  for (const n of nodes) {
    if (n.attachments) out.push(...n.attachments);
    collectAttachments(n.children ?? [], out);
  }
}

export interface ExportPackage {
  fileName: string;
  blob: Blob;
  // how many attachments were packaged into files/ vs left as external links
  packaged: number;
  external: number;
}

// Builds the export payload. With no attachments this is the single
// standalone .html; with attachments it is a .zip whose unzipped layout is
//   맵제목.html
//   files/<첨부파일들>          ← the HTML links to them via ./files/…
// (browsers cannot write into a disk folder directly, so the folder ships
// inside the zip). Attachments whose bytes cannot be fetched (e.g. CORS or
// dead URL) stay as external links in the HTML instead of files/ entries.
export async function buildExportPackage(
  map: SampleMap,
  mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing,
  // 내보낼 때의 에디터 테마가 다크인지 — 뷰어가 이 모드로 열린다
  dark?: boolean,
): Promise<ExportPackage> {
  const title = safeName(map.title, 'mindmap');

  const attachments: NodeAttachment[] = [];
  // 루트 노드의 첨부도 패키징한다 (2026-08-02: branches만 걷어 루트 첨부가
  // files/ 에 안 들어가고 세션이 끝나면 죽는 blob: URL로 남던 버그)
  if (map.root.attachments) attachments.push(...map.root.attachments);
  collectAttachments(map.branches, attachments);

  if (attachments.length === 0) {
    const html = buildStandaloneHtml(map, mapLayoutType, undefined, spacing, undefined, dark);
    return {
      fileName: `${title}.html`,
      blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
      packaged: 0,
      external: 0,
    };
  }

  // Fetch each attachment; successes go into files/, failures stay external.
  const hrefById = new Map<string, string>();
  // ≤2MB 첨부는 메타데이터에 data URL로 인라인 — 단일 HTML만으로도
  // '새 맵 > 불러오기'에서 첨부까지 복원된다 (mapMeta.ts)
  const inlineById = new Map<string, string>();
  const files: ZipEntry[] = [];
  const usedNames = new Set<string>();

  for (const att of attachments) {
    if (!att.url) continue;
    try {
      // 서버 첨부(B9)는 인증 토큰을 붙여 받아온다 — 그 외 URL 은 그대로
      const res = await fetch(await attachmentFetchUrl(att.url));
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length <= INLINE_ATTACHMENT_LIMIT) {
        inlineById.set(att.id, bytesToDataUrl(bytes, att.name));
      }

      let name = safeName(att.name, att.id);
      if (usedNames.has(name)) {
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : '';
        let i = 2;
        while (usedNames.has(`${stem}-${i}${ext}`)) i += 1;
        name = `${stem}-${i}${ext}`;
      }
      usedNames.add(name);

      files.push({ path: `files/${name}`, data: bytes });
      hrefById.set(att.id, `files/${name}`);
    } catch {
      // leave as external link (original URL) in the HTML
    }
  }

  const metaMap = withInlinedAttachments(map, (id) => inlineById.get(id));
  const html = buildStandaloneHtml(
    map, mapLayoutType, (id) => hrefById.get(id), spacing, metaMap, dark);

  if (files.length === 0) {
    // nothing could be packaged — fall back to the single HTML
    return {
      fileName: `${title}.html`,
      blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
      packaged: 0,
      external: attachments.length,
    };
  }

  const entries: ZipEntry[] = [
    { path: `${title}.html`, data: new TextEncoder().encode(html) },
    ...files,
  ];

  return {
    fileName: `${title}.zip`,
    blob: new Blob([buildZip(entries) as BlobPart], { type: 'application/zip' }),
    packaged: files.length,
    external: attachments.length - files.length,
  };
}

// Triggers a browser download: single .html, or .zip(맵.html + files/…)
// when the map has attachments.
export async function downloadMapAsHtml(
  map: SampleMap,
  mapLayoutType?: LayoutType,
  spacing?: LayoutSpacing,
  // 내보낼 때의 에디터 테마가 다크인지 — 뷰어가 이 모드로 열린다
  dark?: boolean,
): Promise<ExportPackage> {
  const pkg = await buildExportPackage(map, mapLayoutType, spacing, dark);
  const url = URL.createObjectURL(pkg.blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = pkg.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  // packaged/external 카운트 — 호출부(툴바)가 "원본 없는 첨부 N개 제외"
  // 안내를 띄우는 데 쓴다 (2026-08-02: 묵묵한 html 폴백이 사용자를
  // 놀라게 했다 — 저장 후 다시 연 맵의 blob: 첨부가 그랬다).
  return pkg;
}
