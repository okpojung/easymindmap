// 가이드 04 — 큰 맵: 뷰포트 컬링 + "여는 중" 안내 + 상호작용 반응 (2026-09-30 사용자 보고:
// "2,847노드 맵을 불러온 뒤 한참 편집이 안 된다", "불러오는 동안 안내가 없다").
// 화면 근처 노드만 DOM 에 두고(CULL_MIN_NODES=400 이상), 이동·맞추기·센터 요청에 따라
// 그리는 집합이 바뀌며, 큰 MD 를 불러오는 동안 opening-overlay 가 떴다 사라진다. 스크린샷 없음.
//   node scripts/doc-shots/guide04-large-map.mjs
import { boot } from './lib.mjs';
const { browser, page } = await boot({ width: 1600, height: 1000, scale: 1, beforeGoto: async (p) => {
  await p.route('http://api.local/v1/folders', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"folders":[],"total":0}' }));
  await p.route('http://api.local/v1/maps?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"maps":[],"total":0}' }));
  await p.route('http://api.local/v1/maps/shared**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"maps":[],"total":0}' }));
} });
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const domCount = () => page.evaluate(() => document.querySelectorAll('[data-node-id]:not([data-testid="collapse-toggle"])').length);
const nodeCount = () => page.evaluate(async () => (await import('/src/stores/documentStore.ts')).useDocumentStore.getState().map.branches.reduce(function c(acc, n) { return (n.children ?? []).reduce(c, acc + 1); }, 1));
const settle = (ms = 700) => page.waitForTimeout(ms);

// ① 2,401노드 진행트리 맵을 연다 — 화면 근처만 DOM 에
await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts'); const ui = await import('/src/stores/editorUiStore.ts');
  let seq = 0; const id = () => `big${++seq}`;
  const branches = Array.from({ length: 40 }, (_, i) => ({ id: id(), text: `folder-${i}`, children: Array.from({ length: 10 }, (_, j) => ({ id: id(), text: `doc-${i}-${j}`, children: Array.from({ length: 5 }, (_, k) => ({ id: id(), text: `heading ${i}-${j}-${k}` })) })) }));
  d.useDocumentStore.getState().loadMap({ title: 'big', root: { id: 'root', text: '큰 맵' }, branches }, { resetHistory: true });
  ui.useEditorUiStore.getState().setLayoutType('process-tree-right');
});
await settle(1200);
let total = await nodeCount(); let dom = await domCount();
ok(`① 큰 맵(${total}노드)을 열면 화면 근처만 그린다 — DOM ${dom}개 (0 < DOM < 전체)`, dom > 0 && dom < total);
ok('① 중심 주제는 그려져 있다', await page.$('[data-node-id="root"]') !== null);

// ② 멀리 있는 노드로 센터 요청 → 그 노드가 그려지고, 중심 주제는 DOM 에서 빠진다
await page.evaluate(async () => { (await import('/src/stores/viewportStore.ts')).useViewportStore.getState().requestCenterNode('big2000', 100); });
await settle();
ok('② 먼 노드로 센터 → 그 노드가 DOM 에 있다', await page.$('[data-node-id="big2000"]') !== null);
ok('② 그 자리에서 중심 주제(멀리)는 DOM 에서 빠진다', await page.$('[data-node-id="root"]:not([data-testid="collapse-toggle"])') === null);
const domFar = await domCount();
ok(`② 그리는 노드 수는 여전히 일부 (${domFar})`, domFar > 0 && domFar < total);

// ③ 선택된 노드는 화면 밖이어도 그린다 (툴바·편집창이 붙는다)
await page.evaluate(async () => { (await import('/src/stores/interactionStore.ts')).useInteractionStore.getState().setSelectedId('root'); });
await settle();
ok('③ 화면 밖 노드를 선택하면 그 노드는 그려진다', await page.$('[data-node-id="root"]:not([data-testid="collapse-toggle"])') !== null);

// ④ 맵 전체 맞추기(최저 2%) → 화면(+여백 절반)에 든 노드는 빠짐없이 그린다
//    (이 맵은 32만 px 너비라 2% 로도 다 안 들어온다 — 그래서 "든 것은 전부" 를 본다)
await page.evaluate(async () => { (await import('/src/stores/viewportStore.ts')).useViewportStore.getState().requestFit(); });
await settle(2500);
dom = await domCount();
const expect = await page.evaluate(async () => {
  const vp = (await import('/src/stores/viewportStore.ts')).useViewportStore.getState();
  const { computeLayout } = await import('/src/layout/LayoutEngine.ts');
  const d = (await import('/src/stores/documentStore.ts')).useDocumentStore.getState();
  const svg = Array.from(document.querySelectorAll('svg')).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  const sr = svg.getBoundingClientRect(); const W = Math.round(sr.width), H = Math.round(sr.height);
  const out = computeLayout(d.map, 'process-tree-right', W / 2, H / 2, { x: 1, y: 1 });
  const s = vp.zoom / 100; const vw = W / s, vh = H / s; const vx = (0 - W / 2 - vp.panX) / s + W / 2; const vy = (0 - H / 2 - vp.panY) / s + H / 2;
  const x0 = vx - vw / 2, x1 = vx + vw * 1.5, y0 = vy - vh / 2, y1 = vy + vh * 1.5;
  const inView = out.filter((n) => !(n.x + n.w / 2 < x0 || n.x - n.w / 2 > x1 || n.y + n.h / 2 < y0 || n.y - n.h / 2 > y1)).map((n) => n.id);
  const drawnIds = new Set(Array.from(document.querySelectorAll('[data-node-id]:not([data-testid="collapse-toggle"])')).map((e) => e.getAttribute('data-node-id')));
  return { zoom: vp.zoom, inView: inView.length, missing: inView.filter((id) => !drawnIds.has(id)).length };
});
ok(`④ 전체 맞추기(${expect.zoom}%) — 화면(+여백)에 든 ${expect.inView}개가 빠짐없이 그려진다 (DOM ${dom}, 빠진 것 ${expect.missing})`, expect.missing === 0 && dom >= expect.inView && dom > 500);

