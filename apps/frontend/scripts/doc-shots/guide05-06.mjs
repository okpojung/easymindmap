// 가이드 05(노트 탭 + 배지 팝업 · 태그 표시 + 필터) · 06(검색 패널 + 결과 · 강조된 노드).
// vite: 인증 모드 (guide01-02.mjs 와 같음)
//   node scripts/doc-shots/guide05-06.mjs <출력폴더>
import { boot, forceFont, authStubs, openSample, shotUnion, stores, nodeBox } from './lib.mjs';
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
const panelRect = async () => {
  const rail = await up('[title="템플릿"]', 'r.height > innerHeight * 0.5');
  const pc = await bb(page.getByTestId('panel-close'));
  return { x: rail.x, y: pc.y - 12, width: (pc.x + pc.width + 16) - rail.x };
};

// ── 05 노트: 문단 노트를 하나 넣고 노트·태그 탭 + 배지 팝업 ──────
{
  // 배지의 data-node-ind 는 kind('note-paragraph'), addNoteBlock 의 type 은 blockType('paragraph') — 둘이 다르다
  const para = 'note-paragraph';
  await page.evaluate(async () => {
    const d = await import('/src/stores/documentStore.ts');
    const { NOTE_KIND_META } = await import('/src/editor/node-renderer/nodeContent.ts');
    d.useDocumentStore.getState().addNoteBlock('b1-2', NOTE_KIND_META['note-paragraph'].blockType, '노드 추가·삭제·이동과 실행 취소를 한 묶음으로 다룬다. 히스토리 스택은 4단계까지 되돌린다.\n표·코드·체크 노트는 각각 배지가 따로 붙는다.');
  });
  await stores.select(page, 'b1-2');
  await ui({ activeSection: 'inspector', inspectorTab: 'note', sidebarCollapsed: false });
  await page.waitForTimeout(500);
  const pr = await panelRect();
  await shotUnion(page, size, `${OUT}/05-note-tab.png`, [{ ...pr, height: 600 }], 0);
  await ui({ sidebarCollapsed: true });
  await stores.select(page, null); await stores.center(page, 'b1-2'); await page.waitForTimeout(500);
  const badge = page.locator(`[data-node-id="b1-2"] [data-node-ind="${para}"]`).first();
  await badge.click(); await page.waitForTimeout(500);
  // 팝업 상자 = 노트 글을 품은 가장 작은 조상 중 폭 300 이상·높이 400 이하
  const pop = await page.evaluate(() => {
    const leaf = [...document.querySelectorAll('div,p,span')].filter((e) => e.textContent?.includes('히스토리 스택은 4단계까지')).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    let el = leaf; while (el && !(el.getBoundingClientRect().width >= 300 && el.getBoundingClientRect().height <= 400 && el.textContent.includes('에디터 코어'))) el = el.parentElement;
    const r = (el ?? leaf).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await shotUnion(page, size, `${OUT}/05-note-popup.png`, [await nodeBox(page, 'b1-2'), pop], 40);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
// ── 05 태그 표시 + 필터 (검색 패널 아래) ────────────────
{
  await stores.select(page, null);
  await page.locator('[title="검색"]').first().click(); await page.waitForTimeout(500);
  const pr = await panelRect();
  await stores.center(page, 'b1-1'); await page.waitForTimeout(400);
  await shotUnion(page, size, `${OUT}/05-tags.png`, [{ x: pr.x, y: pr.y, width: pr.width + 560, height: 600 }], 0);
}
// ── 06 검색 패널 + 결과 목록 → 결과 클릭 → 강조 ───────────
{
  const input = page.getByPlaceholder(/노드 · 태그 · 노트 검색/); await input.waitFor();
  await input.fill('노드'); await page.waitForTimeout(500);
  await page.getByText(/결과 \d+건/).waitFor();
  const pr = await panelRect();
  await shotUnion(page, size, `${OUT}/06-search-panel.png`, [{ ...pr, height: 620 }], 0);
  await page.locator('[data-search-kind]').first().locator('xpath=ancestor::div[@onclick or 1][1]').click().catch(async () => { await page.getByText('노드 추가 / 삭제 / 이동').first().click(); });
  await page.waitForTimeout(800);
  const id = await stores.selectedId(page);
  console.log('search hit ->', id);
  await ui({ sidebarCollapsed: true }); await page.waitForTimeout(300);
  const nb = await nodeBox(page, id);
  await shotUnion(page, size, `${OUT}/06-search-hit.png`, [{ x: nb.x - 160, y: nb.y - 90, width: nb.width + 320, height: nb.height + 180 }], 0);
}
await browser.close();
