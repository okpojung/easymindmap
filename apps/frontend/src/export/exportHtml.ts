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
import { setLevelFontConfig, levelFontFamily } from '@/editor/node-renderer/sizeNodeForText';
import { buildZip, type ZipEntry } from './zip';

// 에디터가 계산한 노드의 최종 배치 좌표 — 뷰어는 이 좌표를 그대로 사용해
// 에디터 화면과 100% 동일한 레이아웃을 재현한다 (자체 레이아웃은 좌표가
// 없을 때의 폴백). 접기/펴기는 표시/숨김만 하고 재배치하지 않는다.
interface ExportPos {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
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
  style?: { strike?: boolean; highlight?: boolean };
  // Layout preservation: per-node subtree override + radial side.
  layoutType?: string;
  side?: string;
  pos?: ExportPos; // 에디터 계산 좌표 (있으면 뷰어가 그대로 사용)
  children?: ExportNode[];
}

type PosResolver = (nodeId: string) => ExportPos | undefined;

// Maps attachment id → packaged relative href ('files/…'). Attachments not in
// the map keep their original URL and are marked external.
type AttachmentHrefResolver = (attachmentId: string) => string | undefined;

function toExportNode(
  node: MindNode,
  resolveHref?: AttachmentHrefResolver,
  resolvePos?: PosResolver,
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
    textAlign: node.textAlign,
    style: node.style && (node.style.strike || node.style.highlight)
      ? { strike: node.style.strike || undefined, highlight: node.style.highlight || undefined }
      : undefined,
    layoutType: node.layoutType,
    side: node.side,
    pos: resolvePos?.(node.id),
    children: (node.children ?? []).map((c) => toExportNode(c, resolveHref, resolvePos)),
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
  var noteTitle = document.getElementById('mm-note-title');
  var NS = 'http://www.w3.org/2000/svg';

  var COLORS = {
    root: '#C2410C',
    l1A: '#B45309', l1B: '#1D4ED8', l1C: '#15803D',
    l1D: '#BE185D', l1E: '#7C3AED', l2: '#64748B'
  };
  function branchColor(key) { return COLORS[key] || '#8B7355'; }

  // ---- effective layout ----------------------------------------------------
  // Same inheritance rule as the editor (08-layout.md §6.2 / SubtreeStrategy):
  // a node uses its own layoutType if set, otherwise its parent's effective
  // layout. freeform/kanban render as radial-right in this mindmap viewer.
  var KNOWN = {
    'radial-bidirectional': 1, 'radial-right': 1, 'radial-left': 1,
    'tree-right': 1, 'tree-down': 1, 'hierarchy-right': 1,
    'process-tree-right': 1
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

  function wrapText(text, fontSize, maxW) {
    var out = [];
    var manual = String(text || '').split('\n');
    for (var m = 0; m < manual.length; m++) {
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
    return { lines: out, w: w };
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

  // ---- measure pass (bottom-up, per-layout block model) ----------------------
  // Sets on each node: _w/_h (box), _boxH (box + tag reserve), _lines/_fs/
  // _lineH, _open, _eff (effective layout for ITS children), _bw/_bh (block),
  // _nx/_ny (node CENTER offset within the block).
  function sum(kids, f) { var s = 0; for (var i = 0; i < kids.length; i++) s += f(kids[i]); return s; }
  function maxOf(kids, f) { var s = 0; for (var i = 0; i < kids.length; i++) s = Math.max(s, f(kids[i])); return s; }

  // 인디케이터(🔗📝📎▶️) 개수 — 노드 박스 안(텍스트 뒤)에 그려지므로
  // 폭 계산에 포함해 모든 마커가 박스 안에 들어가게 한다.
  function markerCount(node) {
    var n = 0, hasFile = false, hasMedia = false, i;
    if (node.links && node.links.length) n++;
    if (node.notes && node.notes.length) n++;
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
    } else {
      var t2 = el('text', { x: cx, y: cy + size * 0.32, 'font-size': size - 2, 'text-anchor': 'middle' }, g2);
      t2.textContent = kind === 'note' ? '📝' : '▶️';
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
    drawNode(DATA.root, 0, null);
    updateCount();
  }

  function drawNode(node, depth, parentColor) {
    var color = depth === 0 ? COLORS.root : (depth === 1 ? branchColor(node.colorKey) : (parentColor || '#8B7355'));
    var kids = node.children || [];

    if (node._open) {
      for (var i = 0; i < kids.length; i++) {
        el('path', { d: edgePath(node, kids[i]), fill: 'none',
          stroke: '#C9BBA4', 'stroke-width': depth === 0 ? 2.2 : 1.6,
          'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, world);
        drawNode(kids[i], depth + 1, color);
      }
    }

    var g = el('g', { 'class': 'mm-node' }, world);
    var isRoot = depth === 0;
    var x0 = node._cx - node._w / 2, y0 = node._cy - node._h / 2;
    el('rect', {
      x: x0, y: y0, width: node._w, height: node._h,
      rx: isRoot ? 13 : 9,
      fill: isRoot ? COLORS.root : '#FFFFFF',
      stroke: isRoot ? COLORS.root : color,
      'stroke-width': isRoot ? 0 : 1.4
    }, g);

    var textColor = isRoot ? '#FFFFFF' : '#3F3428';
    var tx = x0 + PAD_X;
    if (node.icon) {
      var ic = el('text', { x: tx, y: y0 + PAD_Y + node._fs * 0.85, 'font-size': node._fs + 1 }, g);
      ic.textContent = node.icon;
      tx += node._fs + 6;
    }
    // 텍스트 강조(취소선·하이라이트)·정렬·글꼴 + Markdown 표 — 에디터와 동일
    var st = node.style || {};
    var align = node.textAlign || 'left';
    var mdt = node._fixed ? parseMdTable(node.text) : null;
    var cellFs = 0, rowH2 = 0, tGap = 0, tblH = 0;
    if (mdt) {
      cellFs = Math.max(10, node._fs - 2);
      rowH2 = cellFs + 10;
      tGap = node._lines.length ? 6 : 0;
      tblH = (1 + mdt.rows.length) * rowH2;
    }
    var contentH = node._lines.length * node._lineH + (mdt ? tblH + tGap : 0);
    var topY = node._cy - contentH / 2;
    var anchor = align === 'center' ? 'middle' : (align === 'right' ? 'end' : 'start');
    for (var li = 0; li < node._lines.length; li++) {
      var lineTxt = node._lines[li];
      var baseY = mdt
        ? topY + li * node._lineH + node._lineH / 2 + node._fs * 0.34
        : y0 + PAD_Y + node._fs * 0.85 + li * node._lineH;
      var lx = align === 'center' ? x0 + node._w / 2
        : (align === 'right' ? x0 + node._w - PAD_X - (node._marksW || 0) : tx);
      if (st.highlight && lineTxt) {
        var lw = measureText(lineTxt, node._fs);
        var hx = anchor === 'middle' ? lx - lw / 2 - 3 : (anchor === 'end' ? lx - lw - 3 : lx - 3);
        el('rect', { x: hx, y: baseY - node._fs * 1.06, width: lw + 6,
          height: node._fs * 1.44, rx: 2, fill: '#FFE066', opacity: 0.85 }, g);
      }
      var tAttrs = {
        x: lx, y: baseY,
        'font-size': node._fs,
        'font-weight': isRoot ? 700 : (depth === 1 ? 600 : 500),
        'text-anchor': anchor,
        fill: textColor
      };
      if (st.strike) tAttrs['text-decoration'] = 'line-through';
      if (node._ff) tAttrs['font-family'] = node._ff;
      var t = el('text', tAttrs, g);
      t.textContent = lineTxt;
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

    if (node.tags && node.tags.length) {
      var bx2 = x0 + 6;
      for (var ti = 0; ti < node.tags.length; ti++) {
        var label = node.tags[ti];
        var bw2 = measureText(label, 9.5) + 14;
        // 배경을 불투명하게(흰 바탕 + 파스텔 칩) — 반투명이면 뒤로 지나가는
        // 연결선이 비쳐 태그와 겹쳐 보인다.
        el('rect', { x: bx2, y: node._cy + node._h / 2 + 4, width: bw2, height: TAG_H,
          rx: 3, fill: '#FFFDF8' }, g);
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
      markers.push({ kind: 'note', tip: '메모 보기',
        act: function () { showDetail(node, 'notes'); } });
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
      // chip on the side the subtree grows toward
      var leftish = node._eff === 'radial-left' ||
        (node._eff === 'radial-bidirectional' && node.side === 'left' && depth > 0);
      var ccx = leftish ? x0 - 11 : x0 + node._w + 11;
      var chip = el('g', { cursor: 'pointer', 'class': 'mm-toggle' }, g);
      el('circle', { cx: ccx, cy: node._cy, r: 8.5, fill: node._open ? '#FFFFFF' : color,
        stroke: color, 'stroke-width': 1.3 }, chip);
      var ct = el('text', { x: ccx, y: node._cy + 3.4, 'text-anchor': 'middle',
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
  }
  document.getElementById('mm-note-close').addEventListener('click', function () {
    notePanel.style.display = 'none';
  });

  // ---- viewport: wheel zoom (cursor-anchored) + drag pan + fit ---------------
  var view = { x: 0, y: 0, k: 1 };
  function applyView() {
    world.setAttribute('transform',
      'translate(' + view.x + ',' + view.y + ') scale(' + view.k + ')');
  }

  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = svg.getBoundingClientRect();
    var px = e.clientX - rect.left, py = e.clientY - rect.top;
    var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    var k2 = Math.min(3, Math.max(0.1, view.k * factor));
    view.x = px - ((px - view.x) / view.k) * k2;
    view.y = py - ((py - view.y) / view.k) * k2;
    view.k = k2;
    applyView();
  }, { passive: false });

  var drag = null;
  svg.addEventListener('pointerdown', function (e) {
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
  svg.addEventListener('pointerup', function () { drag = null; svg.style.cursor = 'grab'; });

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
      'process-tree-right': '진행트리·오른쪽'
    };
    var eff = normalize(DATA.root.layoutType) || 'radial-bidirectional';
    document.getElementById('mm-count').textContent =
      (1 + countDescendants(DATA.root)) + ' 노드 · ' + (layoutLabels[eff] || eff);
  }

  document.getElementById('mm-fit').addEventListener('click', fit);
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
    flex: 1; width: 100%; height: 100%; cursor: grab; touch-action: none;
    background: radial-gradient(circle, #E4D9C377 1px, transparent 1px) 0 0 / 24px 24px;
  }
  .mm-toggle:hover circle { filter: brightness(0.93); }
  /* 노트 뷰어 창 크기.
     [서버 연결 예정] 시스템 기본 크기는 관리자 설정(system_settings),
     사용자별 크기는 users.ui_preferences_json.noteViewer 로 이관 —
     docs/02-domain/db-schema.md §향후 관리 테이블, 32-settings.md 참조. */
  #mm-note {
    display: none; position: fixed; right: 14px; top: 60px; width: 280px;
    max-height: 60vh; overflow: auto; background: #FFFDF8;
    border: 1px solid #D8CBB2; border-radius: 10px; padding: 12px 14px;
    box-shadow: 0 8px 24px rgba(80, 60, 20, 0.15); font-size: 12px;
  }
  #mm-note h2 { font-size: 12.5px; margin-bottom: 8px; padding-right: 20px; }
  #mm-note-close {
    position: absolute; top: 8px; right: 10px; border: none; background: none;
    font-size: 14px; cursor: pointer; color: #8B7D68;
  }
  /* 문단·코드 글자 크기 10 통일. 문단은 입력한 줄 그대로(pre) 표시하고
     창 폭보다 길면 블록에 가로 스크롤바가 나타난다. */
  .mm-note-block {
    margin-bottom: 6px; line-height: 1.5; font-size: 10px;
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
    border-collapse: collapse; width: 100%; margin-bottom: 8px; font-size: 11.5px;
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
    margin: 0; padding: 7px 9px; font-size: 10px; line-height: 1.5;
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
  .mm-note-rich { white-space: normal; font-size: 10.5px; line-height: 1.6; }
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
        fs: n._fontSize ?? 13,
        lh: n._lineHeight ?? 18,
        ff: levelFontFamily(n.depth),
      },
    ]),
  );
  const resolvePos: PosResolver = (id) => posById.get(id);

  const data = {
    title: map.title,
    mapLayout: layoutType,
    root: {
      ...toExportNode({
        id: 'root',
        text: map.root.text,
        textAlign: map.root.textAlign,
        style: map.root.style,
      } as MindNode, resolveHref, resolvePos),
      colorKey: 'root',
      layoutType: map.root.layoutType ?? mapLayoutType,
      children: map.branches.map((b) => toExportNode(b, resolveHref, resolvePos)),
    },
  };

  // <-escape so node text like "</script>" cannot terminate the block.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const exportedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

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
  <button id="mm-fit" title="화면에 맞추기">⛶ 맞춤</button>
  <button id="mm-expand" title="모두 펼치기">모두 펼치기</button>
  <button id="mm-collapse" title="모두 접기">모두 접기</button>
</header>
<svg id="mm-svg"><g id="mm-world"></g></svg>
<div id="mm-note">
  <button id="mm-note-close">✕</button>
  <h2 id="mm-note-title"></h2>
  <div id="mm-note-body"></div>
</div>
<footer>EasyMindMap 내보내기 · 읽기 전용 뷰어 · ${exportedAt}</footer>
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
  const files: ZipEntry[] = [];
  const usedNames = new Set<string>();

  for (const att of attachments) {
    if (!att.url) continue;
    try {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error(String(res.status));
      const bytes = new Uint8Array(await res.arrayBuffer());

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

  const html = buildStandaloneHtml(map, mapLayoutType, (id) => hrefById.get(id), spacing);

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
