// 가이드 04 — 러버밴드 다중 선택 + 레이아웃 탭: 고른 노드 전부의 하위에 적용 · 접힘 숫자 배지 유지 (2026-09-21).
//   node scripts/doc-shots/guide04-layout-multi.mjs <출력폴더>
import { boot, forceFont, stores, nodeBox, shotUnion } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });
const layoutOf = (ids) => page.evaluate(async ({ ids }) => {
  const d = await import('/src/stores/documentStore.ts');
  const m = d.useDocumentStore.getState().map;
  return Object.fromEntries(ids.map((id) => [id, id === 'root' ? m.root.layoutType : d.findNodeInMap(m, id)?.layoutType ?? null]));
}, { ids });
const past = () => page.evaluate(async () => (await import('/src/stores/documentStore.ts')).useDocumentStore.getState().past.length);
const layoutBtn = (label) => page.locator('button', { hasText: label }).first();
const hint = () => page.locator('text=/노드 선택 — 각 노드의 하위/').first();

await ui({ activeSection: 'inspector', inspectorTab: 'layout', sidebarCollapsed: false });

// ① 세 노드를 러버밴드로 고른 뒤(대표 b1) 트리·오른쪽 → 셋 다 바뀐다 (2026-09-21 보고: 첫 노드만 바뀌었다)
await stores.multi(page, ['b1', 'b2', 'b3']); await page.evaluate(async () => { const m = await import('/src/stores/interactionStore.ts'); m.useInteractionStore.getState().setSelectedId('b1'); });
await page.waitForTimeout(300);
ok('① 레이아웃 탭 안내: "3개 노드 선택 — 각 노드의 하위…"', (await hint().count()) === 1 && (await hint().innerText()).startsWith('3개 노드 선택'));
const before = await layoutOf(['b1', 'b2', 'b3', 'b4', 'root']);
const p0 = await past();
await shotUnion(page, size, `${OUT}/04-layout-multi.png`, [await layoutBtn('트리 · 오른쪽').boundingBox(), await hint().boundingBox(), await nodeBox(page, 'b1'), await nodeBox(page, 'b3')], 30);
await layoutBtn('트리 · 오른쪽').click(); await page.waitForTimeout(300);
const after = await layoutOf(['b1', 'b2', 'b3', 'b4', 'root']);
ok('① b1·b2·b3 전부 tree-right', after.b1 === 'tree-right' && after.b2 === 'tree-right' && after.b3 === 'tree-right');
ok('① 고르지 않은 b4·맵(root) 은 그대로', after.b4 === before.b4 && after.root === before.root);
ok('① undo 한 단계', (await past()) - p0 === 1);
await page.evaluate(async () => (await import('/src/stores/documentStore.ts')).useDocumentStore.getState().undo()); await page.waitForTimeout(200);
const undone = await layoutOf(['b1', 'b2', 'b3']);
ok('① Ctrl+Z 한 번에 셋 다 원래대로', undone.b1 === before.b1 && undone.b2 === before.b2 && undone.b3 === before.b3);

// ② 단일 선택은 예전처럼 그 노드만
await stores.select(page, 'b2'); await page.waitForTimeout(200);
ok('② 단일 선택 안내: "선택한 노드(b2) 하위"', (await page.locator('text=/선택한 노드\\(b2\\) 하위/').count()) === 1);
await layoutBtn('계층형 · 오른쪽').click(); await page.waitForTimeout(300);
const single = await layoutOf(['b1', 'b2', 'b3']);
ok('② b2 만 hierarchy-right', single.b2 === 'hierarchy-right' && single.b1 === before.b1 && single.b3 === before.b3);
await page.evaluate(async () => (await import('/src/stores/documentStore.ts')).useDocumentStore.getState().undo()); await page.waitForTimeout(200);

// ③ 접힌 노드 여럿을 고르면 대표(첫) 노드의 접힘 숫자 배지도 남는다 (2026-09-21 보고)
await page.evaluate(async () => { const d = await import('/src/stores/documentStore.ts'); for (const id of ['b1', 'b2', 'b3']) d.useDocumentStore.getState().toggleCollapse(id); });
await page.waitForTimeout(300);
const chip = (id) => page.locator(`[data-testid="collapse-toggle"][data-node-id="${id}"]`);
await stores.select(page, 'b1'); await page.waitForTimeout(200);
ok('③ 전제: 단일 선택이면 선택 노드의 배지는 숨는다 (+/− 인디케이터 자리)', (await chip('b1').count()) === 0 && (await chip('b2').count()) === 1);
await stores.multi(page, ['b1', 'b2', 'b3']); await page.evaluate(async () => { const m = await import('/src/stores/interactionStore.ts'); m.useInteractionStore.getState().setSelectedId('b1'); });
await page.waitForTimeout(300);
ok('③ 다중 선택이면 b1 배지도 남는다 (b1·b2·b3 모두)', (await chip('b1').count()) === 1 && (await chip('b2').count()) === 1 && (await chip('b3').count()) === 1);
const b1chip = (await chip('b1').evaluate((el) => el.textContent ?? '')).trim();
ok(`③ b1 배지에 숨은 노드 수가 보인다 (${b1chip})`, /\d/.test(b1chip));
ok('③ 다중 선택 중엔 +/− 인디케이터가 없다 (겹칠 것이 없다)', (await page.locator('[title^="자식"], [title^="형제"]').count()) === 0);
await shotUnion(page, size, `${OUT}/04-layout-multi-collapsed.png`, [await nodeBox(page, 'b1'), await nodeBox(page, 'b3')], 60);

await browser.close();
