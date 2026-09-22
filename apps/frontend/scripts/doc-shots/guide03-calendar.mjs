// 가이드 03 — 우상단 [+]: 선택 없음 → 중심 노드 · 선택 있음 → 메뉴(자식 노드 / 달력 노드) (2026-09-22).
//   node scripts/doc-shots/guide03-calendar.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const doc = (fn, arg) => page.evaluate(async ({ src, arg }) => {
  const d = await import('/src/stores/documentStore.ts'); const m = await import('/src/stores/interactionStore.ts');
  return new Function('d', 'm', 'arg', `return (${src})(d, m, arg)`)(d, m, arg);
}, { src: fn.toString(), arg });
const childrenOf = (id) => doc((d, m, id) => (d.findNodeInMap(d.useDocumentStore.getState().map, id)?.children ?? []).map((c) => ({ id: c.id, text: c.text, kids: (c.children ?? []).map((k) => k.text), kidIds: (c.children ?? []).map((k) => k.id) })), id);
const centers = () => doc((d) => (d.useDocumentStore.getState().map.centers ?? []).map((c) => c.root.id));
const selected = () => doc((d, m) => m.useInteractionStore.getState().selectedId);
const addBtn = page.locator('[data-testid="add-node"]');
const menu = page.locator('[data-testid="add-menu"]');
const dlg = page.locator('[data-testid="calendar-dialog"]');
const yearIn = page.locator('[data-testid="calendar-year"]');
const monthSel = page.locator('[data-testid="calendar-month"]');
const preview = () => page.locator('[data-testid="calendar-preview"]').innerText();
const shot = (name, rects, pad) => shotUnion(page, size, `${OUT}/${name}.png`, rects, pad);

// ① 선택 없음 → [+] = 중심 노드 추가 (메뉴 없음)
await stores.select(page, null); await page.waitForTimeout(200);
const c0 = await centers();
ok('① 선택 없음: 버튼 안내가 "중심 노드 추가"', (await addBtn.getAttribute('title')).startsWith('중심 노드 추가'));
await addBtn.click(); await page.waitForTimeout(300);
const c1 = await centers();
ok('① [+] → 중심 노드가 하나 늘고 그것이 선택된다', c1.length === c0.length + 1 && (await selected()) === c1[c1.length - 1]);
ok('① 메뉴는 뜨지 않는다', (await menu.count()) === 0);
await doc((d, m, id) => { d.useDocumentStore.getState().deleteCenter?.(id); }, c1[c1.length - 1]);

// ② 노드 "2026년" 선택 → [+] → 메뉴 → 달력 노드 → 년도 미리 채움 · 월 전체 → 1월~12월
await doc((d, m) => d.useDocumentStore.getState().updateNodeText('b1-1', '2026년'));
const b11Before = (await childrenOf('b1-1')).length; // 샘플에 이미 자식이 있다 — 뒤에 붙는다
await stores.select(page, 'b1-1'); await stores.center(page, 'b1-1'); await page.waitForTimeout(300);
await addBtn.click(); await page.waitForTimeout(200);
ok('② 선택 있음: [+] → 메뉴(자식 노드 / 달력 노드)', await menu.isVisible() && (await menu.innerText()).includes('자식 노드 추가') && (await menu.innerText()).includes('달력 노드 추가'));
await shot('03-add-menu', [await addBtn.boundingBox(), await menu.boundingBox()], 24);
await page.locator('[data-testid="add-menu-calendar"]').click();
await page.waitForSelector('[data-testid="calendar-dialog"]', { timeout: 3000 });
ok('② 대화상자: 년도 2026 미리 채움 · 월 전체', (await yearIn.inputValue()) === '2026' && (await monthSel.inputValue()) === 'all');
ok('② 미리보기 "2026년 → 1월 … 12월 (12개)"', (await preview()).includes('1월 … 12월 (12개)'));
await shot('03-calendar-dialog', [await dlg.boundingBox()], 20);
await page.locator('[data-testid="calendar-dialog-save"]').click(); await page.waitForTimeout(300);
let kids = await childrenOf('b1-1');
const months = kids.slice(b11Before).map((k) => k.text);
ok('② 확인 → 기존 자식 뒤에 1월~12월 12개', kids.length === b11Before + 12 && months.join(',') === Array.from({ length: 12 }, (_, i) => `${i + 1}월`).join(','));

