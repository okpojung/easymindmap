// File: src/export/exportHtml.ts
// Version: MVP-ExportHtml-v1.0.0
// Spec: docs/04-extensions/import-export/20-export.md — EXPORT-02 (Standalone HTML)
// Description:
// - Builds a SINGLE self-contained .html file for the current map:
//   no external CDN, all CSS/JS inlined, works offline (spec § Standalone
//   HTML 요건).
// - The file is a READ-ONLY interactive viewer (spec § 뷰어 기능 목록):
//   · full map rendering (markmap-style right tree, curved connectors)
//   · mouse-wheel zoom anchored at the cursor
//   · drag pan
//   · Fit Screen / expand-all / collapse-all buttons
//   · per-node collapse-expand toggle (child-count chip ↔ − chip)
//   · tag badges, hyperlink (first link opens in a new tab), note panel
//   · collapsed nodes exported with their saved state (spec § 접힌 노드 처리)
// - The map data is embedded as JSON; `<` is escaped to < so closing
//   tags inside node text can never break out of the <script> block.

import type { MindNode, SampleMap } from '@/editor/__samples__/types';

interface ExportNode {
  id: string;
  text: string;
  icon?: string;
  tags?: string[];
  links?: { url: string; label?: string }[];
  notes?: { type: string; text: string; checked?: boolean }[];
  collapsed?: boolean;
  colorKey?: string;
  children?: ExportNode[];
}

function toExportNode(node: MindNode): ExportNode {
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
    notes: node.notes?.map((n) => ({ type: n.type, text: n.text, checked: n.checked })),
    collapsed: node.collapsed || undefined,
    colorKey: node.colorKey,
    children: (node.children ?? []).map(toExportNode),
  };
}

