// 가이드 03 — 표 셀 줄바꿈(<br>) 2장면 + 동작 검증 (2026-10-15 사용자 요청
// "표 셀 줄바꿈 해줘"). GFM 표는 줄 하나가 곧 행 하나라서 셀 안 줄바꿈은
// <br> 뿐이다 — GitHub 에서 본 모습과 emm 에서 본 모습이 같아야 한다.
//   node scripts/doc-shots/guide03-table-br.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const shot = (name, rects, pad) => shotUnion(page, size, `${OUT}/${name}.png`, rects, pad);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  console.log(`${g === w ? 'PASS' : 'FAIL'}  ${name}${g === w ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
  if (g !== w) process.exitCode = 1;
};

const ONE = '| 항목 | 설명 |\n| --- | --- |\n| 가격 | 50,000원 부가세 포함 |';
const BR  = '| 항목 | 설명 |\n| --- | --- |\n| 가격 | 50,000원<br>부가세 포함 |';

async function setNodeText(id, text) {
  await stores.select(page, id); await stores.center(page, id); await page.waitForTimeout(350);
  const nb = await nodeBox(page, id);
  await page.mouse.dblclick(nb.x + nb.width / 2, nb.y + 10);
  await page.waitForSelector('[data-testid="node-edit-overlay"] textarea', { timeout: 5000 });
  await page.fill('[data-testid="node-edit-overlay"] textarea', text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

// 표 기하 — 히트 rect(첫 rect) = 표 전체, 둘째 = 머리글 행
const geom = (id) => page.evaluate((nid) => {
  const g = document.querySelector(`[data-node-id="${nid}"] [data-node-table]`);
  if (!g) return null;
  const rects = Array.from(g.querySelectorAll('rect'));
  const y0 = Number(rects[0].getAttribute('y'));
  const texts = Array.from(g.querySelectorAll('text'));
  return {
    tH: Number(rects[0].getAttribute('height')),
    tW: Number(rects[0].getAttribute('width')),
    headH: Number(rects[1].getAttribute('height')),
    hLines: Array.from(g.querySelectorAll('line'))
      .filter((l) => l.getAttribute('y1') === l.getAttribute('y2'))
      .map((l) => Math.round(Number(l.getAttribute('y1')) - y0)),
    texts: texts.map((t) => t.textContent),
    ys: texts.map((t) => Math.round(Number(t.getAttribute('y')) - y0)),
  };
}, id);

// ── ① 한 줄 표 = 기준 (예전 기하가 그대로여야 한다) ────────────────
await setNodeText('b1-1', ONE);
const one = await geom('b1-1');
const lineH = one.headH - 6;                     // 한 줄 행 = lineH + 6
eq('① 한 줄 표 — 머리글·데이터 행 높이가 같고 전체 = 2행', [one.tH, one.hLines], [one.headH * 2, [one.headH]]);

// ── ② <br> 셀은 두 줄 · 그 행만 높아진다 ──────────────────────────
await setNodeText('b1-2', BR);
const br = await geom('b1-2');
eq('② <br> 셀이 두 줄로 그려진다 (리터럴 "<br>" 없음)',
  [br.texts.includes('50,000원'), br.texts.includes('부가세 포함'), br.texts.some((t) => (t || '').includes('<br>'))],
  [true, true, false]);
eq('② 머리글 높이는 그대로 · 표 전체만 한 줄(lineH) 높아진다', [br.headH, br.tH], [one.headH, one.tH + lineH]);
eq('② 가로선은 머리글 아래 한 줄 (행마다 높이가 달라도 자리가 맞는다)', br.hLines, [one.headH]);
const i0 = br.texts.indexOf('50,000원'), i1 = br.texts.indexOf('부가세 포함');
eq('② 두 줄 간격 = lineH', br.ys[i1] - br.ys[i0], lineH);
ok('② 두 줄은 그 행 안에서 세로 가운데',
  Math.abs((br.ys[i0] + br.ys[i1]) / 2 - (br.headH + (br.tH - br.headH) / 2)) < 5);
ok('② 열 폭은 가장 긴 줄 기준 — 한 줄로 이은 표보다 좁다', br.tW < one.tW);
await stores.center(page, 'b1-2'); await page.waitForTimeout(400);
// 그림에는 선택 테두리·+ 손잡이·툴팁이 없어야 읽기 좋다 — 선택을 풀고 마우스를 치운다
await page.evaluate(async () => {
  const m = await import('/src/stores/interactionStore.ts');
  m.useInteractionStore.getState().setSelectedId(null);
});
await page.mouse.move(5, 5);
await page.waitForTimeout(500);
await shot('table-cell-br-node', [await nodeBox(page, 'b1-2')], 70);

// ── ③ 표 팝업 — 셀 입력칸이 여러 줄, Enter 로 줄바꿈 ───────────────
const tb = await page.locator('[data-node-id="b1-2"] [data-node-table]').boundingBox();
await page.mouse.dblclick(tb.x + tb.width / 2, tb.y + tb.height - 6);
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 5000 });
const cell = (r, c) => page.locator(`[data-table-cell="${r}x${c}"]`);
eq('③ 셀 입력칸은 textarea · <br> 가 진짜 줄바꿈으로 · 줄 수만큼 높이',
  await cell(1, 2).evaluate((el) => [el.tagName, el.value, el.rows]),
  ['TEXTAREA', '50,000원\n부가세 포함', 2]);
