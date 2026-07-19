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
import { computeLayout, type LayoutSpacing } from '@/layout/LayoutEngine';
import { setLevelFontConfig, levelFontFamily, levelTextAlign } from '@/editor/node-renderer/sizeNodeForText';
import { buildZip, type ZipEntry } from './zip';
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
  notes?: { type: string; text: string; checked?: boolean; lang?: string; html?: string }[];
  attachments?: ExportAttachment[];
  collapsed?: boolean;
  colorKey?: string;
  // 텍스트 강조·정렬 (에디터 스타일 탭과 동일하게 표시)
  textAlign?: string;
  style?: {
    strike?: boolean; highlight?: boolean;
    // 노드별 지정 색 — 뷰어가 팔레트보다 우선 적용
    fillColor?: string; borderColor?: string; textColor?: string;
  };
  // 노드 안 사진 (data URL 또는 원본 URL) — 노드 폭에 맞춰 축소 표시
  image?: { src: string; w: number; h: number };
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

  return {
    id: node.id,
    text: node.text,
    icon: node.icon,
    tags,
    links: node.links?.map((l) => ({ url: l.url, label: l.label })),
    notes: node.notes?.map((n) => ({
      type: n.type, text: n.text, checked: n.checked, lang: n.lang,
      // 리치 붙여넣기(사진+서식) — sanitizeRichHtml을 통과한 HTML만 저장됨
      html: n.html,
    })),
    attachments: node.attachments?.map((a) => {
      const packaged = resolveHref?.(a.id);
      return {
        name: a.name,
        href: packaged ?? a.url,
        kind: a.kind,
        external: packaged ? undefined : true,
      };
    }),
    collapsed: node.collapsed || undefined,
    colorKey: node.colorKey,
    image: node.image,
    // 실효 정렬을 굽는다 — 뷰어는 맵 설정(레벨별 맞춤)을 모른다
    textAlign: node.textAlign ?? levelTextAlign(depth),
    style: node.style && (node.style.strike || node.style.highlight ||
      node.style.fillColor || node.style.borderColor || node.style.textColor)
      ? {
        strike: node.style.strike || undefined,
        highlight: node.style.highlight || undefined,
        // 노드별 지정 색 — 뷰어가 팔레트보다 우선 적용 (원본 색 파리티)
        fillColor: node.style.fillColor || undefined,
        borderColor: node.style.borderColor || undefined,
        textColor: node.style.textColor || undefined,
      }
      : undefined,
    layoutType: node.layoutType,
    side: resolveSide?.(node.id) ?? node.side,
    pos: resolvePos?.(node.id),
    children: (node.children ?? []).map((c) =>
      toExportNode(c, resolveHref, resolvePos, resolveSide, depth + 1)),
  };
}

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
    fam: FAM_LIGHT, edge: '#B8A888', tagBase: '#FFFDF8', hl: '#FFE066'
  };
  var SKIN_DARK = {
    fam: FAM_DARK, edge: '#4A4E5A', tagBase: '#14171D', hl: '#3B2A0A'
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
    'process-tree-right': 1, 'timeline': 1
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
      return { headers: headers, rows: rows };
    }
    return null;
  }

  // 인라인 강조 파서 — 에디터 inlineMarks.ts와 동일 (마커 토글, 짝이
  // 없으면 줄 끝까지). t=텍스트, b/i/s/u/h=굵게/기울임/취소선/밑줄/형광
  // init 상태에서 시작해 파싱하고 줄 끝 상태를 함께 반환 — 마커 구간이
  // 자동 줄바꿈 경계에 걸치면 다음 줄로 상태를 이월한다 (에디터와 동일)
  function parseInlineSegsState(line, init) {
    var segs = [], buf = '';
    var b = init ? !!init.b : false, it = init ? !!init.i : false,
      st2 = init ? !!init.s : false, u = init ? !!init.u : false,
      h = init ? !!init.h : false;
    function push() { if (buf) { segs.push({ t: buf, b: b, i: it, s: st2, u: u, h: h }); buf = ''; } }
    var idx = 0;
    while (idx < line.length) {
      var two = line.substr(idx, 2);
      if (two === '**') { push(); b = !b; idx += 2; continue; }
      if (two === '~~') { push(); st2 = !st2; idx += 2; continue; }
      if (two === '==') { push(); h = !h; idx += 2; continue; }
      if (two === '__') { push(); u = !u; idx += 2; continue; }
      if (line.charAt(idx) === '*') { push(); it = !it; idx += 1; continue; }
      buf += line.charAt(idx);
      idx += 1;
    }
    push();
    if (!segs.length) segs.push({ t: '' });
    return { segs: segs, end: { b: b, i: it, s: st2, u: u, h: h } };
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

  function measure(node, depth, inheritedEff) {
    var eff = normalize(node.layoutType) || inheritedEff;
    node._eff = eff;

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
    var tagsH = (node.tags && node.tags.length) ? TAG_H + 7 : 0;

    node._fs = fontSize; node._lines = wrapped.lines; node._lineH = lineH;
    node._manualStarts = wrapped.starts;
    node._w = w; node._h = h; node._boxH = h + tagsH;
    node._open = !node.collapsed;

    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) measure(kids[i], depth + 1, eff);

    if (!node._open || kids.length === 0) {
      node._bw = w; node._bh = node._boxH;
      node._nx = w / 2; node._ny = h / 2;
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
    if (eff === 'timeline') {
      // 시간배치 — 루트→주제: 시간축을 따라가다 주제로 꺾임.
      // 주제 이하: 왼쪽 스파인 세로 아웃라인 (위/아래 방향).
      if (p === DATA.root) {
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
  // link/file are drawn as bold SVG (globe+gold chain / dark paperclip —
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
        el('path', {
          d: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
          fill: 'none', stroke: '#4A3B28', 'stroke-width': 2.5,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round'
        }, inner);
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
  // 배치를 재현한다. 접기/펴기는 표시/숨김만 하고 재배치하지 않는다.
  function assignFixed(node, depth, inheritedEff) {
    var eff = normalize(node.layoutType) || inheritedEff;
    node._eff = eff;
    node._cx = node.pos.x; node._cy = node.pos.y;
    node._w = node.pos.w; node._h = node.pos.h;
    node._lines = node.pos.lines; node._lineH = node.pos.lh;
    node._manualStarts = node.pos.ms;
    node._fs = node.pos.fs;
    node._ff = node.pos.ff; // 맵 설정(레벨별 폰트)의 글꼴
    // 에디터 좌표 모드 — _lines가 Markdown 표를 제외한 텍스트만 담고
    // 있으므로 drawNode가 표를 직접 그린다.
    node._fixed = true;
    node._open = !node.collapsed;
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].pos) assignFixed(kids[i], depth + 1, eff);
    }
  }

  function render() {
    while (world.firstChild) world.removeChild(world.firstChild);
    var rootEff = normalize(DATA.root.layoutType) || normalize(DATA.mapLayout) || 'radial-bidirectional';
    DATA.root.layoutType = DATA.root.layoutType || rootEff;
    if (DATA.root.pos) {
      assignFixed(DATA.root, 0, rootEff);
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
    updateCount();
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
    // 검색 결과 — 어떤 스타일보다 우선해 또렷하게 (에디터와 동일)
    if (SEARCHHIT === node.id) { nodeFill2 = '#FFE066'; nodeStroke2 = '#DC2626'; }
    var nodeText2 = stPre.textColor || fam0.text;
    var kids = node.children || [];

    if (depth === 0 && node._eff === 'timeline') {
      // 수평 시간축 화살표 (루트 → 마지막 주제 너머) — 에디터와 동일
      var maxX = node._cx + node._w / 2;
      (function scan(n2) {
        maxX = Math.max(maxX, n2._cx + n2._w / 2);
        var ks = n2._open ? (n2.children || []) : [];
        for (var q = 0; q < ks.length; q++) if (ks[q]._cx != null) scan(ks[q]);
      })(node);
      var endX = maxX + 46;
      el('line', { x1: node._cx + node._w / 2, y1: node._cy, x2: endX, y2: node._cy,
        stroke: '#C9BBA4', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, world);
      el('polygon', { points: (endX + 12) + ',' + node._cy + ' ' + (endX - 2) + ',' +
        (node._cy - 6) + ' ' + (endX - 2) + ',' + (node._cy + 6), fill: '#C9BBA4' }, world);
    }

    if (node._open) {
      for (var i = 0; i < kids.length; i++) {
        el('path', { d: edgePath(node, kids[i]), fill: 'none',
          stroke: SKIN.edge, 'stroke-width': depth === 0 ? 2.2 : 1.6,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, world);
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
      render();
    });
    var isRoot = depth === 0;
    var x0 = node._cx - node._w / 2, y0 = node._cy - node._h / 2;
    el('rect', {
      x: x0, y: y0, width: node._w, height: node._h,
      rx: isRoot ? 13 : 9,
      fill: nodeFill2,
      stroke: isRoot ? (stPre.borderColor || SKIN.fam.root.fill) : nodeStroke2,
      'stroke-width': isRoot ? 0 : 1.4
    }, g);

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
    var cellFs = 0, rowH2 = 0, tGap = 0, tblH = 0;
    if (mdt) {
      cellFs = Math.max(10, node._fs - 2);
      rowH2 = cellFs + 10;
      tGap = node._lines.length ? 6 : 0;
      tblH = (1 + mdt.rows.length) * rowH2;
    }
    // 노드 안 사진 — 노드 폭에 맞춰 축소 (에디터 scaleNodeImage와 동일)
    var img = null;
    if (node.image && node.image.src) {
      var innerW = Math.max(40, node._w - PAD_X * 2);
      var isc = Math.min(1, innerW / Math.max(1, node.image.w));
      img = { w: Math.round(node.image.w * isc), h: Math.round(node.image.h * isc) };
    }
    var imgGap = img && (node._lines.length || mdt) ? 6 : 0;
    var stacked = !!(mdt || img); // 표·사진이 있으면 세로 스택 가운데 정렬
    var contentH = node._lines.length * node._lineH +
      (mdt ? tblH + tGap : 0) + (img ? img.h + imgGap : 0);
    var topY = node._cy - contentH / 2;
    var anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
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
          segs[si].b ? 700 : baseW2, segs[si].i, node._ff));
        lw2 += segWs[si];
      }
      var baseY = stacked
        ? topY + li * node._lineH + node._lineH / 2 + node._fs * 0.34
        : y0 + PAD_Y + node._fs * 0.85 + li * node._lineH;
      // 중앙 정렬은 아이콘(왼쪽)·마커(오른쪽) 영역을 뺀 띠의 중앙 —
      // 박스 중앙 기준이면 긴 줄이 아이콘/마커와 겹친다 (에디터와 동일 보정)
      var iconW2 = node.icon ? node._fs + 6 : 0;
      var mW2 = node._marksW != null ? node._marksW
        : (markerCount(node) ? markerCount(node) * (node._fs + 1 + 3) + 5 : 0);
      var sx = align === 'center'
        ? x0 + node._w / 2 + (iconW2 - mW2) / 2 - lw2 / 2
        : (align === 'right' ? x0 + node._w - PAD_X - mW2 - lw2 : tx);
      var segX = [], accX = sx;
      for (si = 0; si < segs.length; si++) { segX.push(accX); accX += segWs[si]; }
      for (si = 0; si < segs.length; si++) {
        if ((st.highlight || segs[si].h) && segs[si].t.replace(/\s/g, '')) {
          el('rect', { x: segX[si] - 2, y: baseY - node._fs * 1.06,
            width: segWs[si] + 4, height: node._fs * 1.44, rx: 2,
            fill: SKIN.hl, opacity: 0.85 }, g);
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
        var deco = [];
        if (st.strike || segs[si].s) deco.push('line-through');
        if (segs[si].u) deco.push('underline');
        if (deco.length) sp.setAttribute('text-decoration', deco.join(' '));
        sp.textContent = segs[si].t;
      }
    }
    if (mdt) {
      // Markdown 표 그리기 — 헤더 행 배경 + 격자선 + 셀 텍스트
      var gridC = color || textColor;
      var tblX = x0 + PAD_X;
      var tblY = topY + node._lines.length * node._lineH + tGap;
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
    }
    if (img) {
      // 노드 안 사진 — 텍스트(·표) 아래 가운데 정렬
      var imgY = topY + node._lines.length * node._lineH +
        (mdt ? tblH + tGap : 0) + imgGap;
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
    // Single item → open it directly; multiple → detail-panel list.
    var files = [], media = [], ai;
    if (node.attachments) {
      for (ai = 0; ai < node.attachments.length; ai++) {
        (node.attachments[ai].kind === 'audio' || node.attachments[ai].kind === 'video'
          ? media : files).push(node.attachments[ai]);
      }
    }
    var markers = [];
    function urlList(arr, f) {
      var out = [];
      for (var i2 = 0; i2 < arr.length; i2++) out.push(f(arr[i2]));
      return out.join('\n');
    }
    if (node.links && node.links.length) {
      markers.push({ kind: 'link',
        // 호버 시 링크된 URL 표시 (에디터와 동일)
        tip: urlList(node.links, function (l) { return l.label ? l.label + ' — ' + l.url : l.url; }),
        act: (node.links.length === 1
        ? function () { window.open(node.links[0].url, '_blank'); }
        : function () { showDetail(node, 'links'); }) });
    }
    if (node.notes && node.notes.length) {
      // 노트 종류별 개별 마커 — 클릭하면 그 종류의 노트만 상세 패널에 표시
      for (var nk = 0; nk < NOTE_KIND_ORDER.length; nk++) {
        (function (kind) {
          var def = NOTE_STYLE[kind];
          var blocks = notesOf(node, def.type);
          if (!blocks.length) return;
          markers.push({
            kind: kind,
            tip: blocks.length > 1 ? def.label + ' ' + blocks.length + '개' : def.label,
            act: function () { showDetail(node, kind); }
          });
        })(NOTE_KIND_ORDER[nk]);
      }
    }
    if (files.length) {
      markers.push({ kind: 'file',
        tip: urlList(files, function (a) { return a.name; }),
        act: (files.length === 1 && files[0].href
        ? function () { window.open(files[0].href, '_blank'); }
        : function () { showDetail(node, 'files'); }) });
    }
    if (media.length) {
      markers.push({ kind: 'media',
        tip: urlList(media, function (a) { return a.name; }),
        act: (media.length === 1 && media[0].href
        ? function () { window.open(media[0].href, '_blank'); }
        : function () { showDetail(node, 'media'); }) });
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
        (function (act) {
          mk.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
          mk.addEventListener('click', function (ev) { ev.stopPropagation(); act(); });
        })(markers[mi].act);
        mx0 += mfs + 3;
      }
    }

    if (kids.length) {
      // 접기 토글 위치 — 자식이 "실제로 배치된 방향"으로 계산한다 (펼쳐진
      // 노드는 자식 좌표의 평균 방향; 트리·진행트리의 3레벨 이하에서 자식이
      // 아래로 자라는데 토글이 오른쪽에 붙던 문제 수정 — 2026-07). 접힌
      // 노드는 자식 좌표가 없으므로 내보낸 side로 폴백.
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
      var leftish = sd === 'left' || (!node._open && (node._eff === 'radial-left' ||
        (node._eff === 'radial-bidirectional' && sd === 'left' && depth > 0)));
      var ccx, ccy;
      if (sd === 'down') { ccx = node._cx; ccy = node._cy + node._h / 2 + 11; }
      else if (sd === 'up') { ccx = node._cx; ccy = node._cy - node._h / 2 - 11; }
      else if (leftish) { ccx = x0 - 11; ccy = node._cy; }
      else { ccx = x0 + node._w + 11; ccy = node._cy; }
      // 펼쳐진 노드의 접기(−) 토글은 항상 보이지 않고 노드에 마우스를
      // 올렸을 때만 나타난다 (에디터와 동일). 접힌 노드의 +N 배지는 숨은
      // 서브트리를 알려야 하므로 항상 표시.
      var chip = el('g', { cursor: 'pointer',
        'class': node._open ? 'mm-toggle mm-toggle-open' : 'mm-toggle' }, g);
      el('circle', { cx: ccx, cy: ccy, r: 8.5, fill: node._open ? SKIN.fam.l2.fill : color,
        stroke: color, 'stroke-width': 1.3 }, chip);
      var ct = el('text', { x: ccx, y: ccy + 3.4, 'text-anchor': 'middle',
        'font-size': 9.5, 'font-weight': 700, fill: node._open ? color : '#FFFFFF' }, chip);
      ct.textContent = node._open ? '−' : String(countDescendants(node));
      (function (n) {
        chip.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        chip.addEventListener('click', function (ev) {
          ev.stopPropagation();
          n.collapsed = !n.collapsed;
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
      // 줄 = 행, '|' = 열. 첫 행은 헤더.
      var tbl = document.createElement('table');
      tbl.className = 'mm-table';
      var rows = String(note.text || '').split('\n');
      for (var r = 0; r < rows.length; r++) {
        if (!rows[r].trim()) continue;
        var tr = document.createElement('tr');
        var cells = rows[r].split('|');
        for (var cIdx = 0; cIdx < cells.length; cIdx++) {
          var cell = document.createElement(r === 0 ? 'th' : 'td');
          cell.textContent = cells[cIdx].trim();
          tr.appendChild(cell);
        }
        tbl.appendChild(tr);
      }
      return tbl;
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
      btn.textContent = '⧉ 복사';
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
    pEl.textContent = (type === 'checklist'
      ? (note.checked ? '☑ ' : '☐ ') : '') + note.text;
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
    noteTitle.textContent = node.text;
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
  svg.addEventListener('pointerdown', function (e) {
    var temp = e.button === 1 || e.button === 2;
    if (!panMode && !temp) return;
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    svg.setPointerCapture(e.pointerId);
    svg.style.cursor = 'grabbing';
  });
  svg.addEventListener('pointermove', function (e) {
    if (!drag) return;
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
      'process-tree-right': '진행트리·오른쪽', 'timeline': '시간배치'
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
        var where = [];
        if (inText) where.push('노드');
        if (inTags) where.push('태그');
        if (inNotes) where.push('노트');
        if (inLinks) where.push('링크');
        out.push({ id: n.id, title: text, path: path.join(' › '), where: where.join(' · ') });
      }
      var kids = n.children || [];
      for (var i = 0; i < kids.length; i++) walk(kids[i], path.concat([text]));
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
      var rect = svg.getBoundingClientRect();
      view.x = rect.width / 2 - found._cx * view.k;
      view.y = rect.height / 2 - found._cy * view.k;
      applyView();
    }
    renderSearchList(); // 선택 항목 표시 갱신
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
      html += '<div class="hit' + (h.id === SEARCHHIT ? ' on' : '') +
        '" data-hit="' + escapeHtml2(h.id) + '" title="클릭하면 노란 강조로 표시됩니다">' +
        '<div class="ttl">' + t2 + '</div>' +
        '<div class="sub">' + escapeHtml2(h.path || '루트') + ' · <b>' +
        escapeHtml2(h.where) + '</b></div></div>';
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
    zoomTo((Math.round(view.k * 100) - 10) / 100); // 에디터와 동일: 10%p 단위
  });
  document.getElementById('mm-zoom-in').addEventListener('click', function () {
    zoomTo((Math.round(view.k * 100) + 10) / 100);
  });
  document.getElementById('mm-zoom-pct').addEventListener('click', function () {
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
  // 다크 모드 — 브라우저에 저장 (다음에 열 때 유지)
  var darkBtn = document.getElementById('mm-dark');
  function setDark(on) {
    document.body.classList.toggle('mm-dark', on);
    darkBtn.textContent = on ? '☀' : '🌙';
    darkBtn.setAttribute('title', on ? '라이트 모드로 전환' : '다크 모드로 전환');
    SKIN = on ? SKIN_DARK : SKIN_LIGHT;
    render(); // 노드 카드·글자·연결선까지 스킨 교체 (에디터 다크와 파리티)
    try { localStorage.setItem('easymindmap.viewer.dark', on ? '1' : '0'); } catch (e) {}
  }
  darkBtn.addEventListener('click', function () {
    setDark(!document.body.classList.contains('mm-dark'));
  });
  try { if (localStorage.getItem('easymindmap.viewer.dark') === '1') setDark(true); } catch (e) {}

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
    setAll(DATA.root, false); DATA.root.collapsed = false; render(); fit();
  });
  document.getElementById('mm-collapse').addEventListener('click', function () {
    setAll(DATA.root, true); DATA.root.collapsed = false; render(); fit();
  });

  render();
  fit();
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
  #mm-svg {
    flex: 1; width: 100%; height: 100%; cursor: default; touch-action: none;
    background: radial-gradient(circle, #E4D9C377 1px, transparent 1px) 0 0 / 24px 24px;
  }
  body.mm-panmode #mm-svg { cursor: grab; }
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
  /* 문단·코드 글자 크기 10 통일. 문단은 입력한 줄 그대로(pre) 표시하고
     창 폭보다 길면 블록에 가로 스크롤바가 나타난다. */
  .mm-note-block {
    margin-bottom: 6px; line-height: 1.5; font-size: inherit;
    white-space: pre; overflow-x: auto;
  }
  .mm-note-block a { color: #1D4ED8; text-decoration: none; word-break: break-all; }
  .mm-note-block a:hover { text-decoration: underline; }
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
): string {
  const layoutType = (mapLayoutType ??
    map.root.layoutType ??
    'radial-bidirectional') as LayoutType;

  // 에디터와 동일한 레이아웃 엔진으로 최종 좌표(간격 배율 포함)를 계산해
  // 노드마다 실어 보낸다 — 뷰어가 에디터 화면과 똑같이 그린다.
  // 맵 설정(레벨별 폰트)도 측정에 반영하고 글꼴(ff)을 노드마다 실어 보낸다.
  setLevelFontConfig(map.settings?.levelFonts);
  const laid = computeLayout(map, layoutType, 700, 400, spacing);
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
      },
    ]),
  );
  const resolvePos: PosResolver = (id) => posById.get(id);
  const sideById = new Map<string, string | undefined>(laid.map((n) => [n.id, n.side]));
  const resolveSide: SideResolver = (id) => sideById.get(id);

  const data = {
    title: map.title,
    mapLayout: layoutType,
    // 노트 글꼴·크기 (맵 설정 — 뷰어 노트 패널에 적용, 기본 13pt)
    noteFont: map.settings?.noteFont,
    root: {
      ...toExportNode({
        id: 'root',
        text: map.root.text,
        textAlign: map.root.textAlign ?? levelTextAlign(0),
        style: map.root.style,
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
<style>${VIEWER_CSS}</style>
</head>
<body>
<header>
  <h1>🗺 ${escapeHtml(map.title)}</h1>
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
  <button id="mm-fullscreen" class="icon" title="전체화면 모드"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="3"/><polyline points="14 8 16 8 16 10"/><polyline points="10 16 8 16 8 14"/><line x1="16" y1="8" x2="12.5" y2="11.5"/><line x1="8" y1="16" x2="11.5" y2="12.5"/></svg></button>
  <button id="mm-dark" class="icon" title="다크 모드로 전환">🌙</button>
</header>
<svg id="mm-svg"><g id="mm-world"></g></svg>
<div id="mm-note">
  <button id="mm-note-close">✕</button>
  <h2 id="mm-note-title"></h2>
  <div id="mm-note-body"></div>
</div>
<div id="mm-zoombar">
  <button id="mm-zoom-out" title="축소 (10% 단위)">−</button>
  <button id="mm-zoom-pct" title="100%로 재설정">100%</button>
  <button id="mm-zoom-in" title="확대 (10% 단위)">+</button>
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
): Promise<ExportPackage> {
  const title = safeName(map.title, 'mindmap');

  const attachments: NodeAttachment[] = [];
  collectAttachments(map.branches, attachments);

  if (attachments.length === 0) {
    const html = buildStandaloneHtml(map, mapLayoutType, undefined, spacing);
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
      const res = await fetch(att.url);
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
    map, mapLayoutType, (id) => hrefById.get(id), spacing, metaMap);

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
): Promise<void> {
  const pkg = await buildExportPackage(map, mapLayoutType, spacing);
  const url = URL.createObjectURL(pkg.blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = pkg.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
