// 가이드 08 — HTML 뷰어: 첫 화면(100% · 트리는 중심 주제 위쪽) + 미니맵 (2026-09-30 사용자 보고:
// "HTML 로 내보내도 원래 레이아웃이 아니다"(2% 전체 맞추기로 열림), "HTML 에도 미니맵을").
// 뷰어 HTML 을 만들어(buildStandaloneHtml) 새 페이지에 올리고 검사한다. 스크린샷 없음.
//   node scripts/doc-shots/guide08-viewer-home-minimap.mjs
import { boot } from './lib.mjs';
const { browser, page } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

// 진행트리(안은 트리) 큰 맵 — 40 폴더 × 10 문서 × 5 견출
const html = await page.evaluate(async ({ layout }) => {
  const ex = await import('/src/export/exportHtml.ts');
  let seq = 0; const id = () => `v${++seq}`;
  const branches = Array.from({ length: 12 }, (_, i) => ({ id: id(), text: `folder-${i}`, layoutType: 'tree-right', children: Array.from({ length: 8 }, (_, j) => ({ id: id(), text: `doc-${i}-${j}`, layoutType: 'tree-right', children: Array.from({ length: 5 }, (_, k) => ({ id: id(), text: `heading ${i}-${j}-${k}` })) })) }));
  return ex.buildStandaloneHtml({ title: '뷰어 시험', root: { id: 'root', text: '뷰어 시험 맵' }, branches }, layout);
}, { layout: 'process-tree-right' });
const v = await browser.newPage({ viewport: { width: 1400, height: 900 } });
// 같은 origin 의 주소로 띄운다 — about:blank(setContent) 는 localStorage 가 막혀 ⑤ 를 못 본다
let served = html;
await v.route('http://127.0.0.1:5199/viewer-test.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: served }));
const open = async (h) => { served = h; await v.goto('http://127.0.0.1:5199/viewer-test.html', { waitUntil: 'load' }); await v.waitForTimeout(1200); };
await open(html);

// ① 첫 화면 — 100%, 중심 주제 위 변이 화면 위 72px · 왼쪽 40px
let m = await v.evaluate(() => {
  const svg = document.getElementById('mm-svg'); const sr = svg.getBoundingClientRect();
  const rootG = Array.from(document.querySelectorAll('#mm-world g')).find((g) => (g.textContent || '').trim().startsWith('뷰어 시험 맵'));
  const rr = rootG?.querySelector('rect')?.getBoundingClientRect();
  return { pct: document.getElementById('mm-zoom-pct')?.textContent, top: rr ? Math.round(rr.top - sr.top) : null, left: rr ? Math.round(rr.left - sr.left) : null };
});
ok(`① 뷰어 첫 화면은 100% (${m.pct})`, m.pct === '100%');
ok(`① 중심 주제 위 변 72px · 왼쪽 40px (${m.top}, ${m.left})`, near(m.top, 72) && near(m.left, 40, 6));

// ② 미니맵 — 단추로 켜고, 노드 사각형·화면 사각형이 있다
await v.click('#mm-minimap-btn'); await v.waitForTimeout(300);
m = await v.evaluate(() => ({ on: document.body.classList.contains('mm-minimap-on'), shown: getComputedStyle(document.getElementById('mm-minimap')).display !== 'none', nodes: document.querySelectorAll('#mm-minimap-nodes rect').length, view: document.getElementById('mm-minimap-view').getAttribute('width') }));
ok(`② 미니맵 켜짐 — 노드 사각형 ${m.nodes}개, 화면 사각형 있음`, m.on && m.shown && m.nodes === 1 + 12 + 96 + 480 && parseFloat(m.view) > 0);

// ③ 미니맵 클릭 → 그 자리가 화면 가운데로 (view 가 바뀐다)
const before = await v.evaluate(() => document.getElementById('mm-world').getAttribute('transform'));
const box = await v.locator('#mm-minimap-svg').boundingBox();
await v.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8); await v.waitForTimeout(200);
const after = await v.evaluate(() => document.getElementById('mm-world').getAttribute('transform'));
ok('③ 미니맵 클릭으로 화면이 이동한다', before !== after);
m = await v.evaluate(() => { const r = document.getElementById('mm-minimap-view'); const nodes = Array.from(document.querySelectorAll('#mm-minimap-nodes rect')); const x0 = Math.min(...nodes.map((n) => parseFloat(n.getAttribute('x')))), y0 = Math.min(...nodes.map((n) => parseFloat(n.getAttribute('y')))); const x1 = Math.max(...nodes.map((n) => parseFloat(n.getAttribute('x')) + parseFloat(n.getAttribute('width')))), y1 = Math.max(...nodes.map((n) => parseFloat(n.getAttribute('y')) + parseFloat(n.getAttribute('height')))); const vx = parseFloat(r.getAttribute('x')), vy = parseFloat(r.getAttribute('y')), vw = parseFloat(r.getAttribute('width')), vh = parseFloat(r.getAttribute('height')); return { cx: vx + vw / 2, cy: vy + vh / 2, right: vx + vw, bottom: vy + vh, x1, y1, vw, vh, w: x1 - x0, h: y1 - y0 }; });
// 가둠(e2e330): 맵이 화면보다 큰 축은 사각형이 맵 안에, 작은 축은 중심이 맵 안에 — 클릭 자리(176,120)와 그 한계 중 가까운 쪽
const wantX = m.w > m.vw ? Math.min(176, m.x1 - m.vw / 2) : Math.min(176, m.x1); const wantY = m.h > m.vh ? Math.min(120, m.y1 - m.vh / 2) : Math.min(120, m.y1);
ok(`③ 화면 사각형이 클릭한 자리(0.8,0.8)로 가되 맵 밖으로는 안 나간다 (${Math.round(m.cx)},${Math.round(m.cy)} ≈ ${Math.round(wantX)},${Math.round(wantY)})`, near(m.cx, wantX, 4) && near(m.cy, wantY, 4));