// ⑤ 원위치(100%) → 다시 일부만, 중심 주제 위쪽 72px (선택 해제 — 선택 테두리 rect 가 먼저 잡힌다)
await page.evaluate(async () => { (await import('/src/stores/interactionStore.ts')).useInteractionStore.getState().setSelectedId(null); (await import('/src/stores/viewportStore.ts')).useViewportStore.getState().reset(); });
await settle();
dom = await domCount();
const rootTop = await page.evaluate(() => { const svg = Array.from(document.querySelectorAll('svg')).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0]; const r = document.querySelector('[data-node-id="root"]:not([data-testid="collapse-toggle"]) rect').getBoundingClientRect(); return Math.round(r.top - svg.getBoundingClientRect().top); });
ok(`⑤ 원위치 뒤 다시 일부만 (${dom}) · 중심 주제 위 ${rootTop}px`, dom < total && Math.abs(rootTop - 72) <= 3);

// ⑥ 클릭 반응 — 노드 하나 선택에 1초 미만 (개발 빌드; 프로덕션은 수십 ms)
const clickMs = await page.evaluate(async () => { const t0 = performance.now(); (await import('/src/stores/interactionStore.ts')).useInteractionStore.getState().setSelectedId('big3'); await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); return Math.round(performance.now() - t0); });
ok(`⑥ 노드 선택 → 다음 프레임까지 ${clickMs}ms (< 1000)`, clickMs < 1000);

// ⑦ 작은 맵은 예전처럼 전부 그린다
await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); d.useDocumentStore.getState().setSample(); });
await settle();
total = await nodeCount(); dom = await domCount();
ok(`⑦ 작은 맵(${total}노드)은 전부 그린다 (DOM ${dom})`, dom === total);

// ⑧ 큰 MD 불러오기 — "여는 중" 안내가 떴다가(문구에 노드 수) 사라지고 맵이 열린다
const md = ['# 큰 문서', ''].concat(Array.from({ length: 60 }, (_, i) => [`## 절 ${i}`, ''].concat(Array.from({ length: 12 }, (_, j) => `### 항목 ${i}-${j}\n\n> 설명 ${i}-${j}\n`)).join('\n'))).join('\n');
await page.evaluate(() => document.querySelector('[data-testid="crumb-docs"]')?.click());
await settle(800);
for (let k = 0; k < 20 && !(await page.$('input[type="file"]')); k++) { await page.evaluate(() => document.querySelector('[data-testid="browser-new-map"]')?.click()); await settle(300); }
await page.evaluate(() => { window.__ov = []; new MutationObserver(() => { const el = document.querySelector('[data-testid="opening-overlay"]'); const on = !!el; const last = window.__ov.length ? window.__ov[window.__ov.length - 1][0] : false; if (on !== last) window.__ov.push([on, el?.textContent ?? '']); }).observe(document.body, { childList: true, subtree: true }); });
await page.setInputFiles('input[type="file"]', { name: 'big.md', mimeType: 'text/markdown', buffer: Buffer.from(md, 'utf8') });
let loaded = false;
for (let i = 0; i < 60; i++) { await settle(500); if (await page.evaluate(async () => (await import('/src/stores/documentStore.ts')).useDocumentStore.getState().map.title === '큰 문서')) { loaded = true; break; } }
await settle(800);
const ov = await page.evaluate(() => window.__ov);
ok(`⑧ 큰 MD 를 불러오면 맵이 열린다 (${await nodeCount()}노드)`, loaded);
ok(`⑧ "여는 중" 안내가 떴다가 사라졌다 — ${JSON.stringify(ov.map((x) => x[0]))}`, ov.length >= 2 && ov[0][0] === true && ov[ov.length - 1][0] === false);
ok(`⑧ 안내 문구에 노드 수 — "${(ov[0]?.[1] ?? '').replace(/@keyframes.*$/, '')}"`, /개 노드를 그리는 중/.test(ov[0]?.[1] ?? ''));
ok('⑧ 다 열린 뒤 안내는 없다', await page.$('[data-testid="opening-overlay"]') === null);
await browser.close();
console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과');
