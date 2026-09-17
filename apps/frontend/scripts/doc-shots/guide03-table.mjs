// 가이드 03 — 노드 표 삽입(⊞ 격자 → 팝업) 3장면 + 동작 검증 (2026-09-17).
//   node scripts/doc-shots/guide03-table.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const shot = (name, rects, pad) => shotUnion(page, size, `${OUT}/${name}.png`, rects, pad);
const fail = (m) => { console.error('FAIL', m); process.exitCode = 1; };
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };

await stores.select(page, 'b1-1'); await stores.center(page, 'b1-1'); await page.waitForTimeout(400);
const nb = await nodeBox(page, 'b1-1');
await page.mouse.dblclick(nb.x + nb.width / 2, nb.y + nb.height / 2);
await page.waitForSelector('[data-testid="mark-toolbar"]', { timeout: 5000 });
// 커서를 글 끝으로
await page.evaluate(() => { const ta = document.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });

// 툴바 자체 (B I S U H { } ☑ ⊞) — 가이드 03 mark-toolbar.png 재촬영
await page.evaluate(() => { const ta = document.querySelector('textarea'); const i = ta.value.indexOf('시스템'); ta.focus(); if (i >= 0) ta.setSelectionRange(i, i + 3); });
await page.waitForTimeout(200);
await shot('mark-toolbar', [await page.locator('[data-testid="mark-toolbar"]').boundingBox(), await page.locator('textarea').boundingBox(), nb], 50);
await page.evaluate(() => { const ta = document.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });

// ① ⊞ → 10×10 격자, 3행×4열 위에 마우스
await page.locator('[data-testid="mark-toolbar"] button[title^="표"]').click();
await page.waitForSelector('[data-testid="table-grid-picker"]', { timeout: 3000 });
await page.locator('[data-grid-cell="3x4"]').hover();
await page.waitForTimeout(200);
ok('① 격자 라벨이 3행 × 4열', (await page.locator('[data-testid="table-grid-picker"]').innerText()).includes('3행 × 4열'));
await shot('table-grid', [await page.locator('[data-testid="mark-toolbar"]').boundingBox(), await page.locator('[data-testid="table-grid-picker"]').boundingBox(), nb], 40);
await page.locator('[data-grid-cell="3x4"]').click();

// ② 팝업 — 격자 셀 입력
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 });
const grid = page.locator('[data-testid="table-dialog-grid"]');
ok('② 팝업 격자 3행(머리글 1 + 2) × 4열', (await grid.locator('tr').count()) === 3 && (await grid.locator('th').count()) === 4);
const cell = (r, c) => page.locator(`[data-table-cell="${r}x${c}"]`);
await cell(0, 1).fill('항목'); await cell(0, 2).fill('값'); await cell(0, 3).fill('단위'); await cell(0, 4).fill('비고');
await cell(1, 1).fill('메모리'); await cell(1, 2).fill('32'); await cell(1, 3).fill('GB'); await cell(1, 4).fill('DDR5');
await cell(2, 1).fill('디스크'); await cell(2, 2).fill('1'); await cell(2, 3).fill('TB'); await cell(2, 4).fill('NVMe');
await page.waitForTimeout(200);
// ②-b 행·열 버튼은 커서 셀 기준 (2026-09-17 사용자 요청)
const btn = (label) => page.locator('[data-testid="table-dialog"] button', { hasText: label }).first();
await cell(1, 2).focus();                       // 1행(메모리) 2열(값)
await btn('+ 행').click(); await page.waitForTimeout(100);
ok('②-b +행 = 커서 행 아래 (2행이 빈 행, 디스크는 3행으로)', (await cell(2, 1).inputValue()) === '' && (await cell(3, 1).inputValue()) === '디스크');
ok('②-b 새 행의 같은 열에 포커스', await page.evaluate(() => document.activeElement?.getAttribute('data-table-cell')) === '2x2');
await btn('− 행').click(); await page.waitForTimeout(100);
ok('②-b −행 = 커서 행(빈 행) 삭제', (await cell(2, 1).inputValue()) === '디스크' && (await grid.locator('tr').count()) === 3);
await cell(0, 2).focus();                       // 머리글 2열(값)
await btn('+ 열').click(); await page.waitForTimeout(100);
ok('②-b +열 = 커서 열 오른쪽 (3열이 새 열, 단위는 4열로)', (await cell(0, 3).inputValue()).startsWith('열') && (await cell(0, 4).inputValue()) === '단위');
await btn('− 열').click(); await page.waitForTimeout(100);
ok('②-b −열 = 커서 열(새 열) 삭제', (await cell(0, 3).inputValue()) === '단위' && (await grid.locator('th').count()) === 4);
await cell(0, 1).focus();
await btn('− 행').isDisabled().then((d) => ok('②-b 머리글에 커서면 −행 비활성', d));
await cell(1, 1).focus();
const card = page.locator('[data-testid="table-dialog"] > div');
await card.screenshot({ path: `${OUT}/table-dialog.png` }); console.log('shot table-dialog');

