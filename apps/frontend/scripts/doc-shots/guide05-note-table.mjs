// 가이드 05 — 노드 노트 표 블록: +표 → 10×10 격자 → 표 팝업(격자/MD) → 그려진 표 + ✎ (2026-09-19).
//   node scripts/doc-shots/guide05-note-table.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion, openSample } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
await openSample(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });
const noteBlocks = (id) => page.evaluate(async ({ id }) => {
  const d = await import('/src/stores/documentStore.ts');
  return (d.findNodeInMap(d.useDocumentStore.getState().map, id)?.notes ?? []).map((b) => ({ type: b.type, text: b.text }));
}, { id });
const cell = (r, c) => page.locator(`[data-table-cell="${r}x${c}"]`);
const addBtn = page.locator('[data-testid="note-add-table"]');
const view = page.locator('[data-testid="note-table-view"]');
const dlg = page.locator('[data-testid="table-dialog"]');
const save = () => page.locator('[data-testid="table-dialog-save"]').click();

await ui({ activeSection: 'inspector', inspectorTab: 'note', sidebarCollapsed: false });
await stores.select(page, 'b1-1'); await page.waitForTimeout(400);

// ① +표 → 10×10 격자 (사이드바 안에 붙는다)
ok('① 노트가 없는 노드: +표 활성', !(await addBtn.isDisabled()));
await addBtn.click();
await page.waitForSelector('[data-testid="table-grid-picker"]', { timeout: 3000 });
const picker = page.locator('[data-testid="table-grid-picker"]');
const pb = await picker.boundingBox(); const ab = await addBtn.boundingBox();
ok('① 격자가 버튼 아래 · 사이드바 안(오른쪽 끝 맞춤)', pb.y > ab.y && pb.x + pb.width <= ab.x + ab.width + 4 && pb.x >= 0);
await page.locator('[data-grid-cell="3x4"]').hover(); await page.waitForTimeout(150);
ok('① 격자 라벨 3행 × 4열', (await picker.innerText()).includes('3행 × 4열'));
await shotUnion(page, size, `${OUT}/05-note-table-picker.png`, [ab, pb, { x: ab.x - 260, y: ab.y - 10, width: 10, height: 10 }], 16);
await page.locator('[data-grid-cell="3x4"]').click();

// ② 표 팝업(격자) 채우기 → 확인 → 노트 표 블록
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 });
ok('② 팝업 3행 × 4열', (await page.locator('[data-testid="table-dialog-grid"] tr').count()) === 3 && (await page.locator('[data-testid="table-dialog-grid"] th').count()) === 4);
await cell(0, 1).fill('항목'); await cell(0, 2).fill('값'); await cell(0, 3).fill('단위'); await cell(0, 4).fill('비고');
await cell(1, 1).fill('메모리'); await cell(1, 2).fill('32'); await cell(1, 3).fill('GB'); await cell(1, 4).fill('DDR5');
await cell(2, 1).fill('디스크'); await cell(2, 2).fill('1'); await cell(2, 3).fill('TB'); await cell(2, 4).fill('NVMe');
await cell(0, 2).focus(); await page.locator('[data-testid="table-align-center"]').click(); await page.waitForTimeout(80);
// MD 보기로 전환하면 GFM 표가 보인다 (노드 내용 표와 같은 팝업)
await page.locator('[data-testid="table-view-md"]').click(); await page.waitForTimeout(150);
const mdText = await page.locator('[data-testid="table-md-input"]').inputValue();
ok('② MD 보기: GFM 표 (정렬 콜론 포함)', mdText.includes('| 항목 | 값 | 단위 | 비고 |') && mdText.includes('|---|:---:|---|---|'));
await page.locator('[data-testid="table-view-grid"]').click(); await page.waitForTimeout(150);
await save(); await page.waitForTimeout(250);
ok('② 팝업 닫힘', (await dlg.count()) === 0);
let notes = await noteBlocks('b1-1');
ok('② 노트 표 블록 원문 = 줄=행 · " | "=열 · 정렬 구분선만', notes.length === 1 && notes[0].type === 'table'
  && notes[0].text === '항목 | 값 | 단위 | 비고\n--- | :---: | --- | ---\n메모리 | 32 | GB | DDR5\n디스크 | 1 | TB | NVMe');
ok('② 노트 탭에 그려진 표 (머리글 4 · 데이터 2행)', (await view.locator('th').count()) === 4 && (await view.locator('tbody tr').count()) === 2);
ok('② 값 열이 가운데 정렬로 그려진다', (await view.locator('tbody tr').first().locator('td').nth(1).evaluate((el) => getComputedStyle(el).textAlign)) === 'center');
ok('② +표 는 이제 비활성 (노드당 1개)', await addBtn.isDisabled());
const vb = await view.boundingBox();
await shotUnion(page, size, `${OUT}/05-note-table.png`, [vb, { x: vb.x - 10, y: vb.y - 46, width: vb.width + 20, height: 10 }], 14);

// ③ ✎ → 같은 팝업에 채워진 채로 · 고치면 원문도 바뀐다
await page.locator('[data-testid="note-table-edit"]').click();
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 });
ok('③ ✎ 팝업에 기존 셀이 채워져 있다', (await cell(1, 1).inputValue()) === '메모리' && (await cell(0, 4).inputValue()) === '비고');
await cell(2, 2).fill('2'); await save(); await page.waitForTimeout(250);
notes = await noteBlocks('b1-1');
ok('③ 고친 셀이 원문에 반영 · 정렬 유지', notes[0].text.includes('디스크 | 2 | TB | NVMe') && notes[0].text.includes('--- | :---: | --- | ---'));
ok('③ 그려진 표도 갱신', (await view.locator('tbody tr').nth(1).locator('td').nth(1).innerText()) === '2');

// ④ 더블클릭도 팝업 · Esc 취소는 그대로
await view.dblclick();
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 });
await cell(1, 1).fill('바뀌면 안 됨'); await page.keyboard.press('Escape'); await page.waitForTimeout(200);
ok('④ 더블클릭 → 팝업, Esc → 원문 그대로', (await dlg.count()) === 0 && (await noteBlocks('b1-1'))[0].text.includes('메모리 | 32'));

// ⑤ 노드 배지(⊞) 팝업에도 같은 표
await ui({ sidebarCollapsed: true });
await stores.select(page, null); await stores.center(page, 'b1-1'); await page.waitForTimeout(500);
await page.locator('[data-node-id="b1-1"] [data-node-ind="note-table"]').first().click(); await page.waitForTimeout(500);
const popTh = await page.evaluate(() => [...document.querySelectorAll('th')].filter((th) => !th.closest('[data-testid="note-table-view"]')).map((th) => th.textContent.trim()));
ok('⑤ 노트 팝업의 표 머리글 = 항목·값·단위·비고', ['항목', '값', '단위', '비고'].every((h) => popTh.includes(h)));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// ⑥ MD 내보내기 — 노트 표가 GFM 표(정렬 콜론)로 나간다
const md = await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts');
  const s = await import('/@fs/home/user/easymindmap/packages/emm-parser/src/serialize.ts');
  return s.buildEmmBody(d.useDocumentStore.getState().map, [], {});
});
ok('⑥ MD 내보내기에 | 항목 | 값 | 단위 | 비고 | + |---|:---:|---|---|', md.includes('| 항목 | 값 | 단위 | 비고 |') && md.includes('|---|:---:|---|---|') && md.includes('| 디스크 | 2 | TB | NVMe |'));

await browser.close();
