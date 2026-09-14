// 가이드 11 — 버전 기록 패널 (목록 · 별표 · 상세). 서버 맵으로 연결하고 /versions 를 스텁한다.
// (소유권 넘기기 화면은 유료 모듈(ProShareDialog)이라 이 저장소에서는 렌더할 수 없다 — pro/stub.tsx)
// vite: 인증 모드 (guide01-02.mjs 와 같음)
//   node scripts/doc-shots/guide11.mjs <출력폴더>
import { boot, forceFont, authStubs, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const MAP = 'm-demo-1';
const versions = [
  { version: 12, title: '2026 제품 로드맵', createdAt: '2026-09-13T06:25:00Z', bytes: 3100, layoutType: 'radial-bidirectional', nodeCount: 30, attachBytes: 0, attachCount: 0, platform: 'Windows 11', browser: 'Chrome 129', pinned: false, label: null, pinnedByMe: false, pinnedAt: null },
  { version: 11, title: '2026 제품 로드맵', createdAt: '2026-09-13T05:10:00Z', bytes: 3050, layoutType: 'radial-bidirectional', nodeCount: 29, attachBytes: 0, attachCount: 0, platform: 'Windows 11', browser: 'Chrome 129', pinned: false, label: null, pinnedByMe: false, pinnedAt: null },
  { version: 9, title: '2026 제품 로드맵', createdAt: '2026-09-02T02:03:00Z', bytes: 2900, layoutType: 'radial-bidirectional', nodeCount: 27, attachBytes: 0, attachCount: 0, platform: 'Android 14', browser: 'Chrome 129', pinned: false, label: null, pinnedByMe: false, pinnedAt: null },
  { version: 5, title: '2026 제품 로드맵', createdAt: '2026-08-14T09:20:00Z', bytes: 2600, layoutType: 'radial-bidirectional', nodeCount: 22, attachBytes: 0, attachCount: 0, platform: 'Windows 11', browser: 'Edge 128', pinned: true, label: 'v1.0 제출본', pinnedByMe: true, pinnedAt: '2026-08-14T09:21:00Z' },
];
const { browser, page, size } = await boot({ width: 1400, height: 860, scale: 1, beforeGoto: authStubs((p, m, req, json) => {
  if (p === `/maps/${MAP}/versions` && m === 'GET') return json({ mapId: MAP, versions, total: versions.length, pin: { ready: true, limit: null, count: 1, versionDays: 30, canPin: true, isOwner: true } });
  // VersionPrunePreview — expired/thinned/expiring 배열이 없으면 HistoryPanel 이 .length 에서 죽는다
  if (p === `/maps/${MAP}/versions/prune-preview`) return json({ mapId: MAP, enabled: true, ready: true, versionDays: 30, graceDays: 7, expired: [], thinned: [], expiring: [], kept: versions.length });
  if (p === `/maps/${MAP}/lock` || p === `/maps/${MAP}/heartbeat`) return json({ ok: true, locked: true, mine: true });
  return null;
}) });
await page.getByTestId('user-menu').waitFor({ timeout: 30000 });
await forceFont(page);
await page.evaluate(async ({ MAP }) => {
  const d = await import('/src/stores/documentStore.ts'); const s = await import('/src/editor/__samples__/index.ts');
  const ui = await import('/src/stores/editorUiStore.ts'); const vp = await import('/src/stores/viewportStore.ts');
  const c = await import('/src/stores/cloudStore.ts');
  d.setHistoryPaused(true); d.useDocumentStore.getState().loadMap(structuredClone(s.SAMPLE_ROADMAP), { resetHistory: true, serverMapId: MAP }); d.setHistoryPaused(false);
  // loadMap 의 serverMapId 만으로는 cloudStore 가 묶이지 않는다 — 문서함이 하듯 link() 로 서버 맵으로 묶는다
  c.useCloudStore.getState().link(MAP, new Date().toISOString(), { title: '2026 제품 로드맵' });
  ui.useEditorUiStore.getState().setBrowserOpen(false); vp.useViewportStore.getState().requestFit();
}, { MAP });
await page.waitForSelector('[data-node-id="root"]', { timeout: 15000 }); await page.waitForTimeout(600);
await page.locator('[title="히스토리"]').first().click();
await page.getByTestId('history-list').waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
await page.getByTestId('history-item').nth(1).click().catch(() => {}); await page.waitForTimeout(400);
const rail = await page.evaluate(() => { let el = document.querySelector('[title="템플릿"]'); while (el && el.getBoundingClientRect().height < innerHeight * 0.5) el = el.parentElement; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
const pc = await page.getByTestId('panel-close').boundingBox();
await shotUnion(page, size, `${OUT}/11-version-history.png`, [{ x: rail.x, y: pc.y - 12, width: (pc.x + pc.width + 16) - rail.x, height: 640 }], 0);
console.log('items', await page.getByTestId('history-item').count(), 'pinned', await page.getByTestId('history-unpin').count());
await browser.close();
