// 가이드 05 — 노드 노트: 문단·코드·표도 여러 개 + 배지에 개수 (2026-09-22 사용자 요청).
//   node scripts/doc-shots/guide05-note-multi.mjs <출력폴더>
import { writeFileSync } from 'node:fs';
import { boot, forceFont, stores, nodeBox, shotUnion, openSample } from './lib.mjs';
const OUT = process.argv[2] ?? '/tmp/doc-shots';
const { browser, page, size } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
await forceFont(page);
await openSample(page);
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const ui = (patch) => page.evaluate(async ({ patch }) => { const m = await import('/src/stores/editorUiStore.ts'); m.useEditorUiStore.setState(patch); }, { patch });
const doc = (fn, arg) => page.evaluate(async ({ src, arg }) => {
  const d = await import('/src/stores/documentStore.ts');
  return new Function('d', 'arg', `return (${src})(d, arg)`)(d, arg);
}, { src: fn.toString(), arg });
const noteBlocks = (id) => doc((d, id) => (d.findNodeInMap(d.useDocumentStore.getState().map, id)?.notes ?? []).map((b) => ({ type: b.type, text: b.text })), id);
const N = 'b2-1';
const btn = (type) => page.locator(`[data-testid="note-add-${type}"]`);
const cnt = (arr, type) => arr.filter((b) => b.type === type).length;

await ui({ activeSection: 'inspector', inspectorTab: 'note', sidebarCollapsed: false });
await stores.select(page, N); await page.waitForTimeout(400);
ok('⓪ 시작: 노트 없음', (await noteBlocks(N)).length === 0);

// ① +문단 두 번 → 2개 (예전엔 두 번째부터 비활성)
await btn('paragraph').click(); await page.waitForTimeout(150);
ok('① 문단 하나 넣은 뒤에도 +문단 은 활성', !(await btn('paragraph').isDisabled()));
await btn('paragraph').click(); await page.waitForTimeout(150);
ok('① +문단 두 번 → 문단 블록 2개', cnt(await noteBlocks(N), 'paragraph') === 2);
ok('① 버튼 안내에 "(지금 2개)"', (await btn('paragraph').getAttribute('title')).includes('지금 2개'));
// ② +코드 두 번
await btn('code_block').click(); await page.waitForTimeout(150); await btn('code_block').click(); await page.waitForTimeout(150);
ok('② +코드 두 번 → 코드 블록 2개', cnt(await noteBlocks(N), 'code_block') === 2);
// ③ 표 2개 (격자 → 팝업 흐름은 guide05-note-table 에서 검증하므로 스토어로) + 글 채우기
await doc((d, id) => {
  const st = d.useDocumentStore.getState();
  st.addNoteBlock(id, 'table', 'a | b\n1 | 2'); st.addNoteBlock(id, 'table', 'x | y\n7 | 8');
  const n = d.findNodeInMap(d.useDocumentStore.getState().map, id);
  let p = 0, c = 0;
  for (const b of n.notes) {
    if (b.type === 'paragraph') st.updateNoteBlock(id, b.id, { text: ++p === 1 ? '문단 하나' : '문단 둘' });
    if (b.type === 'code_block') st.updateNoteBlock(id, b.id, { text: ++c === 1 ? 'echo 1' : 'echo 2', lang: 'sh' });
  }
}, N);
await page.waitForTimeout(300);
const nb = await noteBlocks(N);
ok('③ 문단 2 · 코드 2 · 표 2 (총 6)', cnt(nb, 'paragraph') === 2 && cnt(nb, 'code_block') === 2 && cnt(nb, 'table') === 2 && nb.length === 6);
ok('③ +표 도 활성 (2개 있어도)', !(await btn('table').isDisabled()));

