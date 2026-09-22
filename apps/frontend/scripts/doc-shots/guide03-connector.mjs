// 가이드 03 — 연결선 (2026-09-22 사용자 요청: 노드와 노드를 잇는 선 · 각진/둥근 · 두께·색·종류·
// 화살표 · 선 가운데/위/아래/곁가지 라벨). 실제 툴바 [연결] 단추 → 노드 클릭으로 만들고, 스타일 탭의
// 연결선 패널 단추로 바꾸고, Delete·되돌리기·mmd/HTML 왕복까지 확인한다.
//   node scripts/doc-shots/guide03-connector.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });
const doc = (fn) => page.evaluate(async ({ src }) => { const d = await import('/src/stores/documentStore.ts'); return (new Function('d', 'st', 'map', `return (${src})(d, st, map)`))(d, d.useDocumentStore.getState(), d.useDocumentStore.getState().map); }, { src: fn.toString() });
const inter = () => page.evaluate(async () => { const m = await import('/src/stores/interactionStore.ts'); const s = m.useInteractionStore.getState(); return { selectedId: s.selectedId, selectedConnectorId: s.selectedConnectorId, connectMode: s.connectMode }; });
const connectors = () => doc((d, st, map) => map.connectors ?? []);
const fit = async () => { await page.evaluate(async () => { const vp = await import('/src/stores/viewportStore.ts'); vp.useViewportStore.getState().requestFit(); }); await page.waitForTimeout(400); };
const nodeEl = (id) => page.locator(`[data-node-id="${id}"]:not([data-testid="collapse-toggle"])`).first();
const lineInfo = () => page.evaluate(() => {
  const g = document.querySelector('[data-connector-id]');
  if (!g) return null;
  const p = g.querySelector('[data-connector-path]');
  return { d: p.getAttribute('d'), stroke: p.getAttribute('stroke'), width: p.getAttribute('stroke-width'), dash: p.getAttribute('stroke-dasharray'),
    arrows: g.querySelectorAll('[data-connector-arrow]').length, selected: g.getAttribute('data-selected') === '1' };
});
const labelInfo = () => page.evaluate(() => {
  const g = document.querySelector('[data-connector-label]');
  if (!g) return null;
  const rect = g.querySelector('rect'), ell = g.querySelector('ellipse');
  return { tspans: g.querySelectorAll('tspan').length, stub: !!g.querySelector('line'), rx: rect ? Number(rect.getAttribute('rx')) : null,
    h: rect ? Number(rect.getAttribute('height')) : null, fill: rect?.getAttribute('fill') ?? null, ellipse: !!ell, text: g.querySelector('text')?.textContent };
});
const setRange = (testId, value) => page.evaluate(({ testId, value }) => {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, { testId, value });

// 3레벨 노드를 시작점으로 — 사용자 그림처럼 두 Sub Topic 을 잇는다
await ui({ activeSection: 'inspector', inspectorTab: 'layout', sidebarCollapsed: false });
await fit();
await stores.select(page, 'b1-1'); await page.waitForTimeout(200);

// ① [연결] 단추 → 안내 배지 → 끝 노드 클릭 → 연결선 생성 + 선택 + 스타일 탭 패널
const connectBtn = page.locator('[data-testid="connect-node"]');
ok('① 노드를 고르면 [연결] 단추가 켜진다', await connectBtn.isEnabled());
await connectBtn.click(); await page.waitForTimeout(200);
ok('① 연결 모드 안내 배지', await page.locator('[data-testid="connect-hint"]').isVisible());
ok('① 시작 노드를 다시 눌러도 모드 유지', await (async () => { await nodeEl('b1-1').click(); await page.waitForTimeout(150); return !!(await inter()).connectMode; })());
await nodeEl('b2-1').click(); await page.waitForTimeout(400);
let cs = await connectors(); let st = await inter();
ok(`① 연결선 1개 생성 (b1-1 → b2-1)`, cs.length === 1 && cs[0].from === 'b1-1' && cs[0].to === 'b2-1');
ok('① 생성 뒤 연결선이 선택되고 노드 선택은 풀린다', st.selectedConnectorId === cs[0]?.id && st.selectedId === null && !st.connectMode);
ok('① 안내 배지 사라짐', !(await page.locator('[data-testid="connect-hint"]').isVisible()));
ok('① 스타일 탭에 연결선 패널', await page.locator('[data-testid="connector-panel"]').isVisible());
let li = await lineInfo();
ok(`① 기본: 파란색 #2563EB · 둥근(Q 곡선) · 끝 화살표 1개 · 두께 1.6`, li && li.stroke === '#2563EB' && /Q/.test(li.d) && li.arrows === 1 && li.width === '1.6' && li.selected);
const dRounded = li.d;

// ② 패널로 바꾸기 — 각진 선 · 두께 · 파선 · 양쪽 화살표 · 색
await page.locator('[data-testid="connector-shape-elbow"]').click(); await page.waitForTimeout(150);
li = await lineInfo();
ok('② 각진 선 — 곡선(Q) 없음, 점은 같은 자리', li && !/Q/.test(li.d) && li.d.startsWith(dRounded.split(' ').slice(0, 3).join(' ')));
await setRange('connector-width', 3); await page.waitForTimeout(150);
await page.locator('[data-testid="connector-dash-dashed"]').click(); await page.waitForTimeout(150);
await page.locator('[data-testid="connector-arrows-both"]').click(); await page.waitForTimeout(150);
li = await lineInfo();
ok(`② 두께 3 · 파선(dasharray ${li?.dash}) · 화살표 2개`, li && li.width === '3' && li.dash === '12 9' && li.arrows === 2);
await page.locator('[data-testid="connector-arrows-none"]').click(); await page.waitForTimeout(150);
ok('② 화살표 없음 = 그냥 선', (await lineInfo())?.arrows === 0);
await page.locator('[data-testid="connector-dash-dotted"]').click(); await page.waitForTimeout(150);
ok('② 점선', (await lineInfo())?.dash === '0.3 7.2');
await doc((d, st, map) => st.updateConnector(map.connectors[0].id, { color: '#DC2626' })); await page.waitForTimeout(150);
ok('② 선 색 바꾸면 선·기본(파랑) 단추', (await lineInfo())?.stroke === '#DC2626' && await page.locator('[data-testid="connector-color-reset"]').isVisible());
await page.locator('[data-testid="connector-color-reset"]').click(); await page.waitForTimeout(150);
ok('② 기본(파랑) 으로 되돌림', (await lineInfo())?.stroke === '#2563EB');

// ③ 라벨 — 글(두 줄) · 자리 · 도형
await page.locator('[data-testid="connector-label-text"]').fill('검토\n승인'); await page.waitForTimeout(250);
let lb = await labelInfo();
ok('③ 라벨 두 줄 · 둥근 상자(rx 8)', lb && lb.tspans === 2 && lb.rx === 8 && !lb.stub);
await page.locator('[data-testid="connector-place-branch"]').click(); await page.waitForTimeout(150);
lb = await labelInfo();
ok('③ 곁가지 — 짧은 줄기가 생긴다', lb && lb.stub);
await page.locator('[data-testid="connector-label-shape-pill"]').click(); await page.waitForTimeout(150);
lb = await labelInfo();
ok('③ 캡슐 — rx = 높이/2', lb && lb.rx === lb.h / 2);
await page.locator('[data-testid="connector-label-shape-none"]').click(); await page.waitForTimeout(150);
lb = await labelInfo();
ok('③ 도형 없음 — 채운 상자 없이 글만 (선택 점선 테두리만)', lb && lb.fill === 'none' && lb.tspans === 2);
await page.locator('[data-testid="connector-label-shape-ellipse"]').click(); await page.waitForTimeout(150);
ok('③ 원', (await labelInfo())?.ellipse === true);
await page.locator('[data-testid="connector-place-above"]').click(); await page.waitForTimeout(150);
ok('③ 위 — 줄기 없음', (await labelInfo())?.stub === false);

// 문서용 화면: 둥근 선 · 파랑 · 끝 화살표 · 가운데 라벨(둥근 상자)
await page.locator('[data-testid="connector-shape-rounded"]').click();
await page.locator('[data-testid="connector-dash-solid"]').click();
await page.locator('[data-testid="connector-arrows-end"]').click();
await setRange('connector-width', 2);
await page.locator('[data-testid="connector-place-center"]').click();
await page.locator('[data-testid="connector-label-shape-rounded"]').click();
await page.waitForTimeout(300);
await stores.center(page, 'b1-1', 100); await page.waitForTimeout(500);
const labelBox = await page.locator('[data-connector-label]').boundingBox();
await shotUnion(page, size, `${OUT}/03-connector-canvas.png`, [await nodeBox(page, 'b1-1'), await nodeBox(page, 'b2-1'), labelBox], 50);
await page.locator('[data-testid="connector-panel"]').screenshot({ path: `${OUT}/03-connector-panel.png` });
console.log('shot', `${OUT}/03-connector-panel.png`);
// 각진 선도 한 장
await page.locator('[data-testid="connector-shape-elbow"]').click(); await page.waitForTimeout(300);
await shotUnion(page, size, `${OUT}/03-connector-elbow.png`, [await nodeBox(page, 'b1-1'), await nodeBox(page, 'b2-1'), await page.locator('[data-connector-label]').boundingBox()], 50);
await page.locator('[data-testid="connector-shape-rounded"]').click(); await page.waitForTimeout(200);

// ④ 접힘 — 끝 노드가 안 보이면 선도 감춘다 · 펼치면 돌아온다
await doc((d, st) => st.setCollapsed('b2', true)); await page.waitForTimeout(300);
ok('④ b2 접으면 선이 사라진다', (await page.locator('[data-connector-id]').count()) === 0 && (await connectors()).length === 1);
await doc((d, st) => st.setCollapsed('b2', false)); await page.waitForTimeout(300);
ok('④ 펼치면 다시 그려진다', (await page.locator('[data-connector-id]').count()) === 1);

// ⑤ 선택·Esc·Delete·되돌리기
await fit();
await nodeEl('b3').click(); await page.waitForTimeout(200);
st = await inter();
ok('⑤ 노드를 누르면 연결선 선택이 풀린다', st.selectedId === 'b3' && st.selectedConnectorId === null);
await page.locator('[data-connector-hit]').first().dispatchEvent('click'); await page.waitForTimeout(200);
st = await inter();
ok('⑤ 선을 누르면 다시 선택 (노드 선택 해제)', st.selectedConnectorId !== null && st.selectedId === null);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('⑤ Esc = 연결선 선택 해제', (await inter()).selectedConnectorId === null);
await page.locator('[data-connector-hit]').first().dispatchEvent('click'); await page.waitForTimeout(200);
await page.keyboard.press('Delete'); await page.waitForTimeout(200);
ok('⑤ Delete 로 삭제', (await connectors()).length === 0 && (await inter()).selectedConnectorId === null);
await doc((d, st) => st.undo()); await page.waitForTimeout(300);
cs = await connectors();
ok('⑤ 되돌리기 → 연결선(라벨 포함) 복구', cs.length === 1 && cs[0].label?.text === '검토\n승인');
await stores.select(page, 'b1-1'); await connectBtn.click(); await page.waitForTimeout(150);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('⑤ 연결 모드에서 Esc = 취소', !(await inter()).connectMode && !(await page.locator('[data-testid="connect-hint"]').isVisible()));
await stores.select(page, 'b1-1'); await connectBtn.click(); await page.waitForTimeout(150);
await nodeEl('b2-1').click(); await page.waitForTimeout(200);
ok('⑤ 같은 from→to 를 또 이으면 새로 만들지 않는다', (await connectors()).length === 1);

// ⑥ 끝 노드를 지우면 연결선도 사라진다 (되돌리면 함께 돌아온다)
await doc((d, st) => st.deleteNode('b2-1')); await page.waitForTimeout(200);
ok('⑥ 끝 노드 삭제 → 연결선 정리', (await connectors()).length === 0);
await doc((d, st) => st.undo()); await page.waitForTimeout(200);
ok('⑥ 되돌리기 → 노드와 연결선 복구', (await connectors()).length === 1);

// ⑦ mmd 내보내기 → 선언에 connectors → 다시 읽으면 같은 연결선
const md = await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts'); const ui = await import('/src/stores/editorUiStore.ts');
  const ex = await import('/src/export/exportMarkdown.ts');
  const pkg = await ex.buildMarkdownExportPackage(d.useDocumentStore.getState().map, ui.useEditorUiStore.getState().layoutType);
  return await pkg.blob.text();
});
ok('⑦ mmd 에 connectors 선언 (경로로)', /connectors:\n  1:\n    from: .* > Q1 · 기반 구축 > 인증 시스템 \(Supabase Auth\)\n    to: .* > 프롬프트 → 맵 생성/.test(md) && /label: 검토 \/ 승인/.test(md));
const back = await page.evaluate(async ({ md }) => {
  const im = await import('/src/utils/importMapFile.ts');
  const r = im.parseMarkdownMapFile(md, 'x');
  return r?.map.connectors ?? null;
}, { md });
ok('⑦ 다시 읽으면 연결선 1개 · 라벨 두 줄 · 속성 그대로', back && back.length === 1 && back[0].label?.text === '검토\n승인' && back[0].width === 2 && back[0].label?.shape === 'rounded' && back[0].from !== back[0].to);

