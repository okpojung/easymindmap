// 가이드 03 — 부분 강조 툴바 · 드래그 이동 4장면 · 기사 붙여넣기.
//   node scripts/doc-shots/guide03.mjs <출력폴더> <기사 사진 base64 파일>
import { readFileSync } from 'node:fs';
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const B64 = process.argv[3] ? readFileSync(process.argv[3], 'utf8').trim() : '';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const shot = (name, rects, pad) => shotUnion(page, size, `${OUT}/${name}.png`, rects, pad);
let mouse = { x: 0, y: 0 };
const ghost = () => ({ x: mouse.x - 130, y: mouse.y - 40, width: 260, height: 80 });
// 드래그: 노드 중심에서 누르고 4px 넘게 움직여야 시작된다 (Canvas.tsx)
const drag = async (fromId, toX, toY) => {
  const fb = await nodeBox(page, fromId);
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
  await page.mouse.down();
  await page.mouse.move(fb.x + fb.width / 2 + 8, fb.y + fb.height / 2 + 8, { steps: 3 });
  await page.mouse.move(toX, toY, { steps: 20 });
  mouse = { x: toX, y: toY };
  await page.waitForTimeout(250);
};
const release = async () => { await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(300); };

// 부분 강조 툴바 — 더블클릭으로 편집에 들어가면 노드 위에 뜬다
await stores.select(page, 'b1-1'); await stores.center(page, 'b1-1'); await page.waitForTimeout(400);
{
  const nb = await nodeBox(page, 'b1-1');
  await page.mouse.dblclick(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.waitForSelector('[data-testid="mark-toolbar"]', { timeout: 5000 });
  await page.evaluate(() => { const ta = document.querySelector('textarea'); const i = ta.value.indexOf('시스템'); ta.focus(); if (i >= 0) ta.setSelectionRange(i, i + 3); });
  await page.waitForTimeout(300);
  await shot('mark-toolbar', [await page.locator('[data-testid="mark-toolbar"]').boundingBox(), await page.locator('textarea').boundingBox(), nb], 50);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
}
// 하위 자리 — 노드 안쪽
await stores.select(page, 'b1-2'); await stores.center(page, 'b1'); await page.waitForTimeout(400);
{ const tb = await nodeBox(page, 'b2'); await drag('b1-2', tb.x + tb.width / 2, tb.y + tb.height / 2); await shot('drag-child', [ghost(), tb], 90); await release(); }
// 뒤 형제 — 형제 축 바깥
await stores.select(page, 'b1-2'); await stores.center(page, 'b2'); await page.waitForTimeout(400);
{ const tb = await nodeBox(page, 'b3'); await drag('b1-2', tb.x + tb.width / 2, tb.y + tb.height + 14); await shot('drag-after', [ghost(), tb, await nodeBox(page, 'b3-1')], 80); await release(); }
// 방사형·양쪽 — 반대쪽 빈 공간 (좌/우 이동 배지)
await stores.select(page, 'b1'); await stores.center(page, 'root'); await page.waitForTimeout(400);
{ const rb = await nodeBox(page, 'root'); await drag('b1', rb.x - 260, rb.y - 140); await shot('drag-flip', [ghost(), rb], 70); await release(); }
// 다중 선택 드래그 — "N개 이동" + 상위 자리는 주황 "1개만 가능"
await stores.select(page, 'b1-1'); await stores.multi(page, ['b1-1', 'b1-2']); await stores.center(page, 'b2'); await page.waitForTimeout(400);
{
  const tb = await nodeBox(page, 'b2-1');
  await drag('b1-1', tb.x - 14, tb.y + tb.height / 2);
  const ok = await page.locator('[data-testid="drop-parent-blocked"]').count();
  if (!ok) { await page.mouse.move(tb.x - 6, tb.y + tb.height / 2, { steps: 4 }); mouse = { x: tb.x - 6, y: tb.y + tb.height / 2 }; await page.waitForTimeout(250); }
  await shot('drag-multi-blocked', [ghost(), tb, await nodeBox(page, 'b2')], 80); await release();
}
// 기사 붙여넣기 — 선택만 한 노드에 text/html 붙여넣기 (사진은 data: URI)
await stores.select(page, 'b3-1'); await stores.center(page, 'b3-1'); await page.waitForTimeout(400);
{
  await page.evaluate(({ B64 }) => {
    const img = B64 ? `<figure><img src="data:image/png;base64,${B64}" alt="사진"></figure>` : '';
    const html = `<article><h2>EasyMindMap, 마인드맵에 AI 커넥터를 더하다</h2><p>기사 첫 문단입니다. 사진 앞에 오는 글입니다.</p>${img}<p>사진 뒤에 이어지는 둘째 문단입니다. 사진이 원래 자리에 남습니다.</p></article>`;
    const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', '기사 첫 문단입니다.\n사진 뒤에 이어지는 둘째 문단입니다.');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { B64 });
  await page.waitForTimeout(1200);
  const id = await stores.selectedId(page);
  await stores.center(page, id); await page.waitForTimeout(500);
  await shot('paste-article', [await nodeBox(page, id), await nodeBox(page, 'b3-1')], 60);
}
await browser.close();
