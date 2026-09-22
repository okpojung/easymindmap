// 가이드 04 — 3레벨 안쪽 노드에 레이아웃을 걸어도 맵이 흐트러지지 않는다 (2026-09-22 사용자 보고:
// "[36주] 노드를 선택하고 진행트리·오른쪽으로 바꾸니 맵이 엉망"). 실제 레이아웃 탭 버튼으로 바꾸고
// **화면의 모든 노드 상자**가 서로 겹치지 않는지 잰다.
//   node scripts/doc-shots/guide04-layout-nested.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });
const layoutBtn = (label) => page.locator('button', { hasText: label }).first();
// 화면에 그려진 노드 상자끼리 겹치는 쌍 (SVG 노드 그룹의 boundingClientRect, 2px 여유)
// 엔진(computeLayout) 기준 겹침 — 화면과 엔진이 다르면 그리기 문제다
const overlapsInEngine = () => page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts'); const ui = await import('/src/stores/editorUiStore.ts');
  const { computeLayout } = await import('/src/layout/LayoutEngine.ts'); const { findOverlaps } = await import('/src/layout/invariantGen.ts');
  const st = d.useDocumentStore.getState(); const u = ui.useEditorUiStore.getState();
  const out = computeLayout(st.map, u.layoutType, 800, 500, { x: u.spacingX ?? 1, y: u.spacingY ?? 1 });
  return { n: out.length, bad: findOverlaps(out).map(([a, b]) => `${a.id}×${b.id}`) };
});
const overlapsOnScreen = () => page.evaluate(() => {
  // 노드 그룹만 — 접기 칩(collapse-toggle)도 같은 data-node-id 를 달고 있어 뺀다
  const all = Array.from(document.querySelectorAll('[data-node-id]:not([data-testid="collapse-toggle"])'));
  const seen = new Map(); const dups = [];
  for (const el of all) { const id = el.getAttribute('data-node-id'); if (seen.has(id)) dups.push(id); else seen.set(id, el); }
  const els = Array.from(seen.values());
  const boxes = els.map((el) => { const r = el.querySelector('rect')?.getBoundingClientRect() ?? el.getBoundingClientRect(); return { id: el.getAttribute('data-node-id'), l: r.left, t: r.top, r: r.right, b: r.bottom }; }).filter((b) => b.r - b.l > 4 && b.b - b.t > 4);
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.l < b.r - 2 && b.l < a.r - 2 && a.t < b.b - 2 && b.t < a.b - 2) bad.push(`${a.id}×${b.id}`);
  }
  return { n: boxes.length, bad, dups };
});

// 보고와 같은 맵을 만든다: 진행트리 맵 · A(1레벨, 표) 계층형 → B(2레벨, 표 두 개) 트리·오른쪽 → 주 노드 5개 → 날짜 7개
const ids = await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts'); const c = await import('/src/utils/calendarNodes.ts');
  const st = d.useDocumentStore.getState();
  st.updateNodeLayoutType('root', 'process-tree-right');
  st.updateNodeText('b1', '2026.09\n\n' + c.calendarTable(2026, 9));
  st.addChildOutlineBulk('b1', [{ text: '2026.09\n\n' + c.calendarTable(2026, 9) + '\n\n' + c.calendarTable(2026, 10), children: [] }]);
  let m = d.useDocumentStore.getState().map; const A = d.findNodeInMap(m, 'b1'); const B = A.children[A.children.length - 1];
  st.addChildOutlineBulk(B.id, c.weekOutline(2026, 9));
  m = d.useDocumentStore.getState().map; const B2 = d.findNodeInMap(m, B.id); const W36 = B2.children[0];
  st.updateNodeLayoutType('b1', 'hierarchy-right');
  st.updateNodeLayoutType(B.id, 'tree-right');
  return { A: 'b1', B: B.id, W36: W36.id, weeks: B2.children.map((w) => w.id) };
});
await ui({ activeSection: 'inspector', inspectorTab: 'layout', sidebarCollapsed: false });
await page.waitForTimeout(500);
const before = await overlapsOnScreen();
ok(`⓪ 바꾸기 전: 화면 노드 ${before.n}개, 겹침 없음`, before.n > 60 && before.bad.length === 0);

