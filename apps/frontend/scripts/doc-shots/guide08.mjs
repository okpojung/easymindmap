// 가이드 08 — 내보내기 메뉴 · HTML 뷰어 헤더 · 불러오기 버튼들.
// vite: 인증 모드 (guide01-02.mjs 와 같음)
//   node scripts/doc-shots/guide08.mjs <출력폴더>
import { writeFileSync } from 'node:fs';
import { boot, forceFont, authStubs, openSample, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot({ width: 1400, height: 860, scale: 1, beforeGoto: authStubs() });
await page.getByTestId('user-menu').waitFor({ timeout: 30000 });
await forceFont(page);
await openSample(page);
const bb = (loc) => loc.boundingBox();
const around = (text, pred) => page.evaluate(({ text, pred }) => {
  const leaf = [...document.querySelectorAll('div,button,span')].filter((e) => e.textContent?.trim().startsWith(text)).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  const f = new Function('r', `return ${pred}`); let el = leaf; while (el && !f(el.getBoundingClientRect())) el = el.parentElement;
  const r = (el ?? leaf).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
}, { text, pred });

// ── 내보내기 메뉴 ──────────────────────────────────
{
  // data-testid=export-menu 는 펼쳐진 목록이고, 여는 버튼은 툴바의 '내보내기' 글자 버튼이다
  const openBtn = page.getByRole('button', { name: /내보내기/ }).first(); await openBtn.click(); await page.waitForTimeout(300);
  await page.getByText('HTML 파일 내보내기').waitFor();
  const menu = await around('HTML 파일 내보내기', 'r.width >= 240 && r.height >= 120 && r.height <= 600');
  await shotUnion(page, size, `${OUT}/08-export-menu.png`, [await bb(openBtn), await bb(page.getByTestId('export-menu')), menu], 14);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
}
// ── HTML 뷰어 헤더 — 실제 내보내기 함수로 만든 HTML 을 열어 찍는다 ───
{
  const html = await page.evaluate(async () => {
    const d = await import('/src/stores/documentStore.ts'); const ui = await import('/src/stores/editorUiStore.ts');
    const { buildStandaloneHtml } = await import('/src/export/exportHtml.ts');
    return buildStandaloneHtml(d.useDocumentStore.getState().map, ui.useEditorUiStore.getState().layoutType);
  });
  const file = `${OUT}/viewer.html`; writeFileSync(file, html);
  const vctx = await browser.newContext({ viewport: { width: 1400, height: 860 }, deviceScaleFactor: 2 });
  const v = await vctx.newPage();
  await v.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await v.goto('file://' + file); await v.waitForTimeout(1200);
  await v.addStyleTag({ content: '*{font-family:Pretendard,sans-serif !important}' }).catch(() => {});
  // 헤더 도구는 오른쪽에 몰려 있다 — 그 부분만 2배 배율로
  await v.screenshot({ path: `${OUT}/08-viewer-header.png`, clip: { x: 830, y: 0, width: 570, height: 52 } });
  await v.screenshot({ path: `${OUT}/08-viewer-full.png` });
  console.log('shot 08-viewer-*'); await vctx.close();
}
// ── 불러오기 버튼들 — 문서함 ＋ 새 맵 ▾ 메뉴 ──────────────
{
  await page.evaluate(async () => { const ui = await import('/src/stores/editorUiStore.ts'); ui.useEditorUiStore.getState().setBrowserOpen(true); });
  await page.getByTestId('browser-new-map').waitFor({ timeout: 10000 }); await page.waitForTimeout(400);
  await page.getByTestId('browser-new-map').click();
  const menu = page.getByTestId('browser-new-map-menu'); await menu.waitFor(); await page.waitForTimeout(300);
  const hasSub = await menu.getByText('MD 파일 불러오기', { exact: false }).count();
  if (!hasSub) { await menu.getByText('Local 파일 불러오기', { exact: false }).first().click().catch(() => {}); await page.waitForTimeout(300); }
  await shotUnion(page, size, `${OUT}/08-import-buttons.png`, [await bb(page.getByTestId('browser-new-map')), await bb(menu)], 20);
}
await browser.close();
