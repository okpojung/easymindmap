// 가이드 03 — 스타일 복사(붓) 2장면 + 동작 검증 (2026-09-19).
//   node scripts/doc-shots/guide03-style-copy.mjs <출력폴더>
// 붓 버튼 → 커서 옆 붓 → 노드 클릭/러버밴드로 칠하기 → ESC·빈 곳 클릭 해제.
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const shot = (name, rects, pad) => shotUnion(page, size, `${OUT}/${name}.png`, rects, pad);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };

const node = (id) => page.evaluate(async ({ id }) => {
  const d = await import('/src/stores/documentStore.ts');
  const n = d.findNodeInMap(d.useDocumentStore.getState().map, id);
  return n ? { text: n.text, style: n.style, textAlign: n.textAlign, colorKey: n.colorKey, notes: n.notes?.length ?? 0 } : null;
}, { id });
const painter = () => page.evaluate(async () => {
  const m = await import('/src/stores/interactionStore.ts');
  const s = m.useInteractionStore.getState();
  return { on: !!s.stylePainter, src: s.stylePainter?.sourceId ?? null, sel: s.selectedId, multi: s.multiSelectedIds };
});
const past = () => page.evaluate(async () => (await import('/src/stores/documentStore.ts')).useDocumentStore.getState().past.length);
const clickNode = async (id) => { const b = await nodeBox(page, id); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(150); };
const btn = page.locator('[data-testid="style-copy"]');
const chip = page.locator('[data-testid="style-brush-cursor"]');
const look = (n) => [n.style?.shapeType, n.style?.fillColor, n.style?.textColor, n.style?.fontWeight, n.textAlign, n.colorKey];

// 원본 b1 에 눈에 띄는 스타일
await page.evaluate(async () => {
  const d = await import('/src/stores/documentStore.ts');
  d.useDocumentStore.getState().updateNodesStyle(['b1'], { shapeType: 'hexagon', fillColor: '#DBEAFE', borderColor: '#2563EB', textColor: '#1E3A8A', fontWeight: 'bold' });
  d.useDocumentStore.getState().updateNodesTextAlign(['b1'], 'left');
});
const SRC = look(await node('b1'));

// ① 선택이 없으면 붓 버튼은 비활성
await stores.select(page, null); await page.waitForTimeout(150);
ok('① 선택 없음 → 붓 버튼 비활성', await btn.isDisabled());

