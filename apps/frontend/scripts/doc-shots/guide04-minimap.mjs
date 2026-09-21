// 가이드 04 — 미니맵: 상태바 버튼/Alt+M/Alt+H 토글 · 화면 사각형 크기 · 끌어서 이동 · 클릭 이동 (2026-09-21).
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
const w1 = rb.w;
await setZoom(200); await page.waitForTimeout(150);
rb = await rectBox();
ok('③ 200% → 사각형 너비가 절반', near(rb.w, w1 * (v.zoom / 200), 2));
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

// ⑤ 빈 곳 클릭 → 그 자리가 화면 중앙
await page.mouse.click(rb.sx + 8, rb.sy + 8); await page.waitForTimeout(150);
const rb3 = await rectBox();
ok('⑤ 미니맵 (8,8) 클릭 → 사각형 중심이 (8,8)', near(rb3.x + rb3.w / 2, 8, 2) && near(rb3.y + rb3.h / 2, 8, 2));

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

await browser.close();