// ③ "9월" 자식 선택 → 조상 "2026년"에서 년도를 읽어 2026/9 미리 채움 → 36주~40주 + 일~토 범위
const sep = kids.find((k) => k.text === '9월');
await stores.select(page, sep.id); await stores.center(page, sep.id); await page.waitForTimeout(300);
await addBtn.click(); await page.waitForTimeout(150);
await page.locator('[data-testid="add-menu-calendar"]').click();
await page.waitForSelector('[data-testid="calendar-dialog"]', { timeout: 3000 });
ok('③ "9월" 노드: 년도는 조상(2026년)에서, 월은 9', (await yearIn.inputValue()) === '2026' && (await monthSel.inputValue()) === '9');
ok('③ 미리보기 "36주 … 40주 (5주 …)"', (await preview()).includes('36주 … 40주 (5주'));
await page.keyboard.press('Control+Enter'); await page.waitForTimeout(300);
kids = await childrenOf(sep.id);
ok('③ Ctrl+Enter → 36주~40주 5개', kids.map((k) => k.text).join(',') === '36주,37주,38주,39주,40주');
ok('③ 36주 아래 "26/08/30(일) ~ 26/09/05(토)"', kids[0].kids[0] === '26/08/30(일) ~ 26/09/05(토)');
ok('③ 40주 아래 "26/09/27(일) ~ 26/10/03(토)"', kids[4].kids[0] === '26/09/27(일) ~ 26/10/03(토)');
await doc((d) => d.useDocumentStore.getState().undo()); await page.waitForTimeout(200);
ok('③ undo 한 단계로 5개가 함께 사라진다', (await childrenOf(sep.id)).length === 0);
await doc((d) => d.useDocumentStore.getState().redo()); await page.waitForTimeout(200);
await stores.select(page, kids[0].id); await stores.center(page, kids[0].id, 100); await page.waitForTimeout(400);
await shot('03-calendar-weeks', [await nodeBox(page, sep.id), await nodeBox(page, kids[0].id), await nodeBox(page, kids[4].id), await nodeBox(page, kids[0].kidIds[0]), await nodeBox(page, kids[4].kidIds[0])], 40);

// ④ 년도 정보가 없는 노드 → 올해가 기본, Esc 로 닫으면 아무것도 안 넣는다
await stores.select(page, 'b2-1'); await page.waitForTimeout(200);
const before = (await childrenOf('b2-1')).length;
await addBtn.click(); await page.waitForTimeout(150);
await page.locator('[data-testid="add-menu-calendar"]').click();
await page.waitForSelector('[data-testid="calendar-dialog"]', { timeout: 3000 });
ok(`④ 정보 없는 노드: 년도 기본 = 올해(${new Date().getFullYear()})`, (await yearIn.inputValue()) === String(new Date().getFullYear()) && (await monthSel.inputValue()) === 'all');
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('④ Esc → 닫히고 자식은 그대로', (await dlg.count()) === 0 && (await childrenOf('b2-1')).length === before);

// ⑤ 메뉴의 "자식 노드 추가" 는 예전 그대로 — 하나 추가 + 선택
await addBtn.click(); await page.waitForTimeout(150);
await page.locator('[data-testid="add-menu-child"]').click(); await page.waitForTimeout(200);
const after = await childrenOf('b2-1');
ok('⑤ 자식 노드 하나 추가되고 선택됨', after.length === before + 1 && (await selected()) === after[after.length - 1].id);
ok('⑤ 메뉴는 닫힘', (await menu.count()) === 0);
// ⑥ 메뉴 밖 클릭 → 닫힘
await addBtn.click(); await page.waitForTimeout(150);
await page.mouse.click(size.width / 2, size.height - 80); await page.waitForTimeout(150);
ok('⑥ 빈 곳 클릭 → 메뉴 닫힘', (await menu.count()) === 0);

await browser.close();