// ② b1 선택 → 붓 버튼 → 커서 옆 붓
await clickNode('b1');
ok('② b1 선택 → 붓 버튼 활성', !(await btn.isDisabled()));
await btn.click(); await page.waitForTimeout(150);
let p = await painter();
ok('② 붓 모드 켜짐 (원본 b1)', p.on && p.src === 'b1');
const b2 = await nodeBox(page, 'b2');
await page.mouse.move(b2.x + b2.width + 40, b2.y + b2.height / 2); await page.waitForTimeout(150);
ok('② 커서 옆에 붓 표시', await chip.isVisible());
const chipBox = await chip.boundingBox();
ok('② 붓은 커서 오른쪽 아래에 붙는다', chipBox.x > b2.x + b2.width + 40 && chipBox.y > b2.y + b2.height / 2);
ok('② 붓 버튼이 켜진 색', (await btn.evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgba(0, 0, 0, 0)');
await shot('style-copy-button', [await btn.boundingBox()], 24);
await shot('style-copy-brush', [await nodeBox(page, 'b1'), b2, chipBox], 50);

// ③ 노드 클릭 = 그 노드에 칠하기 (글은 그대로 · 모드 유지)
const b2Before = await node('b2');
await clickNode('b2');
const b2After = await node('b2');
ok('③ b2 가 b1 의 겉모습 (도형·채움·글자색·굵게·글자맞춤·색 계열)', JSON.stringify(look(b2After)) === JSON.stringify(SRC));
ok('③ b2 의 글·아이콘은 그대로', b2After.text === b2Before.text && b2After.text.startsWith('Q2'));
p = await painter();
ok('③ 칠한 뒤에도 붓 모드 유지 · b2 가 선택됨', p.on && p.sel === 'b2');
ok('③ 붓이 아직 보인다', await chip.isVisible());

// ④ 러버밴드 = 걸린 노드 전부에 한 번에 (undo 한 단계)
const pastBefore = await past();
const c1 = await nodeBox(page, 'b3-1'); const c2 = await nodeBox(page, 'b3-2');
const x0 = Math.max(c1.x, c2.x) + Math.min(c1.width, c2.width) + 30; // 자식 오른쪽 빈 곳에서 시작
const y0 = Math.min(c1.y, c2.y) - 8;
const x1 = Math.min(c1.x, c2.x) + 20; const y1 = Math.max(c1.y + c1.height, c2.y + c2.height) + 20;
await page.mouse.move(x0, y0); await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await page.waitForTimeout(20); }
await page.mouse.up(); await page.waitForTimeout(200);
p = await painter();
ok('④ 러버밴드에 b3-1·b3-2 가 걸렸다', p.multi.includes('b3-1') && p.multi.includes('b3-2') && !p.multi.includes('b3'));
ok('④ 둘 다 b1 의 겉모습', JSON.stringify(look(await node('b3-1'))) === JSON.stringify(SRC) && JSON.stringify(look(await node('b3-2'))) === JSON.stringify(SRC));
ok('④ 러버밴드 칠하기 = undo 한 단계', (await past()) - pastBefore === 1);
ok('④ 붓 모드는 아직 켜져 있다', p.on);
await page.mouse.move(c2.x + c2.width + 60, c2.y + c2.height / 2); await page.waitForTimeout(150);
await shot('style-copy-after', [await nodeBox(page, 'b1'), await nodeBox(page, 'b2'), c1, c2, await chip.boundingBox()], 50);

// ⑤ 중심주제에 칠해도 색 계열(root)은 그대로
await clickNode('root');
const r = await node('root');
ok('⑤ 중심주제: 도형은 바뀌고 colorKey 는 root 그대로', r.style?.shapeType === 'hexagon' && r.colorKey === 'root');

// ⑥ ESC → 붓만 내려놓는다 (선택 유지)
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
p = await painter();
ok('⑥ ESC → 붓 모드 해제 · 선택은 그대로(root)', !p.on && p.sel === 'root');
await page.mouse.move(b2.x + 10, b2.y + 10); await page.waitForTimeout(100);
ok('⑥ 붓 아이콘이 사라졌다', (await chip.count()) === 0);
ok('⑥ 붓 버튼이 꺼진 색', (await btn.evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgba(0, 0, 0, 0)');

// ⑦ 빈 캔버스 클릭 → 해제
await clickNode('b1'); await btn.click(); await page.waitForTimeout(100);
ok('⑦ 다시 켜짐', (await painter()).on);
await page.mouse.click(60, size.height - 60); await page.waitForTimeout(150);
p = await painter();
ok('⑦ 빈 캔버스 클릭 → 해제 + 선택 해제', !p.on && p.sel === null && (await chip.count()) === 0);

// ⑧ 붓 버튼 재클릭 → 해제, 되돌리기는 단계별
await clickNode('b1'); await btn.click(); await page.waitForTimeout(100);
await btn.click(); await page.waitForTimeout(100);
ok('⑧ 붓 버튼 재클릭 → 해제', !(await painter()).on);
await page.keyboard.press('Control+z'); await page.waitForTimeout(100); // root
await page.keyboard.press('Control+z'); await page.waitForTimeout(100); // 러버밴드 둘
ok('⑧ Ctrl+Z 두 번 → 러버밴드로 칠한 둘이 함께 돌아온다 (b2 는 아직)',
  (await node('b3-1')).style === undefined && (await node('b3-2')).style === undefined && (await node('b2')).style?.shapeType === 'hexagon');
await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
ok('⑧ 한 번 더 → b2 도 원래대로', (await node('b2')).style === undefined && (await node('b2')).textAlign === undefined);

await browser.close();