await cell(1, 1).click();
await page.keyboard.press('End');
await page.keyboard.press('Enter');                 // 셀 안 줄바꿈 (창 확인은 Ctrl+Enter)
await page.keyboard.type('(세금계산서)');
await page.waitForTimeout(200);
await page.locator('[data-testid="table-dialog"] > div').screenshot({ path: `${OUT}/table-cell-br-dialog.png` });
console.log(`shot ${OUT}/table-cell-br-dialog.png`);
await page.locator('[data-testid="table-view-md"]').click();
await page.waitForSelector('[data-testid="table-md-input"]', { timeout: 3000 });
ok('③ MD 보기 원문에 <br> (Enter 로 넣은 줄바꿈)',
  (await page.locator('[data-testid="table-md-input"]').inputValue()).includes('가격<br>(세금계산서)'));
await page.locator('[data-testid="table-dialog-save"]').click();
await page.waitForTimeout(600);
const after = await geom('b1-2');
eq('③ 확인하면 캔버스도 두 줄 셀 둘 (표 높이 그대로)',
  [after.texts.includes('(세금계산서)'), after.tH], [true, br.tH]);

// ── ④ 아웃라인·칸반(HTML 렌더) — <br> 요소로 줄바꿈 ───────────────
await page.locator('[data-testid="mainview-toggle"]').click();
await page.waitForTimeout(900);
const ol = await page.evaluate(() => {
  const tds = Array.from(document.querySelectorAll('[data-html-table] td, [data-html-table] th'));
  return {
    withBr: tds.filter((td) => td.querySelectorAll('br').length === 1).map((td) => td.textContent).sort(),
    literal: tds.some((td) => td.innerHTML.includes('&lt;br&gt;')),
  };
});
eq('④ 아웃라인 표 — <br> 셀만 두 줄 · 리터럴 없음',
  [ol.withBr, ol.literal], [['50,000원부가세 포함', '가격(세금계산서)'], false]);
await page.locator('[data-testid="mainview-toggle"]').click();
await page.waitForTimeout(500);

// ── ⑤ 노트 표 블록 — 같은 규칙 ────────────────────────────────────
await stores.select(page, 'b1-3'); await page.waitForTimeout(200);
await page.locator('[data-testid="rail-note"]').click();
await page.waitForTimeout(400);
await page.locator('[data-testid="note-add-table"]').click();
await page.waitForSelector('[data-testid="table-grid-picker"]', { timeout: 3000 });
await page.locator('[data-grid-cell="1x1"]').evaluate((el) => el.click()); // 2행×2열 (사이드바 안)
await page.waitForSelector('[data-testid="table-dialog"]', { timeout: 3000 });
await cell(1, 1).click();
await page.keyboard.type('첫 줄');
await page.keyboard.press('Enter');
await page.keyboard.type('둘째 줄');
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(700);
const note = await page.evaluate(() => {
  const v = document.querySelector('[data-testid="note-table-view"]');
  if (!v) return { none: true };
  const cs = Array.from(v.querySelectorAll('td, th'));
  return {
    withBr: cs.filter((c) => c.querySelectorAll('br').length === 1).map((c) => c.textContent),
    literal: (v.textContent || '').includes('<br>'),
  };
});
eq('⑤ 노트 표 블록 — Enter 로 넣은 줄바꿈이 두 줄로 · 리터럴 없음',
  [note.withBr, note.literal], [['첫 줄둘째 줄'], false]);

// ── ⑥ 노트 뷰어 팝업(캔버스 ⊞ 배지) — 같은 규칙 ────────────────────
await page.locator('[data-node-id="b1-3"] [data-node-ind="note-table"]').first().click();
await page.waitForTimeout(600);
const pop = await page.evaluate(() => {
  const tbl = Array.from(document.querySelectorAll('table'))
    .find((t) => (t.textContent || '').includes('첫 줄'));
  if (!tbl) return { none: true };
  const cs = Array.from(tbl.querySelectorAll('td, th'));
  return {
    withBr: cs.filter((c) => c.querySelectorAll('br').length === 1).map((c) => c.textContent),
    literal: (tbl.textContent || '').includes('<br>'),
  };
});
eq('⑥ 노트 뷰어 팝업 — 두 줄 · 리터럴 없음', [pop.withBr, pop.literal], [['첫 줄둘째 줄'], false]);

await browser.close();
console.log(process.exitCode ? '\n실패 있음' : '\n모두 통과');
