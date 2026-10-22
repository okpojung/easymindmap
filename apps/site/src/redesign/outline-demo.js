/** Homepage-only outline/map editor. Memory only: no network, account or storage APIs. */
export const DEMO_LIMITS = Object.freeze({ nodes: 80, levels: 8, text: 10000, totalText: 60000 });
const GAP = 64;
export function createDemo(text) {
  const state = { root: null, nextId: 1 }; let branch = null;
  const make = value => ({ id: 'demo-' + state.nextId++, text: value, children: [] });
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    if (/^#\s+/.test(line)) { state.root = make(line.replace(/^#\s+/, '')); branch = null; continue; }
    if (!state.root) state.root = make('나의 생각 맵');
    if (/^##\s+/.test(line)) { branch = make(line.replace(/^##\s+/, '')); state.root.children.push(branch); }
    else (branch || state.root).children.push(make(line.replace(/^[-*+]\s+/, '')));
  }
  return state;
}
export function flattenDemo(state) {
  const rows = [];
  function visit(node, parent, depth, branch) {
    rows.push({ node, parent, depth, branch });
    node.children.forEach((child, index) => visit(child, node, depth + 1, depth === 0 ? index : branch));
  }
  if (state.root) visit(state.root, null, 0, 0);
  return rows;
}
export function addDemoNode(state, id, kind = 'child') {
  const rows = flattenDemo(state); const found = rows.find(row => row.node.id === id);
  if (rows.length >= DEMO_LIMITS.nodes) return { ok: false, message: '간단 체험은 최대 ' + DEMO_LIMITS.nodes + '개 노드까지 추가할 수 있습니다.' };
  if (state.root && !found) return { ok: false, message: '먼저 노드를 선택해 주세요.' };
  if (kind === 'sibling' && !found?.parent) return { ok: false, message: '중심 노드는 같은 단계로 추가할 수 없습니다.' };
  const depth = found ? found.depth + (kind === 'child' ? 1 : 0) : 0;
  if (depth >= DEMO_LIMITS.levels) return { ok: false, message: '간단 체험은 ' + DEMO_LIMITS.levels + '단계까지 연결할 수 있습니다.' };
  const value = state.root ? '새 생각' : '나의 생각 맵';
  if (rows.reduce((sum, row) => sum + row.node.text.length, 0) + value.length > DEMO_LIMITS.totalText) return { ok: false, message: '전체 입력 한도에 도달했습니다. 내용을 줄인 뒤 추가해 주세요.' };
  const item = { id: 'demo-' + state.nextId++, text: value, children: [] };
  if (!state.root) state.root = item;
  else if (kind === 'sibling') found.parent.children.splice(found.parent.children.indexOf(found.node) + 1, 0, item);
  else found.node.children.push(item);
  return { ok: true, id: item.id };
}
export function updateDemoNode(state, id, text) {
  const rows = flattenDemo(state); const found = rows.find(row => row.node.id === id);
  if (!found || typeof text !== 'string') return { ok: false, message: '수정할 노드를 찾지 못했습니다.' };
  const total = rows.reduce((sum, row) => sum + row.node.text.length, 0) - found.node.text.length + text.length;
  if (text.length > DEMO_LIMITS.text || total > DEMO_LIMITS.totalText) return { ok: false, message: '입력 한도(노드당 10,000자, 전체 60,000자)를 넘었습니다. 내용을 자르지 않고 이전 입력을 유지했습니다.' };
  found.node.text = text; return { ok: true, id };
}
export function deleteDemoNode(state, id) {
  const found = flattenDemo(state).find(row => row.node.id === id);
  if (!found) return { ok: false, message: '삭제할 노드를 찾지 못했습니다.' };
  if (found.parent) found.parent.children.splice(found.parent.children.indexOf(found.node), 1);
  else state.root = null;
  return { ok: true, id: found.parent?.id || null };
}
export function wrapDemoText(text, maxWidth, measure = char => /[\u0000-\u007f]/.test(char) ? 8 : 14) {
  const lines = []; const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
  for (const paragraph of String(text).split('\n')) {
    let line = ''; let width = 0;
    const segments = segmenter ? Array.from(segmenter.segment(paragraph), part => part.segment) : Array.from(paragraph);
    for (const char of segments) { const size = measure(char); if (line && width + size > maxWidth) { lines.push(line); line = ''; width = 0; } line += char; width += size; }
    lines.push(line);
  }
  return lines;
}
export function layoutDemo(state, measure) {
  const rows = flattenDemo(state); const boxes = new Map();
  for (const row of rows) {
    const width = row.depth === 0 ? 184 : row.depth === 1 ? 200 : 216;
    const lines = wrapDemoText(row.node.text || '내용을 입력하세요', width - 28, measure);
    boxes.set(row.node.id, { ...row, width, height: Math.max(48, lines.length * 22 + 24), lines, span: 0, x: 0, y: 0 });
  }
  function span(node) { const box = boxes.get(node.id); const children = node.children.map(span); box.span = Math.max(box.height + 48, children.reduce((a, b) => a + b, 0) + Math.max(0, children.length - 1) * GAP); return box.span; }
  function place(node, top) {
    const box = boxes.get(node.id); box.x = 24 + (box.depth === 0 ? 0 : 184 + 92 + (box.depth > 1 ? 200 + 92 + (box.depth - 2) * 308 : 0)); box.y = top + (box.span - box.height) / 2;
    const childHeight = node.children.reduce((sum, child) => sum + boxes.get(child.id).span, 0) + Math.max(0, node.children.length - 1) * GAP;
    let childTop = top + (box.span - childHeight) / 2;
    node.children.forEach(child => { place(child, childTop); childTop += boxes.get(child.id).span + GAP; });
  }
  if (state.root) { span(state.root); place(state.root, 24); }
  return { boxes: Array.from(boxes.values()), width: Math.max(360, ...Array.from(boxes.values(), box => box.x + box.width + 60)), height: state.root ? boxes.get(state.root.id).span + 48 : 240 };
}
/** Default map fit: whole map visible without scrollbars; only very large maps fall back to scrolling. */
export const MAP_MIN_FIT = 0.3;
export function fitMapScale(layout, width, height, min = MAP_MIN_FIT) {
  if (!layout || !(width > 0) || !(height > 0)) return 1;
  return Math.max(min, Math.min(1, width / layout.width, height / layout.height));
}
export function mountOutlineDemo(root, presets) {
  const query = selector => { const element = root.querySelector(selector); if (!element) throw new Error('Missing outline demo element: ' + selector); return element; };
  const outline = query('#demo-outline'); const graph = query('#result-graph'); const status = query('#demo-status');
  const fields = new Map(); const glyphs = new Map(); const context = document.createElement('canvas').getContext('2d');
  const fontFamily = getComputedStyle(root).fontFamily; if (context) context.font = '600 14px ' + fontFamily;
  let state; let selected = null; let currentPreset = 'questions'; let disposed = false; let lastLayout = null;
  const ns = 'http://www.w3.org/2000/svg';
  const measure = text => { if (!glyphs.has(text)) glyphs.set(text, context ? context.measureText(text).width : (text.codePointAt(0) < 128 ? 8 : 14)); return glyphs.get(text); };
  function svgNode(tag, attributes = {}, text) { const element = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value)); if (text !== undefined) element.textContent = text; return element; }
  function announce(message) { status.textContent = message + ' 변경 내용은 저장하거나 전송하지 않습니다.'; }
  function resizeInput(input) { input.style.height = '0px'; input.style.height = Math.min(240, Math.max(36, input.scrollHeight)) + 'px'; }
  function selection() {
    const rows = flattenDemo(state); const chosen = rows.find(row => row.node.id === selected);
    root.querySelectorAll('[data-outline-row]').forEach(row => row.classList.toggle('is-selected', row.dataset.outlineRow === selected));
    graph.querySelectorAll('[data-map-node]').forEach(group => { const active = group.dataset.mapNode === selected; group.setAttribute('aria-pressed', String(active)); group.classList.toggle('is-selected', active); });
    root.querySelectorAll('[data-demo-action]').forEach(button => {
      const target = button.dataset.nodeId ? rows.find(row => row.node.id === button.dataset.nodeId) : chosen; const action = button.dataset.demoAction;
      button.disabled = action === 'first' ? Boolean(state.root) : !target || (action === 'sibling' && !target.parent) || ((action === 'child' || action === 'sibling') && rows.length >= DEMO_LIMITS.nodes) || (action === 'child' && target.depth + 1 >= DEMO_LIMITS.levels);
    });
    graph.querySelectorAll('[data-map-add]').forEach(control => { const active = control.dataset.nodeId === selected; control.style.display = active ? '' : 'none'; control.setAttribute('tabindex', active ? '0' : '-1'); });
    query('#demo-node-count').textContent = rows.length + '개 노드';
  }
  function focusInput(id, selectAll = false) { const input = fields.get(id); if (!input) { outline.querySelector('button')?.focus(); return; } input.focus({ preventScroll: true }); input.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (selectAll) input.select(); }
  function select(id) { selected = id; selection(); }
  function actionButton(action, text, title, id) { const button = document.createElement('button'); button.type = 'button'; button.className = 'demo-node-action'; button.dataset.demoAction = action; button.dataset.nodeId = id; button.textContent = text; button.title = title; button.setAttribute('aria-label', title); return button; }
  function renderOutline() {
    fields.clear(); outline.replaceChildren();
    if (!state.root) { const empty = document.createElement('li'); empty.className = 'demo-outline-empty'; const text = document.createElement('p'); text.textContent = '첫 노드를 추가하거나 초기화로 기본 예시를 불러오세요.'; const button = actionButton('first', '첫 노드 추가', '첫 중심 노드 추가', ''); empty.append(text, button); outline.append(empty); return; }
    function item(node, depth) {
      const li = document.createElement('li'); const row = document.createElement('div'); row.className = 'demo-outline-row'; row.dataset.outlineRow = node.id; row.style.setProperty('--demo-depth', depth);
      const mark = document.createElement('span'); mark.className = 'demo-outline-mark'; mark.textContent = depth === 0 ? '●' : '•'; mark.setAttribute('aria-hidden', 'true');
      const input = document.createElement('textarea'); input.className = 'demo-node-input'; input.dataset.demoInput = node.id; input.rows = 1; input.spellcheck = false; input.value = node.text; input.placeholder = '내용을 입력하세요'; input.setAttribute('aria-label', depth === 0 ? '중심 노드 내용' : '노드 내용');
      const actions = document.createElement('div'); actions.className = 'demo-row-actions'; actions.append(actionButton('child', '하위 +', '이 노드에 하위 노드 추가', node.id), actionButton('sibling', '같은 +', '이 노드 다음에 같은 단계 노드 추가', node.id), actionButton('delete', '삭제', '이 노드와 하위 노드 삭제', node.id));
      row.append(mark, input, actions); li.append(row); fields.set(node.id, input);
      if (node.children.length) { const children = document.createElement('ol'); node.children.forEach(child => children.append(item(child, depth + 1))); li.append(children); }
      return li;
    }
    outline.append(item(state.root, 0)); fields.forEach(resizeInput);
  }
  function renderMap() {
    graph.replaceChildren(); const layout = layoutDemo(state, measure);
    if (!state.root) { const empty = document.createElement('p'); empty.className = 'demo-empty'; empty.textContent = '아웃라인에서 첫 노드를 추가해 보세요.'; graph.append(empty); selection(); return; }
    const svg = svgNode('svg', { viewBox: '0 0 ' + layout.width + ' ' + layout.height, width: layout.width, height: layout.height, role: 'group', 'aria-label': '아웃라인과 실시간으로 연결된 생각 맵' });
    lastLayout = layout;
    const byId = new Map(layout.boxes.map(box => [box.node.id, box]));
    const palette = [['#f0f5e5', '#bdcd9c', '#4c6338'], ['#fcf0e3', '#dfc7a3', '#845f32'], ['#eaf2ed', '#b4cbb9', '#41634d']];
    for (const box of layout.boxes) if (box.parent) { const parent = byId.get(box.parent.id); const x = parent.x + parent.width; const y = parent.y + parent.height / 2; const yy = box.y + box.height / 2; svg.append(svgNode('path', { d: 'M ' + x + ' ' + y + ' C ' + (x + 26) + ' ' + y + ', ' + (box.x - 26) + ' ' + yy + ', ' + box.x + ' ' + yy, fill: 'none', stroke: palette[box.branch % 3][1], 'stroke-width': 2 })); }
    for (const box of layout.boxes) {
      const color = palette[box.branch % 3]; const group = svgNode('g', { 'data-map-node': box.node.id, role: 'button', tabindex: 0, 'aria-label': box.node.text || '내용 없는 노드', 'aria-pressed': String(box.node.id === selected) });
      group.append(svgNode('title', {}, box.node.text || '내용 없는 노드'), svgNode('rect', { x: box.x, y: box.y, width: box.width, height: box.height, rx: 9, fill: box.depth === 0 ? '#2d5842' : box.depth === 1 ? color[0] : '#fff', stroke: box.depth === 0 ? '#2d5842' : color[1], 'stroke-width': 1.5 }));
      const text = svgNode('text', { x: box.x + 14, y: box.y + 27, fill: box.depth === 0 ? '#fff' : color[2], 'font-size': 14, 'font-weight': box.depth === 0 ? 600 : 500, 'xml:space': 'preserve' }); text.style.letterSpacing = '0';
      box.lines.forEach((line, index) => text.append(svgNode('tspan', { x: box.x + 14, dy: index === 0 ? 0 : 22 }, line)));
      group.append(text); svg.append(group);
      for (const kind of box.parent ? ['child', 'sibling'] : ['child']) {
        const cx = kind === 'child' ? box.x + box.width + 24 : box.x + box.width / 2;
        const cy = kind === 'child' ? box.y + box.height / 2 : box.y + box.height + 24;
        const add = svgNode('g', { 'data-map-add': '', 'data-demo-action': kind, 'data-node-id': box.node.id, role: 'button', tabindex: 0, 'aria-label': (kind === 'child' ? '하위 노드 추가: ' : '같은 단계 노드 추가: ') + box.node.text });
        add.append(svgNode('circle', { cx, cy, r: 18, fill: '#fff', stroke: '#2d5842', 'stroke-width': 2 }), svgNode('text', { x: cx, y: cy + 6, 'text-anchor': 'middle', 'font-size': 24, fill: '#2d5842', 'aria-hidden': 'true' }, '+')); svg.append(add);
      }
    }
    graph.append(svg); fitMap(); selection();
  }
  function fitMap() {
    const svg = graph.querySelector('svg'); if (!svg || !lastLayout) return;
    const style = getComputedStyle(graph);
    const width = graph.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) - 2;
    const height = graph.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) - 2;
    const scale = fitMapScale(lastLayout, width, height);
    svg.style.width = Math.floor(lastLayout.width * scale) + 'px'; svg.style.height = Math.floor(lastLayout.height * scale) + 'px';
  }
  function renderAll() { renderOutline(); renderMap(); }
  function choosePreset(key) { if (disposed || !Object.hasOwn(presets, key)) return; currentPreset = key; state = createDemo(presets[key]); selected = state.root?.id || null; root.querySelectorAll('[data-preset]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === key))); graph.scrollTop = 0; graph.scrollLeft = 0; renderAll(); announce('예시를 불러왔습니다. 아웃라인을 고치면 맵에 바로 반영됩니다.'); }
  function reset(toDefault = false) { choosePreset(toDefault ? 'questions' : currentPreset); announce('초기화했습니다. 기본 예시로 다시 시작하세요.'); }
  function runAction(action, id) {
    if (action === 'edit') { focusInput(id); return; }
    const result = action === 'delete' ? deleteDemoNode(state, id) : addDemoNode(state, action === 'first' ? null : id, action === 'sibling' ? 'sibling' : 'child');
    if (!result.ok) { announce(result.message); return; }
    selected = result.id; renderAll(); focusInput(selected, action !== 'delete'); announce(action === 'delete' ? '선택한 노드와 하위 노드를 삭제했습니다.' : '노드를 추가했습니다. 내용을 입력해 보세요.');
  }
  function onClick(event) {
    if (!(event.target instanceof Element)) return;
    const preset = event.target.closest('[data-preset]'); if (preset) { choosePreset(preset.dataset.preset); return; }
    if (event.target.closest('#demo-reset')) { reset(); return; }
    const button = event.target.closest('[data-demo-action]'); if (button && !button.disabled) { runAction(button.dataset.demoAction, button.dataset.nodeId || selected); return; }
    const mapNode = event.target.closest('[data-map-node]'); if (mapNode) select(mapNode.dataset.mapNode);
  }
  function onInput(event) {
    const input = event.target; if (!(input instanceof HTMLTextAreaElement) || !input.dataset.demoInput) return;
    const result = updateDemoNode(state, input.dataset.demoInput, input.value);
    if (!result.ok) { const found = flattenDemo(state).find(row => row.node.id === input.dataset.demoInput); input.value = found?.node.text || ''; announce(result.message); return; }
    selected = input.dataset.demoInput; resizeInput(input); renderMap(); announce('수정 내용이 맵에 바로 반영되었습니다.');
  }
  function onFocus(event) { if (event.target instanceof HTMLTextAreaElement && event.target.dataset.demoInput) select(event.target.dataset.demoInput); }
  function onDoubleClick(event) { if (!(event.target instanceof Element)) return; const node = event.target.closest('[data-map-node]'); if (node) { select(node.dataset.mapNode); focusInput(selected); } }
  function onKeyDown(event) {
    if (event.isComposing || event.keyCode === 229 || !(event.target instanceof Element)) return;
    const add = event.target.closest('[data-map-add]'); if (add && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); runAction(add.dataset.demoAction, add.dataset.nodeId); return; }
    const input = event.target.closest('[data-demo-input]');
    if (input && event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey) { event.preventDefault(); const row = flattenDemo(state).find(item => item.node.id === input.dataset.demoInput); runAction(event.ctrlKey || !row?.parent ? 'child' : 'sibling', input.dataset.demoInput); return; }
    const node = event.target.closest('[data-map-node]'); if (node && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(node.dataset.mapNode); focusInput(selected); }
  }
  const onLeave = () => reset(true); const onReturn = event => { if (event.persisted) reset(true); };
  root.addEventListener('click', onClick); root.addEventListener('input', onInput); root.addEventListener('focusin', onFocus); root.addEventListener('dblclick', onDoubleClick); root.addEventListener('keydown', onKeyDown); window.addEventListener('pagehide', onLeave); window.addEventListener('pageshow', onReturn);
  let lastOutlineWidth = 0;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const width = outline.clientWidth; if (width && width !== lastOutlineWidth) { lastOutlineWidth = width; fields.forEach(resizeInput); } }) : null;
  resizeObserver?.observe(outline);
  let lastGraphSize = '';
  const graphObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const size = graph.clientWidth + 'x' + graph.clientHeight; if (size !== lastGraphSize) { lastGraphSize = size; fitMap(); } }) : null;
  graphObserver?.observe(graph);
  choosePreset('questions');
  document.fonts?.ready.then(() => { if (!disposed) { glyphs.clear(); fields.forEach(resizeInput); renderMap(); } });
  return { choosePreset, reset, destroy() { disposed = true; resizeObserver?.disconnect(); graphObserver?.disconnect(); root.removeEventListener('click', onClick); root.removeEventListener('input', onInput); root.removeEventListener('focusin', onFocus); root.removeEventListener('dblclick', onDoubleClick); root.removeEventListener('keydown', onKeyDown); window.removeEventListener('pagehide', onLeave); window.removeEventListener('pageshow', onReturn); fields.clear(); glyphs.clear(); } };
}