// ① [36주] 선택 → 레이아웃 탭 "진행트리 · 오른쪽" 클릭 (보고의 조작 그대로)
await stores.select(page, ids.W36); await page.waitForTimeout(300);
await layoutBtn('진행트리 · 오른쪽').click(); await page.waitForTimeout(1500);
const eng = await overlapsInEngine();
ok(`① 엔진 기준 겹침 없음 (노드 ${eng.n})${eng.bad.length ? ' — ' + eng.bad.slice(0, 5).join(' ') : ''}`, eng.bad.length === 0);
const lt = await page.evaluate(async ({ id }) => { const d = await import('/src/stores/documentStore.ts'); return d.findNodeInMap(d.useDocumentStore.getState().map, id)?.layoutType; }, { id: ids.W36 });
ok('① [36주] 에 process-tree-right 가 걸렸다', lt === 'process-tree-right');
const after = await overlapsOnScreen();
ok(`① 바꾼 뒤: 화면 노드 ${after.n}개 (전과 같음), 겹침 없음${after.bad.length ? ' — ' + after.bad.slice(0, 5).join(' ') : ''}${after.dups.length ? ' · 중복 그리기 ' + after.dups.join(' | ') : ''}`, after.n === before.n && after.bad.length === 0 && after.dups.length === 0);
// 날짜 7개가 [36주] 아래 한 줄(윗변 같음)이고 모두 [36주] 오른쪽 아래에 있다
const dayBoxes = await page.evaluate(async ({ id }) => { const d = await import('/src/stores/documentStore.ts'); const n = d.findNodeInMap(d.useDocumentStore.getState().map, id); return n.children.map((k) => { const r = document.querySelector(`[data-node-id="${k.id}"] rect`)?.getBoundingClientRect(); return r ? { l: r.left, t: r.top } : null; }); }, { id: ids.W36 });
const w36 = await nodeBox(page, ids.W36);
ok('① 날짜 7개가 [36주] 아래 한 줄에 왼쪽→오른쪽', dayBoxes.length === 7 && dayBoxes.every((b) => b && Math.abs(b.t - dayBoxes[0].t) < 2 && b.t > w36.y + w36.height) && dayBoxes.every((b, i) => i === 0 || b.l > dayBoxes[i - 1].l));
// 나머지 주(37~40)는 그대로 트리·오른쪽(아웃라인) — [36주] 블록 아래로 밀렸을 뿐
const weekTops = await Promise.all(ids.weeks.map((id) => nodeBox(page, id)));
ok('① 37~40주는 36주 블록 아래에 차례로', weekTops.every((b, i) => i === 0 || b.y > weekTops[i - 1].y));
await stores.center(page, ids.B, 60); await page.waitForTimeout(400);
await shotUnion(page, size, `${OUT}/04-layout-nested.png`, [await nodeBox(page, ids.A), await nodeBox(page, ids.B), w36, ...weekTops], 30);

// ② 같은 자리에 다른 레이아웃들도 — 어느 것을 걸어도 겹치지 않는다
for (const label of ['트리 · 아래', '계층형 · 오른쪽', '방사형 · 오른쪽', '시간배치 (타임라인)', '시간배치 (중앙노드)', '트리 · 오른쪽']) {
  await stores.select(page, ids.W36); await page.waitForTimeout(150);
  if (await layoutBtn(label).isDisabled()) { console.log(`skip  ② ${label} — 서브트리에는 걸 수 없는 레이아웃(버튼 비활성)`); continue; }
  await layoutBtn(label).click(); await page.waitForTimeout(1500);
  const e2 = await overlapsInEngine();
  const r = await overlapsOnScreen();
  ok(`② [36주] = ${label}: 엔진 겹침 없음${e2.bad.length ? ' — ' + e2.bad.slice(0, 4).join(' ') : ''}`, e2.bad.length === 0);
  ok(`② [36주] = ${label}: 노드 ${r.n}개, 겹침 없음${r.bad.length ? ' — ' + r.bad.slice(0, 4).join(' ') : ''}`, r.n === before.n && r.bad.length === 0);
}
// ③ B(2레벨) 도 바꿔 본다 — 진행트리 아래 진행트리 (오버라이드 해제와 같은 결과여야 한다)
await stores.select(page, ids.B); await page.waitForTimeout(150);
await layoutBtn('진행트리 · 오른쪽').click(); await page.waitForTimeout(500);
const r3 = await overlapsOnScreen();
ok(`③ B = 진행트리: 겹침 없음`, r3.bad.length === 0);
await browser.close();