// ③ MD 보기 전환 — 파이프 원문
await page.locator('[data-testid="table-view-md"]').click();
await page.waitForSelector('[data-testid="table-md-input"]', { timeout: 3000 });
const mdv = await page.locator('[data-testid="table-md-input"]').inputValue();
ok('③ MD 원문에 머리글·구분선·데이터 행', mdv.startsWith('| 항목 | 값 | 단위 | 비고 |\n|---|---|---|---|\n| 메모리 | 32 | GB | DDR5 |'));
await card.screenshot({ path: `${OUT}/table-dialog-md.png` }); console.log('shot table-dialog-md');
// MD 에서 셀 하나 고치고 격자로 돌아오면 반영
await page.locator('[data-testid="table-md-input"]').fill(mdv.replace('NVMe', 'SATA'));
await page.locator('[data-testid="table-view-grid"]').click();
await page.waitForTimeout(150);
ok('③ MD → 격자 전환에 수정이 반영', (await cell(2, 4).inputValue()) === 'SATA');

// ④ 확인 → 편집창 텍스트에 표가 들어간다 → 커밋 → 노드에 격자로 그려진다
await page.locator('[data-testid="table-dialog-save"]').click();
await page.waitForTimeout(200);
const taVal = await page.locator('textarea').inputValue();
ok('④ 편집창 원문에 표', taVal.includes('| 항목 | 값 | 단위 | 비고 |') && taVal.includes('| 디스크 | 1 | TB | SATA |'));
ok('④ 팝업이 닫힌 뒤 툴바가 다시 보인다', (await page.locator('[data-testid="mark-toolbar"]').count()) === 1);
// 커밋 — 캔버스 빈 곳 클릭
await page.mouse.click(nb.x + nb.width / 2, nb.y + nb.height + 260);
await page.waitForTimeout(500);
await page.waitForSelector('[data-node-id="b1-1"] [data-node-table]', { timeout: 5000 }).catch(() => fail('④ 노드에 표가 그려지지 않음'));
await stores.select(page, 'b1-1'); await stores.center(page, 'b1-1'); await page.waitForTimeout(400);
const nb2 = await nodeBox(page, 'b1-1');
await shot('table-node', [nb2], 70);

// ⑤ 표 더블클릭 → 수정 팝업 (기존 값 프리필)
const tb = await page.locator('[data-node-id="b1-1"] [data-node-table]').boundingBox();
await page.mouse.dblclick(tb.x + tb.width / 2, tb.y + tb.height / 2);
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 }).catch(() => fail('⑤ 더블클릭 팝업 없음'));
ok('⑤ 수정 팝업에 기존 값', (await cell(1, 1).inputValue()) === '메모리');
ok('⑤ 제목이 "표 수정"', (await page.locator('[data-testid="table-dialog"]').innerText()).includes('표 수정'));
await cell(1, 2).fill('64');
await page.locator('[data-testid="table-dialog-save"]').click();
await page.waitForTimeout(400);
const svgText = await page.locator('[data-node-id="b1-1"]').first().evaluate((el) => el.textContent || '');
ok('⑤ 저장 뒤 노드 표에 64', svgText.includes('64'));

