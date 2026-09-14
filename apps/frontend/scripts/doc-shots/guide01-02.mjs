// 가이드 01(화면 구성 · 다크 모드) · 02(새 맵 · 템플릿 선택 · 템플릿 등록).
// vite: VITE_SUPABASE_URL=http://auth.local VITE_SUPABASE_AUTH_PREFIX= VITE_API_URL=https://api-dev.mindmap.ai.kr
//   node scripts/doc-shots/guide01-02.mjs <출력폴더>
import { boot, forceFont, authStubs, openSample, overlay, clearOverlay, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot({ width: 1400, height: 860, scale: 1, beforeGoto: authStubs() });
await page.getByTestId('user-menu').waitFor({ timeout: 30000 });
await forceFont(page);
await openSample(page);
const bb = (loc) => loc.boundingBox();
const up = (sel, pred) => page.evaluate(({ sel, pred }) => {
  let el = document.querySelector(sel); const f = new Function('r', 'el', `return ${pred}`);
  while (el && !f(el.getBoundingClientRect(), el)) el = el.parentElement;
  const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
}, { sel, pred });

// ── 01 화면 구성: ① 툴바 ② 레일 ③ 맵 ④ 상태바 ⑤ 맵 도구 ────────
{
  const toolbar = await up('[data-testid="theme-toggle"]', 'r.width > innerWidth * 0.6');
  const rail = await up('[title="템플릿"]', 'r.height > innerHeight * 0.5');
  const status = await up('[data-testid="status-map-weight"]', 'r.width > innerWidth * 0.6');
  const tools = await up('[title="모두 펼치기"]', 'r.width > 250');
  const canvas = { x: rail.x + rail.width, y: toolbar.y + toolbar.height, width: size.width - rail.x - rail.width, height: status.y - toolbar.y - toolbar.height };
  const badge = (n, r, dx = 8, dy = 8) => ({ kind: 'badge', text: n, x: r.x + dx, y: r.y + dy });
  await overlay(page, [
    { kind: 'box', ...toolbar }, badge('1', toolbar, 10, 4),
    { kind: 'box', ...rail }, badge('2', rail, 2, 70),
    badge('3', { x: canvas.x + canvas.width / 2 - 22, y: canvas.y + 30 }, 0, 0),
    { kind: 'box', ...status }, badge('4', status, 10, -48),
    { kind: 'box', ...tools }, badge('5', { x: tools.x - 54, y: tools.y - 4 }, 0, 0),
  ]);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/01-overview.png` }); console.log('shot 01-overview');
  await clearOverlay(page);
}
// ── 01 다크 모드 토글 ─────────────────────────────────
{
  const tg = await bb(page.getByTestId('theme-toggle'));
  await overlay(page, [{ kind: 'ring', x: tg.x - 6, y: tg.y - 6, width: tg.width + 12, height: tg.height + 12 }]);
  const toolbar = await up('[data-testid="theme-toggle"]', 'r.width > innerWidth * 0.6');
  await shotUnion(page, size, `${OUT}/01-theme-toggle.png`, [{ x: Math.max(toolbar.x, tg.x - 420), y: toolbar.y, width: Math.min(size.width, tg.x + 260) - Math.max(toolbar.x, tg.x - 420), height: toolbar.height }], 6);
  await clearOverlay(page);
  await page.getByTestId('theme-toggle').click(); await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/01-dark.png` }); console.log('shot 01-dark');
  await page.getByTestId('theme-toggle').click(); await page.waitForTimeout(300);
}
// ── 02 새 맵: 문서함 ▸ ＋ 새 맵 ▾ ▸ 새 맵 만들기 ▸ 확인 ▸ 템플릿 선택 ──
{
  await page.evaluate(async () => { const ui = await import('/src/stores/editorUiStore.ts'); ui.useEditorUiStore.getState().setBrowserOpen(true); });
  await page.getByTestId('browser-new-map').waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
  await page.getByTestId('browser-new-map').click();
  const menu = page.getByTestId('browser-new-map-menu'); await menu.waitFor();
  await menu.getByText('새 맵 만들기', { exact: false }).first().click();
  await menu.getByText('닫고 진행할까요', { exact: false }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(200);
  await shotUnion(page, size, `${OUT}/02-newmap-menu.png`, [await bb(page.getByTestId('browser-new-map')), await bb(menu)], 24);
  await menu.getByRole('button', { name: /계속/ }).first().click();
  await page.getByTestId('tpl-choose').waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
  const tc = await bb(page.getByTestId('tpl-choose'));
  await shotUnion(page, size, `${OUT}/02-template-choose.png`, [tc], 16);
  await page.getByTestId('tpl-skip').click(); await page.waitForTimeout(600);
}
// ── 02 내 템플릿 등록 ───────────────────────────────
{
  await page.waitForSelector('[data-node-id="root"]', { timeout: 10000 });
  await page.locator('[title="템플릿"]').first().click(); await page.waitForTimeout(400);
  const input = page.getByPlaceholder(/템플릿 이름/); await input.waitFor();
  await input.fill('주간 회의 골격');
  const btn = page.getByRole('button', { name: '등록', exact: true }).first();
  const br = await bb(btn);
  await overlay(page, [{ kind: 'ring', x: br.x - 6, y: br.y - 6, width: br.width + 12, height: br.height + 12 }]);
  const rail = await up('[title="템플릿"]', 'r.height > innerHeight * 0.5');
  const ib = await bb(input); const pc = await bb(page.getByTestId('panel-close'));
  await shotUnion(page, size, `${OUT}/02-template-register.png`, [{ x: rail.x, y: pc.y - 10, width: (ib.x + ib.width + 80) - rail.x, height: (ib.y + 150) - (pc.y - 10) }], 0);
  await clearOverlay(page);
}
await browser.close();
