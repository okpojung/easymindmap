// 가이드 04 — 레이아웃 탭 · 접힌 노드 +N 배지 · 아웃라인 분할+강조 · 모드 전환 버튼.
// vite: 인증 모드 (guide01-02.mjs 와 같음)
//   node scripts/doc-shots/guide04.mjs <출력폴더>
import { boot, forceFont, authStubs, openSample, overlay, clearOverlay, shotUnion, stores, nodeBox } from './lib.mjs';
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
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });

// ── 레이아웃 탭 (속성 ▸ 레이아웃) ─────────────────────
{
  await stores.select(page, null);
  await ui({ activeSection: 'inspector', inspectorTab: 'layout', sidebarCollapsed: false });
  await page.waitForTimeout(500);
  const rail = await up('[title="템플릿"]', 'r.height > innerHeight * 0.5');
  const pc = await bb(page.getByTestId('panel-close'));
  await shotUnion(page, size, `${OUT}/04-layout-tab.png`, [{ x: rail.x, y: pc.y - 12, width: (pc.x + pc.width + 16) - rail.x, height: 560 }], 0);
  await ui({ sidebarCollapsed: true });
}
// ── 접힌 노드의 +N 배지 ─────────────────────────────
{
  await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); d.useDocumentStore.getState().setCollapsed('b1', true); });
  // 선택하면 + 인디케이터가 같은 자리에 겹쳐 +N 칩이 가려진다 — 선택은 풀고 마우스만 올린다
  await stores.select(page, null); await stores.center(page, 'b1'); await page.waitForTimeout(500);
  const nb = await nodeBox(page, 'b1');
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2); await page.waitForTimeout(300);
  await shotUnion(page, size, `${OUT}/04-collapse-badge.png`, [{ x: nb.x - 120, y: nb.y - 70, width: nb.width + 300, height: nb.height + 140 }], 0);
  await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); d.useDocumentStore.getState().setCollapsed('b1', false); });
}
// ── 아웃라인 분할 + 노란 강조 ────────────────────────
{
  await stores.select(page, null);
  await page.evaluate(async () => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.getState().setOutlineSplit(true); });
  await page.waitForSelector('[data-outline-id="b2-1"]', { timeout: 10000 }); await page.waitForTimeout(400);
  await page.locator('[data-outline-id="b2-1"]').click(); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/04-outline-split.png` }); console.log('shot 04-outline-split');
  await page.evaluate(async () => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.getState().setOutlineSplit(false); });
  await page.waitForTimeout(400);
}
// ── 아웃라인 모드 / 맵 모드 전환 버튼 ─────────────────
{
  const tg = await bb(page.getByTestId('mainview-toggle'));
  await overlay(page, [{ kind: 'ring', x: tg.x - 6, y: tg.y - 6, width: tg.width + 12, height: tg.height + 12 }]);
  const toolbar = await up('[data-testid="theme-toggle"]', 'r.width > innerWidth * 0.6');
  await shotUnion(page, size, `${OUT}/04-mainview-toggle.png`, [{ x: Math.max(toolbar.x, tg.x - 420), y: toolbar.y, width: Math.min(size.width, tg.x + 300) - Math.max(toolbar.x, tg.x - 420), height: toolbar.height }], 6);
  await clearOverlay(page);
  await page.getByTestId('mainview-toggle').click(); await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/04-outline-mode.png` }); console.log('shot 04-outline-mode');
  await page.getByTestId('mainview-toggle').click(); await page.waitForTimeout(300);
}
await browser.close();
