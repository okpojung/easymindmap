// 가이드 04 — 미니맵: 상태바 버튼/Alt+M/Alt+H 토글 · 화면 사각형 크기 · 끌어서 이동 · 클릭 이동 · 큰 맵 창 모드 · 열 때 100% (2026-09-21).
//   node scripts/doc-shots/guide04-minimap.mjs <출력폴더>
import { boot, forceFont, shotUnion, openSample } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
await openSample(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const vp = () => page.evaluate(async () => { const m = await import('/src/stores/viewportStore.ts'); const s = m.useViewportStore.getState(); return { zoom: s.zoom, panX: s.panX, panY: s.panY, panMode: s.panMode }; });
const setZoom = (z) => page.evaluate(async ({ z }) => { const m = await import('/src/stores/viewportStore.ts'); m.useViewportStore.getState().setZoom(z); }, { z });
const uiOpen = () => page.evaluate(async () => (await import('/src/stores/editorUiStore.ts')).useEditorUiStore.getState().minimapOpen);
// 캔버스 <svg> (viewBox 가 있는 가장 큰 svg) 의 px 크기 = W × H
const canvasSize = () => page.evaluate(() => {
  const s = [...document.querySelectorAll('svg[viewBox]')].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return { W: s.width, H: s.height };
});
const toggle = page.locator('[data-testid="minimap-toggle"]');
const panel = page.locator('[data-testid="minimap"]');
const rect = page.locator('[data-testid="minimap-viewport"]');
const rectBox = async () => {
  const b = await rect.boundingBox(); const sb = await panel.locator('svg').boundingBox();
  return { x: b.x - sb.x, y: b.y - sb.y, w: b.width, h: b.height, sx: sb.x, sy: sb.y, sw: sb.width, sh: sb.height };
};
const scale = () => panel.locator('svg').getAttribute('data-minimap-scale').then(Number);
const origin = () => panel.locator('svg').getAttribute('data-minimap-origin').then((v) => v.split(',').map(Number));
const fits = () => panel.locator('svg').getAttribute('data-minimap-fits');

// 캔버스 밖(빈 곳)을 한 번 눌러 키 입력이 캔버스로 가게
await page.mouse.click(size.width / 2, size.height / 2);

// ① 상태바 버튼 → 미니맵 열림
ok('① 처음엔 닫혀 있다', (await panel.count()) === 0);
await toggle.click(); await page.waitForTimeout(250);
ok('① 버튼 → 미니맵 패널이 우하단에', await panel.isVisible() && (await uiOpen()) === true);
const pb = await panel.boundingBox(); const cs = await canvasSize();
ok('① 패널이 캔버스 오른쪽 아래 구석', pb.x + pb.width > size.width - 200 && pb.y + pb.height > size.height - 120);
ok('① 버튼이 켜진 색', (await toggle.evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgba(0, 0, 0, 0)');
ok('① 노드 사각형이 그려져 있다', (await panel.locator('svg rect').count()) > 10);

// ② 화면 사각형 크기 = 캔버스 창 px ÷ 배율 × 미니맵 배율
let v = await vp(); let sc = await scale(); let rb = await rectBox();
const expW = cs.W / (v.zoom / 100) * sc, expH = cs.H / (v.zoom / 100) * sc;
ok(`② 사각형 ${Math.round(rb.w)}×${Math.round(rb.h)} = 창 ${Math.round(cs.W)}×${Math.round(cs.H)} ÷ ${v.zoom}% × 배율`, near(rb.w, expW, 2) && near(rb.h, expH, 2));
await shotUnion(page, size, `${OUT}/04-minimap.png`, [pb, await toggle.boundingBox()], 16);

// ③ 배율을 올리면 사각형이 작아진다 (200% = 반)
await setZoom(200); await page.waitForTimeout(150);
rb = await rectBox(); sc = await scale();
ok('③ 200% → 사각형 = 창 ÷ 2 × 배율 (배율은 그때 값)', near(rb.w, cs.W / 2 * sc, 2) && near(rb.h, cs.H / 2 * sc, 2));
await setZoom(100); await page.waitForTimeout(150);

// ④ 사각형을 끌면 화면이 따라간다
v = await vp(); sc = await scale(); rb = await rectBox();
const cx = rb.sx + rb.x + rb.w / 2, cy = rb.sy + rb.y + rb.h / 2;
await page.mouse.move(cx, cy); await page.mouse.down();
await page.mouse.move(cx + 20, cy + 10, { steps: 4 }); await page.mouse.move(cx + 40, cy + 20, { steps: 4 });
await page.mouse.up(); await page.waitForTimeout(150);
const v2 = await vp(); const rb2 = await rectBox();
// mini 40px = world 40/sc → pan 은 그만큼 반대로(×s)
ok('④ 끌기 40×20px → pan 이 반대로 (40/배율)·(20/배율)', near(v2.panX - v.panX, -40 / sc * (v.zoom / 100), 2) && near(v2.panY - v.panY, -20 / sc * (v.zoom / 100), 2));
ok('④ 사각형도 40×20 만큼 옮겨졌다', near(rb2.x - rb.x, 40, 2) && near(rb2.y - rb.y, 20, 2));

// ⑤ 빈 곳 클릭 → 그 자리가 화면 중앙 (클릭 시점의 배율·창 원점으로 world 점을 셈)
sc = await scale(); const [ox, oy] = await origin(); v = await vp();
const wx = 8 / sc + ox, wy = 8 / sc + oy;
await page.mouse.click(rb.sx + 8, rb.sy + 8); await page.waitForTimeout(150);
const v3 = await vp();
ok('⑤ 미니맵 (8,8) 클릭 → 그 world 점이 화면 중앙 (pan = −(w − C)·s)',
  near(v3.panX, -(wx - cs.W / 2) * (v.zoom / 100), 2) && near(v3.panY, -(wy - cs.H / 2) * (v.zoom / 100), 2));

// ⑥ Alt+M · Alt+H 토글, H 단독은 Pan 모드
await page.keyboard.press('Alt+m'); await page.waitForTimeout(150);
ok('⑥ Alt+M → 닫힘', (await panel.count()) === 0);
await page.keyboard.press('Alt+m'); await page.waitForTimeout(150);
ok('⑥ Alt+M → 다시 열림', await panel.isVisible());
const pm0 = (await vp()).panMode;
await page.keyboard.press('Alt+h'); await page.waitForTimeout(150);
ok('⑥ Alt+H → 닫힘, Pan 모드는 그대로', (await panel.count()) === 0 && (await vp()).panMode === pm0);
await page.keyboard.press('h'); await page.waitForTimeout(100);
ok('⑥ H 단독은 여전히 Pan 모드 토글', (await vp()).panMode === !pm0);
await page.keyboard.press('h'); await page.waitForTimeout(100);

// ⑦ 패널의 × 로도 닫힌다
await toggle.click(); await page.waitForTimeout(150);
await page.locator('[data-testid="minimap-close"]').click(); await page.waitForTimeout(150);
ok('⑦ × → 닫힘 · 버튼도 꺼진 색', (await panel.count()) === 0 && (await toggle.evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgba(0, 0, 0, 0)');

// ⑧ 세로로 아주 긴 맵 (가지 300개 × 하위 2 = 900 노드) — 패널은 그대로 크고, 표시창은 최소 60×45, 창 모드
await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts');
  const branches = Array.from({ length: 300 }, (_, i) => ({ id: `t${i}`, text: `가지 ${i + 1} — 긴 맵`, colorKey: 'l1B', side: 'right', children: [{ id: `t${i}c`, text: `하위 ${i + 1}` }, { id: `t${i}d`, text: `하위 ${i + 1}-2` }] }));
  d.setHistoryPaused(true); d.useDocumentStore.getState().loadMap({ title: '긴 맵', root: { id: 'root', text: '긴 맵', colorKey: 'root' }, branches }, { resetHistory: true }); d.setHistoryPaused(false);
});
await setZoom(100); await page.waitForTimeout(400);
await toggle.click(); await page.waitForTimeout(300);
const cs2 = await canvasSize(); const sb = await panel.locator('svg').boundingBox();
const expPanel = { w: Math.round(Math.min(360, Math.max(200, cs2.W * 0.24))), h: Math.round(Math.min(320, Math.max(150, cs2.H * 0.36))) };
ok(`⑧ 큰 맵에서도 패널은 창의 24%×36% (${Math.round(sb.width)}×${Math.round(sb.height)})`, near(sb.width, expPanel.w, 1) && near(sb.height, expPanel.h, 1));
ok('⑧ 창 모드 (맵이 다 안 들어간다)', (await fits()) === '0');
rb = await rectBox();
ok(`⑧ 표시창 ≥ 60×45 (${Math.round(rb.w)}×${Math.round(rb.h)})`, rb.w >= 59 && rb.h >= 44);
ok('⑧ 표시창이 패널 안에 다 보인다', rb.x >= -1 && rb.y >= -1 && rb.x + rb.w <= rb.sw + 1 && rb.y + rb.h <= rb.sh + 1);
ok('⑧ 노드 사각형이 그려진다 (창 안의 것만)', (await panel.locator('svg rect').count()) > 10);
await shotUnion(page, size, `${OUT}/04-minimap-window.png`, [await panel.boundingBox()], 16);
// 끌기 — 창은 끄는 동안 고정, 놓은 뒤에도 표시창은 패널 안
v = await vp(); sc = await scale();
const c2x = rb.sx + rb.x + rb.w / 2, c2y = rb.sy + rb.y + rb.h / 2;
await page.mouse.move(c2x, c2y); await page.mouse.down();
await page.mouse.move(c2x, c2y + 15, { steps: 3 }); await page.mouse.move(c2x, c2y + 30, { steps: 3 });
await page.mouse.up(); await page.waitForTimeout(150);
const v4 = await vp(); const rb4 = await rectBox();
ok('⑧ 30px 아래로 끌기 → pan 이 −30/배율 (배율 100%)', near(v4.panY - v.panY, -30 / sc, 2) && near(v4.panX, v.panX, 1));
ok('⑧ 놓은 뒤에도 표시창은 패널 안', rb4.y >= -1 && rb4.y + rb4.h <= rb4.sh + 1);
await page.mouse.click(60, 60); await page.waitForTimeout(100); // 빈 캔버스 — 미니맵은 그대로
// ⑧-b 끄는 중 사각형을 아래 끝으로 밀면 창이 따라 흐른다 (2026-09-21 "끝으로 옮기면 빨리 안 보인다")
const modeOf = () => panel.locator('svg').getAttribute('data-minimap-mode');
let [, oy0] = await origin(); rb = await rectBox();
const px = rb.sx + rb.x + rb.w / 2, py = rb.sy + rb.y + rb.h / 2;
await page.mouse.move(px, py); await page.mouse.down();
for (let i = 1; i <= 4; i++) { await page.mouse.move(px, py + i * 50, { steps: 2 }); await page.waitForTimeout(30); } // 맵 아래 끝(여백 포함)까지는 안 간다
ok('⑧-b 끄는 중 모드 = follow', (await modeOf()) === 'follow');
let [, oy1] = await origin(); const rbEdge = await rectBox();
ok('⑧-b 아래로 밀자 창 원점이 내려갔다 (창이 흐른다)', oy1 > oy0 + 10);
ok('⑧-b 사각형은 패널 아래 끝에 붙어 있다', near(rbEdge.y + rbEdge.h, rbEdge.sh, 2));
await page.mouse.up(); await page.waitForTimeout(150);
ok('⑧-b 놓으면 모드 auto', (await modeOf()) === 'auto');
// ⑧-c 휠 = 창만 옮긴다 (hold), 클릭하면 풀린다
[, oy0] = await origin();
await page.mouse.move(rb.sx + 30, rb.sy + 30); await page.mouse.wheel(0, -200); await page.waitForTimeout(150);
[, oy1] = await origin();
// boot() 의 deviceScaleFactor 가 2 라 wheel(0, −200) 은 CSS 로 deltaY −100 이다
ok(`⑧-c 휠 −200(CSS −100) → 창 원점 −100/배율 (${Math.round(oy1 - oy0)} vs ${Math.round(-100 / sc)}), 모드 hold`, near(oy1 - oy0, -100 / sc, 2) && (await modeOf()) === 'hold');
const vBeforeWheel = await vp();
ok('⑧-c 휠은 화면(pan·배율)은 건드리지 않는다', vBeforeWheel.zoom === 100 && near(vBeforeWheel.panY, (await vp()).panY, 0.01));
await page.mouse.click(rb.sx + 30, rb.sy + 30); await page.waitForTimeout(150);
ok('⑧-c 클릭하면 hold 가 풀린다 (auto)', (await modeOf()) !== 'hold');
// ⑧-d 대비 — 노드 사각형은 배경과 다른 진한 색 (팔레트 테두리색), 배경은 surfaceAlt
const bg = await panel.locator('svg').evaluate((el) => getComputedStyle(el).backgroundColor);
const fills = await panel.locator('svg rect:not([data-testid])').evaluateAll((els) => els.slice(0, 40).map((e) => e.getAttribute('fill')));
ok(`⑧-d 노드 색이 배경과 다르다 (배경 ${bg}, 노드 ${fills[0]})`, fills.length > 0 && fills.every((f) => f && f.toLowerCase() !== '#ffffff' && f.toLowerCase() !== '#fbf8f3' && f.toLowerCase() !== '#f5f0e8'));
ok('⑧-d 색 계열 가지(l1B)는 진한 파랑 테두리색으로', fills.includes('#3B82F6'));

// ⑨ 여는 순간 배율 100% (화면 중앙 world 점은 그대로)
await toggle.click(); await page.waitForTimeout(150);            // 닫기
await setZoom(60); await page.waitForTimeout(150);
v = await vp();
const cwx = cs2.W / 2 - v.panX / 0.6, cwy = cs2.H / 2 - v.panY / 0.6;   // 지금 화면 중앙의 world 점
await page.keyboard.press('Alt+m'); await page.waitForTimeout(250);   // 열기
const v5 = await vp();
ok('⑨ 60% 에서 열면 100% 로', v5.zoom === 100 && (await panel.isVisible()));
ok('⑨ 화면 중앙의 world 점은 그대로', near(v5.panX, -(cwx - cs2.W / 2), 1) && near(v5.panY, -(cwy - cs2.H / 2), 1));
await setZoom(150); await page.waitForTimeout(150);
ok('⑨ 열린 뒤 배율 조정은 자유 (150%)', (await vp()).zoom === 150 && (await panel.isVisible()));
await page.keyboard.press('Alt+m'); await page.waitForTimeout(100);
await page.keyboard.press('Alt+m'); await page.waitForTimeout(200);
ok('⑨ 100% 가 아닐 때 다시 열면 또 100% 로', (await vp()).zoom === 100);

await browser.close();
