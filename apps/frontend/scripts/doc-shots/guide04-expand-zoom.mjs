// 가이드 04 — [+ 모두 펼치기]/[− 모두 접기] 뒤 화면: 선택이 있으면 그 노드를 100% 로 중앙에, 없으면 전체 맞추기 (2026-09-21).
//   node scripts/doc-shots/guide04-expand-zoom.mjs
import { boot, forceFont, stores, nodeBox } from './lib.mjs';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const vp = () => page.evaluate(async () => { const m = await import('/src/stores/viewportStore.ts'); const s = m.useViewportStore.getState(); return { zoom: s.zoom, panX: s.panX, panY: s.panY }; });
const setZoom = (z) => page.evaluate(async ({ z }) => { const m = await import('/src/stores/viewportStore.ts'); m.useViewportStore.getState().setZoom(z); }, { z });
const canvasRect = () => page.evaluate(() => {
  const s = [...document.querySelectorAll('svg[viewBox]')].map((e) => e.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  return { x: s.x, y: s.y, W: s.width, H: s.height };
});
const collapsedOf = (id) => page.evaluate(async ({ id }) => { const d = await import('/src/stores/documentStore.ts'); return !!d.findNodeInMap(d.useDocumentStore.getState().map, id)?.collapsed; }, { id });
const expandBtn = page.locator('[data-testid="expand-all"]');
const collapseBtn = page.locator('[data-testid="collapse-all"]');
const centeredAt100 = async (id, label) => {
  const v = await vp(); const c = await canvasRect(); const b = await nodeBox(page, id);
  ok(`${label}: 배율 100% (${v.zoom}%)`, v.zoom === 100);
  ok(`${label}: ${id} 가 화면 중앙 (노드 중심 ${Math.round(b.x + b.width / 2 - c.x)},${Math.round(b.y + b.height / 2 - c.y)} vs 중앙 ${Math.round(c.W / 2)},${Math.round(c.H / 2)})`,
    near(b.x + b.width / 2, c.x + c.W / 2, 3) && near(b.y + b.height / 2, c.y + c.H / 2, 3));
};

// ① b1 을 접어 두고 50% 로 놓은 뒤, b1 선택 → [+] → b1 하위가 펼쳐지고 **100% 로 b1 이 화면 중앙** (전체 맞추기가 아니다)
await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); d.useDocumentStore.getState().setCollapsed('b1', true); });
await stores.select(page, 'b1'); await setZoom(50); await page.waitForTimeout(300);
ok('① 전제: b1 접힘 · 50%', (await collapsedOf('b1')) && (await vp()).zoom === 50);
await expandBtn.click(); await page.waitForTimeout(400);
ok('① [+] → b1 펼쳐짐', !(await collapsedOf('b1')));
await centeredAt100('b1', '① [+] 뒤');

// ② 다른 배율(150%)에서 [−] → b1 하위가 접히고 역시 100% · 중앙
await setZoom(150); await page.waitForTimeout(200);
await collapseBtn.click(); await page.waitForTimeout(400);
ok('② [−] → b1 하위 접힘', await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); const n = d.findNodeInMap(d.useDocumentStore.getState().map, 'b1'); return (n.children ?? []).every((c) => !c.children?.length || c.collapsed) || !!n.collapsed; }));
await centeredAt100('b1', '② [−] 뒤');

// ③ 다중 선택(b2·b3, 대표 b2) → [+] → 대표 노드가 100% 로 중앙
await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); d.useDocumentStore.getState().setCollapsed('b2', true); d.useDocumentStore.getState().setCollapsed('b3', true); });
await stores.multi(page, ['b2', 'b3']); await page.evaluate(async () => { const m = await import('/src/stores/interactionStore.ts'); m.useInteractionStore.getState().setSelectedId('b2'); });
await setZoom(40); await page.waitForTimeout(300);
await expandBtn.click(); await page.waitForTimeout(400);
ok('③ 둘 다 펼쳐짐', !(await collapsedOf('b2')) && !(await collapsedOf('b3')));
await centeredAt100('b2', '③ 다중 선택 [+] 뒤 (대표 b2)');

// ④ 선택이 없으면 예전처럼 맵 전체 맞추기 (배율은 맵 크기에 맞게 바뀐다)
await stores.select(page, null); await setZoom(100); await page.waitForTimeout(300);
const before = await vp();
await expandBtn.click(); await page.waitForTimeout(400);
const after = await vp();
ok(`④ 선택 없음 [+] → 전체 맞추기 (배율 ${before.zoom}% → ${after.zoom}%, pan 이 바뀐다)`, after.zoom !== 100 || after.panX !== before.panX || after.panY !== before.panY);

await browser.close();
