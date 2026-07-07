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
import { buildZip, type ZipEntry } from './zip';

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
  notes?: { type: string; text: string; checked?: boolean }[];
  attachments?: ExportAttachment[];
  collapsed?: boolean;
  colorKey?: string;
  // Layout preservation: per-node subtree override + radial side.
  layoutType?: string;
  side?: string;
  children?: ExportNode[];
}

// Maps attachment id → packaged relative href ('files/…'). Attachments not in
// the map keep their original URL and are marked external.
type AttachmentHrefResolver = (attachmentId: string) => string | undefined;

function toExportNode(node: MindNode, resolveHref?: AttachmentHrefResolver): ExportNode {
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
    layoutType: node.layoutType,
    side: node.side,
    children: (node.children ?? []).map((c) => toExportNode(c, resolveHref)),
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

  // ---- measure pass (bottom-up, per-layout block model) ----------------------
  // Sets on each node: _w/_h (box), _boxH (box + tag reserve), _lines/_fs/
  // _lineH, _open, _eff (effective layout for ITS children), _bw/_bh (block),
  // _nx/_ny (node CENTER offset within the block).
  function sum(kids, f) { var s = 0; for (var i = 0; i < kids.length; i++) s += f(kids[i]); return s; }
  function maxOf(kids, f) { var s = 0; for (var i = 0; i < kids.length; i++) s = Math.max(s, f(kids[i])); return s; }

  function measure(node, depth, inheritedEff) {
    var eff = normalize(node.layoutType) || inheritedEff;
    node._eff = eff;

    var fontSize = depth === 0 ? 17 : depth === 1 ? 13.5 : 12.5;
    var wrapped = wrapText(node.text, fontSize, depth === 0 ? 240 : 220);
    var lineH = fontSize * 1.35;
    var iconW = node.icon ? fontSize + 6 : 0;
    var w = Math.max(depth === 0 ? 120 : 90, wrapped.w + iconW) + PAD_X * 2;
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
    var pBottom = p._cy + p._h / 2;
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

  function render() {
    while (world.firstChild) world.removeChild(world.firstChild);
    var rootEff = normalize(DATA.root.layoutType) || normalize(DATA.mapLayout) || 'radial-bidirectional';
    DATA.root.layoutType = DATA.root.layoutType || rootEff;
    measure(DATA.root, 0, rootEff);
    arrange(DATA.root, 40, 40);
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
    for (var li = 0; li < node._lines.length; li++) {
      var t = el('text', {
        x: tx, y: y0 + PAD_Y + node._fs * 0.85 + li * node._lineH,
        'font-size': node._fs,
        'font-weight': isRoot ? 700 : (depth === 1 ? 600 : 500),
        fill: textColor
      }, g);
      t.textContent = node._lines[li];
    }

    if (node.tags && node.tags.length) {
      var bx2 = x0 + 6;
      for (var ti = 0; ti < node.tags.length; ti++) {
        var label = node.tags[ti];
        var bw2 = measureText(label, 9.5) + 14;
        el('rect', { x: bx2, y: node._cy + node._h / 2 + 4, width: bw2, height: TAG_H,
          rx: 3, fill: color + '1A', stroke: color + '55', 'stroke-width': 0.8 }, g);
        var bt = el('text', { x: bx2 + 7, y: node._cy + node._h / 2 + 4 + TAG_H - 4,
          'font-size': 9.5, 'font-weight': 600, fill: color }, g);
        bt.textContent = label;
        bx2 += bw2 + 4;
      }
    }

    // content markers — each opens the detail panel (tags/links/notes/files)
    var markers = [];
    if (node.links && node.links.length) markers.push('🔗');
    if (node.notes && node.notes.length) markers.push('📝');
    if (node.attachments && node.attachments.length) markers.push('📎');
    if (markers.length) {
      var mk = el('text', { x: x0 + node._w - PAD_X + 4, y: y0 + 12,
        'font-size': 9.5, 'text-anchor': 'end', cursor: 'pointer' }, g);
      mk.textContent = markers.join('');
      (function (n) {
        mk.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        mk.addEventListener('click', function (ev) { ev.stopPropagation(); showDetail(n); });
      })(node);
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
  function showDetail(node) {
    noteTitle.textContent = node.text;
    noteBody.textContent = '';
    var i, a, row;

    if (node.tags && node.tags.length) {
      section('태그');
      row = document.createElement('div');
      row.className = 'mm-tagrow';
      for (i = 0; i < node.tags.length; i++) {
        var chip = document.createElement('span');
        chip.className = 'mm-chip';
        chip.textContent = '#' + node.tags[i];
        row.appendChild(chip);
      }
      noteBody.appendChild(row);
    }

    if (node.links && node.links.length) {
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

    if (node.notes && node.notes.length) {
      section('메모');
      for (i = 0; i < node.notes.length; i++) {
        var pEl = document.createElement('div');
        pEl.className = 'mm-note-block mm-note-' + node.notes[i].type;
        pEl.textContent = (node.notes[i].type === 'checklist'
          ? (node.notes[i].checked ? '☑ ' : '☐ ') : '') + node.notes[i].text;
        noteBody.appendChild(pEl);
      }
    }

    if (node.attachments && node.attachments.length) {
      section('첨부 파일');
      for (i = 0; i < node.attachments.length; i++) {
        var att = node.attachments[i];
        row = document.createElement('div');
        row.className = 'mm-note-block';
        if (att.href) {
          a = document.createElement('a');
          a.href = att.href;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = '📎 ' + att.name + (att.external ? ' ↗' : '');
          if (!att.external) a.setAttribute('download', att.name);
          row.appendChild(a);
        } else {
          row.textContent = '📎 ' + att.name + ' (파일 없음)';
        }
        noteBody.appendChild(row);
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
  .mm-note-block a { color: #1D4ED8; text-decoration: none; word-break: break-all; }
  .mm-note-block a:hover { text-decoration: underline; }
  .mm-sec {
    font-size: 10px; font-weight: 700; color: #8B7D68; letter-spacing: 0.5px;
    margin: 10px 0 5px; padding-top: 8px; border-top: 1px solid #EFE7D6;
  }
  .mm-sec:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  .mm-tagrow { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
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
): string {
  const data = {
    title: map.title,
    mapLayout: mapLayoutType ?? map.root.layoutType ?? 'radial-bidirectional',
    root: {
      ...toExportNode({ id: 'root', text: map.root.text } as MindNode, resolveHref),
      colorKey: 'root',
      layoutType: map.root.layoutType ?? mapLayoutType,
      children: map.branches.map((b) => toExportNode(b, resolveHref)),
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
): Promise<ExportPackage> {
  const title = safeName(map.title, 'mindmap');

  const attachments: NodeAttachment[] = [];
  collectAttachments(map.branches, attachments);

  if (attachments.length === 0) {
    const html = buildStandaloneHtml(map, mapLayoutType);
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

  const html = buildStandaloneHtml(map, mapLayoutType, (id) => hrefById.get(id));

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
): Promise<void> {
  const pkg = await buildExportPackage(map, mapLayoutType);
  const url = URL.createObjectURL(pkg.blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = pkg.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