// ③-b 맵 바깥 빈 공간으로는 못 간다 — 왼쪽 위 구석 클릭 → 화면 사각형이 맵 경계 안에 붙는다
await v.mouse.click(box.x + 2, box.y + 2); await v.waitForTimeout(200);
m = await v.evaluate(() => { const r = document.getElementById('mm-minimap-view'); const nodes = Array.from(document.querySelectorAll('#mm-minimap-nodes rect')); const nx = Math.min(...nodes.map((n) => parseFloat(n.getAttribute('x')))); const ny = Math.min(...nodes.map((n) => parseFloat(n.getAttribute('y')))); return { vx: parseFloat(r.getAttribute('x')), vy: parseFloat(r.getAttribute('y')), nx, ny }; });
ok(`③-b 뷰어 미니맵 구석 클릭 → 사각형 왼쪽 위가 맵 왼쪽 위에 붙는다 (${Math.round(m.vx)},${Math.round(m.vy)} ≈ ${Math.round(m.nx)},${Math.round(m.ny)})`, Math.abs(m.vx - m.nx) <= 2 && Math.abs(m.vy - m.ny) <= 2);

// ④ 접기 뒤 미니맵 노드 수가 줄고, 다시 켜지 않아도 갱신된다
await v.click('#mm-collapse'); await v.waitForTimeout(400);
m = await v.evaluate(() => document.querySelectorAll('#mm-minimap-nodes rect').length);
ok(`④ 모두 접기 → 미니맵 노드 ${m}개 (중심 + 폴더 12)`, m === 13);

// ⑤ 끄면 사라지고, 상태가 저장돼 다시 열어도 켜져 있다
await v.click('#mm-minimap-btn'); await v.waitForTimeout(200);
ok('⑤ 단추로 끄면 사라진다', await v.evaluate(() => !document.body.classList.contains('mm-minimap-on')));
await v.click('#mm-minimap-btn'); await v.waitForTimeout(200);
await open(html);
ok('⑤ 다시 열면 켜 둔 상태 그대로 (localStorage)', await v.evaluate(() => document.body.classList.contains('mm-minimap-on') && document.querySelectorAll('#mm-minimap-nodes rect').length > 0));

// ⑥ 방사형 맵은 중심 주제가 화면 가운데
const html2 = await page.evaluate(async () => {
  const ex = await import('/src/export/exportHtml.ts');
  return ex.buildStandaloneHtml({ title: 'r', root: { id: 'root', text: '방사형' }, branches: [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }] }, 'radial-bidirectional');
});
await v.evaluate(() => { try { localStorage.removeItem('emm.viewer.minimap'); } catch (e) {} });
await open(html2);
m = await v.evaluate(() => { const svg = document.getElementById('mm-svg'); const sr = svg.getBoundingClientRect(); const g = Array.from(document.querySelectorAll('#mm-world g')).find((x) => (x.textContent || '').trim().startsWith('방사형')); const rr = g.querySelector('rect').getBoundingClientRect(); return { cx: Math.round(rr.left + rr.width / 2 - sr.left), cy: Math.round(rr.top + rr.height / 2 - sr.top), w: Math.round(sr.width), h: Math.round(sr.height), pct: document.getElementById('mm-zoom-pct')?.textContent }; });
ok(`⑥ 방사형은 중심 주제가 가운데 (${m.cx},${m.cy} ≈ ${Math.round(m.w / 2)},${Math.round(m.h / 2)}) · 100%`, near(m.cx, m.w / 2, 4) && near(m.cy, m.h / 2, 4) && m.pct === '100%');
await browser.close();
console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과');