// ⑧ HTML 내보내기 — 뷰어가 같은 선·라벨을 그린다
const html = await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts'); const ui = await import('/src/stores/editorUiStore.ts');
  const ex = await import('/src/export/exportHtml.ts');
  return ex.buildStandaloneHtml(d.useDocumentStore.getState().map, ui.useEditorUiStore.getState().layoutType);
});
const page2 = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page2.setContent(html, { waitUntil: 'load' }); await page2.waitForTimeout(800);
const v = await page2.evaluate(() => {
  const g = document.querySelector('.mm-conn'); const l = document.querySelector('.mm-conn-label');
  return { conn: document.querySelectorAll('.mm-conn').length, label: document.querySelectorAll('.mm-conn-label').length,
    stroke: g?.querySelector('path')?.getAttribute('stroke'), q: /Q/.test(g?.querySelector('path')?.getAttribute('d') ?? ''),
    tspans: l?.querySelectorAll('tspan').length, firstIsLines: document.getElementById('mm-world')?.firstChild?.getAttribute('class') };
});
ok(`⑧ HTML 뷰어: 연결선 1 · 라벨 1(두 줄) · 파랑 · 둥근 · 선 층이 맨 뒤`, v.conn === 1 && v.label === 1 && v.stroke === '#2563EB' && v.q && v.tspans === 2 && v.firstIsLines === 'mm-conn-lines');
const shotBox = await page2.evaluate(() => { const a = document.querySelector('.mm-conn').getBoundingClientRect(); const b = document.querySelector('.mm-conn-label').getBoundingClientRect(); return { x: Math.min(a.x, b.x) - 120, y: Math.min(a.y, b.y) - 60, w: Math.max(a.right, b.right) - Math.min(a.x, b.x) + 240, h: Math.max(a.bottom, b.bottom) - Math.min(a.y, b.y) + 120 }; });
await page2.screenshot({ path: `${OUT}/03-connector-viewer.png`, clip: { x: Math.max(0, shotBox.x), y: Math.max(0, shotBox.y), width: Math.min(1400 - Math.max(0, shotBox.x), shotBox.w), height: Math.min(900 - Math.max(0, shotBox.y), shotBox.h) } });
console.log('shot', `${OUT}/03-connector-viewer.png`);
await page2.close();

await browser.close();
console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과');