// The read-only viewer that runs inside the exported file. Plain ES5-ish JS,
// no dependencies, no backticks (this whole script lives inside a template
// literal). It re-runs layout on every collapse/expand.
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

  // ---- palette (mirrors the editor's light theme accents) -----------------
  var COLORS = {
    root: '#C2410C',
    l1A: '#B45309', l1B: '#1D4ED8', l1C: '#15803D',
    l1D: '#BE185D', l1E: '#7C3AED', l2: '#64748B'
  };
  function branchColor(key) { return COLORS[key] || '#8B7355'; }

  // ---- geometry ------------------------------------------------------------
  var H_GAP = 46;      // parent right edge → child left edge
  var V_GAP = 12;      // vertical gap between sibling subtrees
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

  // Wrap text to maxW; returns {lines, w}
  function wrapText(text, fontSize, maxW) {
    var out = [];
    var manual = String(text || '').split('\n');
    for (var m = 0; m < manual.length; m++) {
      var words = manual[m].split(/(\s+)/), cur = '', curW = 0;
      for (var i = 0; i < words.length; i++) {
        var ww = measureText(words[i], fontSize);
        if (curW + ww > maxW && cur !== '') { out.push(cur.replace(/\s+$/, '')); cur = ''; curW = 0; }
        if (ww > maxW) { // hard-break long tokens
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

  // measure pass (bottom-up): node box + subtree height
  function measure(node, depth) {
    var fontSize = depth === 0 ? 17 : depth === 1 ? 13.5 : 12.5;
    var wrapped = wrapText(node.text, fontSize, depth === 0 ? 240 : 220);
    var lineH = fontSize * 1.35;
    var iconW = node.icon ? fontSize + 6 : 0;
    var w = Math.max(depth === 0 ? 120 : 90, wrapped.w + iconW) + PAD_X * 2;
    var h = wrapped.lines.length * lineH + PAD_Y * 2;
    var tagsH = (node.tags && node.tags.length) ? TAG_H + 5 : 0;

    node._fs = fontSize; node._lines = wrapped.lines; node._lineH = lineH;
    node._w = w; node._h = h; node._tagsH = tagsH;
    node._open = !node.collapsed;

    var kidsH = 0;
    var kids = node.children || [];
    if (node._open) {
      for (var i = 0; i < kids.length; i++) {
        kidsH += measure(kids[i], depth + 1);
        if (i > 0) kidsH += V_GAP;
      }
    } else {
      for (var j = 0; j < kids.length; j++) measure(kids[j], depth + 1);
    }
    node._subH = Math.max(h + tagsH, kidsH);
    return node._subH;
  }

  // arrange pass (top-down): left-edge x, center y
  function arrange(node, leftX, centerY) {
    node._x = leftX; node._y = centerY;
    if (!node._open) return;
    var kids = node.children || [];
    var total = 0;
    for (var i = 0; i < kids.length; i++) { total += kids[i]._subH; if (i > 0) total += V_GAP; }
    var cy = centerY - total / 2;
    for (var j = 0; j < kids.length; j++) {
      arrange(kids[j], leftX + node._w + H_GAP, cy + kids[j]._subH / 2);
      cy += kids[j]._subH + V_GAP;
    }
  }

  // ---- render ----------------------------------------------------------------
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function edgePath(a, b) {
    var x1 = a._x + a._w, y1 = a._y, x2 = b._x, y2 = b._y;
    var mx = (x1 + x2) / 2;
    return 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2;
  }

  function render() {
    while (world.firstChild) world.removeChild(world.firstChild);
    measure(DATA.root, 0);
    arrange(DATA.root, 40, 0);
    drawNode(DATA.root, 0, null);
    updateCount();
  }

  function drawNode(node, depth, parentColor) {
    var color = depth === 0 ? COLORS.root : (depth === 1 ? branchColor(node.colorKey) : (parentColor || '#8B7355'));
    var kids = node.children || [];

    if (node._open) {
      for (var i = 0; i < kids.length; i++) {
        el('path', { d: edgePath(node, kids[i]), fill: 'none',
          stroke: '#C9BBA4', 'stroke-width': depth === 0 ? 2.2 : 1.6 }, world);
        drawNode(kids[i], depth + 1, color);
      }
    }

    var g = el('g', { 'class': 'mm-node' }, world);
    var isRoot = depth === 0;
    el('rect', {
      x: node._x, y: node._y - node._h / 2, width: node._w, height: node._h,
      rx: isRoot ? 13 : 9,
      fill: isRoot ? COLORS.root : '#FFFFFF',
      stroke: isRoot ? COLORS.root : color,
      'stroke-width': isRoot ? 0 : 1.4
    }, g);

    var textColor = isRoot ? '#FFFFFF' : '#3F3428';
    var tx = node._x + PAD_X;
    if (node.icon) {
      var ic = el('text', { x: tx, y: node._y - node._h / 2 + PAD_Y + node._fs * 0.85,
        'font-size': node._fs + 1 }, g);
      ic.textContent = node.icon;
      tx += node._fs + 6;
    }
    for (var li = 0; li < node._lines.length; li++) {
      var t = el('text', {
        x: tx,
        y: node._y - node._h / 2 + PAD_Y + node._fs * 0.85 + li * node._lineH,
        'font-size': node._fs,
        'font-weight': isRoot ? 700 : (depth === 1 ? 600 : 500),
        fill: textColor
      }, g);
      t.textContent = node._lines[li];
    }

    // tag badges below the box
    if (node.tags && node.tags.length) {
      var bx = node._x + 6;
      for (var ti = 0; ti < node.tags.length; ti++) {
        var label = node.tags[ti];
        var bw = measureText(label, 9.5) + 14;
        el('rect', { x: bx, y: node._y + node._h / 2 + 4, width: bw, height: TAG_H,
          rx: 3, fill: color + '1A', stroke: color + '55', 'stroke-width': 0.8 }, g);
        var bt = el('text', { x: bx + 7, y: node._y + node._h / 2 + 4 + TAG_H - 4,
          'font-size': 9.5, 'font-weight': 600, fill: color }, g);
        bt.textContent = label;
        bx += bw + 4;
      }
    }

    // link marker → opens the first link (spec: 하이퍼링크 클릭 지원)
    if (node.links && node.links.length) {
      var lk = el('text', { x: node._x + node._w - PAD_X + 2, y: node._y - node._h / 2 + 13,
        'font-size': 10, 'class': 'mm-link', cursor: 'pointer' }, g);
      lk.textContent = '🔗';
      (function (url) {
        // stop pointerdown so the svg pan handler doesn't capture the pointer
        // (capture would swallow the click).
        lk.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        lk.addEventListener('click', function (ev) { ev.stopPropagation(); window.open(url, '_blank'); });
      })(node.links[0].url);
    }

    // note marker → shows the note panel
    if (node.notes && node.notes.length) {
      var nm = el('text', { x: node._x + 3, y: node._y + node._h / 2 - 4,
        'font-size': 9.5, cursor: 'pointer' }, g);
      nm.textContent = '📝';
      (function (n) {
        nm.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        nm.addEventListener('click', function (ev) { ev.stopPropagation(); showNote(n); });
      })(node);
    }

    // collapse / expand chip on the right edge
    if (kids.length) {
      var cx = node._x + node._w + 11, cy = node._y;
      var chip = el('g', { cursor: 'pointer', 'class': 'mm-toggle' }, g);
      el('circle', { cx: cx, cy: cy, r: 8.5, fill: node._open ? '#FFFFFF' : color,
        stroke: color, 'stroke-width': 1.3 }, chip);
      var ct = el('text', { x: cx, y: cy + 3.4, 'text-anchor': 'middle',
        'font-size': 9.5, 'font-weight': 700, fill: node._open ? color : '#FFFFFF' }, chip);
      ct.textContent = node._open ? '−' : String(countDescendants(node));
      (function (n) {
        chip.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        chip.addEventListener('click', function (ev) {
          ev.stopPropagation();
          n.collapsed = !n.collapsed;
          render(); // relayout with the new collapse state
        });
      })(node);
    }
  }

  function countDescendants(node) {
    var c = 0, kids = node.children || [];
    for (var i = 0; i < kids.length; i++) c += 1 + countDescendants(kids[i]);
    return c;
  }

  function showNote(node) {
    noteTitle.textContent = node.text;
    noteBody.textContent = '';
    for (var i = 0; i < node.notes.length; i++) {
      var p = document.createElement('div');
      p.className = 'mm-note-block mm-note-' + node.notes[i].type;
      p.textContent = (node.notes[i].type === 'checklist'
        ? (node.notes[i].checked ? '☑ ' : '☐ ') : '') + node.notes[i].text;
      noteBody.appendChild(p);
    }
    notePanel.style.display = 'block';
  }
  document.getElementById('mm-note-close').addEventListener('click', function () {
    notePanel.style.display = 'none';
  });

  // ---- viewport: wheel zoom (cursor-anchored) + drag pan + fit -------------
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
    var k2 = Math.min(3, Math.max(0.15, view.k * factor));
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
    document.getElementById('mm-count').textContent =
      (1 + countDescendants(DATA.root)) + ' 노드';
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
  .mm-note-block { margin-bottom: 6px; line-height: 1.5; white-space: pre-wrap; }
  .mm-note-code_block {
    font-family: ui-monospace, monospace; background: #F3ECDD;
    border-radius: 5px; padding: 6px 8px; font-size: 11px;
  }
  .mm-note-warning { color: #B45309; }
  .mm-note-tip { color: #15803D; }
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
export function buildStandaloneHtml(map: SampleMap): string {
  const data = {
    title: map.title,
    root: {
      ...toExportNode({ id: 'root', text: map.root.text } as MindNode),
      colorKey: 'root',
      children: map.branches.map(toExportNode),
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

// Triggers a browser download of the standalone HTML file.
export function downloadMapAsHtml(map: SampleMap): void {
  const html = buildStandaloneHtml(map);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${map.title.replace(/[\\/:*?"<>|]/g, '_') || 'mindmap'}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