// ⑥ 편집 중 ⊞ 를 다시 누르면 (표가 이미 있음) 삽입이 아니라 수정 팝업
await page.mouse.dblclick(nb2.x + nb2.width / 2, nb2.y + 12);
await page.waitForSelector('[data-testid="mark-toolbar"]', { timeout: 5000 });
await page.locator('[data-testid="mark-toolbar"] button[title^="표"]').click();
await page.locator('[data-grid-cell="2x2"]').click();
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 });
ok('⑥ 이미 표가 있으면 수정 팝업(값 프리필)', (await cell(1, 2).inputValue()) === '64');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.keyboard.press('Escape');

// ⑦ 아웃라인 보기 — 표 위 ✎ 를 누르면 같은 팝업 (값 프리필) → 셀 수정 → 저장 → 행 텍스트 반영
await page.locator('[data-testid="mainview-toggle"]').click();
await page.waitForTimeout(600);
const editBtn = page.locator('[data-html-table-edit]').first();
await editBtn.waitFor({ timeout: 5000 }).catch(() => fail('⑦ 아웃라인 표 ✎ 없음'));
await editBtn.click();
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 }).catch(() => fail('⑦ 팝업 없음'));
ok('⑦ 아웃라인 ✎ 팝업에 기존 값', (await cell(2, 1).inputValue()) === '디스크');
await cell(2, 2).fill('2');
await page.locator('[data-testid="table-dialog-save"]').click();
await page.waitForTimeout(500);
ok('⑦ 저장 뒤 아웃라인 표에 2 TB', (await page.locator('[data-html-table]').first().innerText()).includes('2'));
await page.locator('[data-testid="mainview-toggle"]').click();
await page.waitForTimeout(400);

// ⑧ 코드 블록 팝업 — { } 버튼 → 언어·코드 입력 장면 (사용자 매뉴얼용)
await stores.select(page, 'b1-2'); await stores.center(page, 'b1-2'); await page.waitForTimeout(400);
{
  const cb = await nodeBox(page, 'b1-2');
  await page.mouse.dblclick(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForSelector('[data-testid="mark-toolbar"]', { timeout: 5000 });
  await page.evaluate(() => { const ta = document.querySelector('textarea'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); });
  await page.locator('[data-testid="mark-toolbar"] button[title^="코드 블록"]').click();
  await page.waitForSelector('[data-testid="code-block-dialog"]', { timeout: 3000 });
  await page.locator('[data-testid="code-lang-input"]').fill('bash');
  await page.locator('[data-testid="code-body-input"]').fill('npm ci\nnpm run build\npm2 restart api');
  await page.waitForTimeout(150);
  await page.locator('[data-testid="code-block-dialog"] > div').screenshot({ path: `${OUT}/code-dialog.png` }); console.log('shot code-dialog');
  await page.locator('[data-testid="code-dialog-save"]').click();
  await page.waitForTimeout(200);
  ok('⑧ 편집창에 코드 펜스', (await page.locator('textarea').inputValue()).includes('```bash\nnpm ci'));
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height + 260);
  await page.waitForTimeout(500);
  await page.waitForSelector('[data-node-id="b1-2"] [data-node-code]', { timeout: 5000 }).catch(() => fail('⑧ 노드에 코드 패널 없음'));
  await stores.select(page, 'b1-2'); await stores.center(page, 'b1-2'); await page.waitForTimeout(400);
  await shot('code-node', [await nodeBox(page, 'b1-2')], 70);
}

await browser.close();
console.log(process.exitCode ? '\n실패 있음' : '\n모두 통과');