// ④ 캔버스 배지 — 종류마다 오른쪽 위 개수 2
const badge = (kind) => page.evaluate(({ id, kind }) => {
  const g = document.querySelector(`[data-node-id="${id}"] [data-node-ind="${kind}"]`);
  if (!g) return null;
  const ts = g.querySelectorAll('text');
  return ts.length ? ts[ts.length - 1].textContent : '';
}, { id: N, kind });
ok('④ 캔버스 배지: 문단 2 · 코드 2 · 표 2', (await badge('note-paragraph')) === '2' && (await badge('note-code')) === '2' && (await badge('note-table')) === '2');
await stores.center(page, N, 100); await page.waitForTimeout(400);
await shotUnion(page, size, `${OUT}/05-note-multi-badges.png`, [await nodeBox(page, N)], 30);

// ⑤ 배지 클릭 → 그 종류의 노트 모두가 한 팝업에
await page.locator(`[data-node-id="${N}"] [data-node-ind="note-paragraph"]`).click(); await page.waitForTimeout(400);
const popTitle = page.getByText('문단 노트 2개');
ok('⑤ 문단 배지 클릭 → "문단 노트 2개" 팝업', (await popTitle.count()) >= 1);
const bodyTxt = await page.evaluate(() => document.body.innerText);
ok('⑤ 팝업에 문단 두 개 다 보인다', bodyTxt.includes('문단 하나') && bodyTxt.includes('문단 둘'));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);
await page.locator(`[data-node-id="${N}"] [data-node-ind="note-code"]`).click(); await page.waitForTimeout(400);
const bodyTxt2 = (await page.evaluate(() => document.body.innerText)).replace(/\u00A0/g, ' '); // 코드 칸은 NBSP
ok('⑤ 코드 배지 → "코드 노트 2개" · echo 1·2', (await page.getByText('코드 노트 2개').count()) >= 1 && bodyTxt2.includes('echo 1') && bodyTxt2.includes('echo 2'));
await page.keyboard.press('Escape'); await page.waitForTimeout(200);

// ⑥ 아웃라인 배지에도 개수
await ui({ mainView: 'outline' }); await page.waitForTimeout(600);
const olCount = page.locator('[data-outline-ind-count="note-paragraph"]');
ok('⑥ 아웃라인: 문단 배지 개수 2 · 표 배지 개수 2', (await olCount.count()) >= 1 && (await olCount.first().innerText()) === '2' && (await page.locator('[data-outline-ind-count="note-table"]').first().innerText()) === '2');
await ui({ mainView: 'map' }); await page.waitForTimeout(400);

// ⑦ HTML 내보내기 뷰어 마커에도 개수
{
  const html = await page.evaluate(async () => {
    const d = await import('/src/stores/documentStore.ts'); const ui2 = await import('/src/stores/editorUiStore.ts');
    const { buildStandaloneHtml } = await import('/src/export/exportHtml.ts');
    return buildStandaloneHtml(d.useDocumentStore.getState().map, ui2.useEditorUiStore.getState().layoutType);
  });
  const file = `${OUT}/viewer-notes.html`; writeFileSync(file, html);
  const vctx = await browser.newContext({ viewport: { width: 1400, height: 860 } });
  const v = await vctx.newPage();
  await v.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
  await v.goto('file://' + file); await v.waitForTimeout(1200);
  const mk = (kind) => v.locator(`[data-marker-count="${kind}"]`);
  ok('⑦ 뷰어 마커 개수: 문단 2 · 코드 2 · 표 2', (await mk('note-paragraph').first().textContent()) === '2' && (await mk('note-code').first().textContent()) === '2' && (await mk('note-table').first().textContent()) === '2');
  await vctx.close();
}

// ⑧ undo 로 하나씩 되돌아간다 (블록 추가는 각각 한 단계)
await doc((d) => d.useDocumentStore.getState().undo()); await page.waitForTimeout(200);
ok('⑧ undo 한 번 → 마지막 글 채움이 되돌아간다 (블록 수 6 그대로)', (await noteBlocks(N)).length === 6);
await browser.close();
