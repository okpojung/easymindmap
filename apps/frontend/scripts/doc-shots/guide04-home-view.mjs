// 가이드 04 — 첫 화면(원위치)이 레이아웃에 맞는가 (2026-09-29 사용자 지적: "맵의 위부분에 왜
// 공간이 많이 생기나"). 문서를 새로 열면(loadMap resetHistory → viewport reset) 트리·진행트리는
// 중심 주제가 화면 위쪽(72px)에, 방사형은 가운데에 온다. 같은 문서 안의 레이아웃 변경·되돌리기는
// 화면을 건드리지 않는다. 스크린샷 없음.
//   node scripts/doc-shots/guide04-home-view.mjs
import { boot } from './lib.mjs';
const { browser, page } = await boot();
await page.waitForSelector('[data-node-id="root"]', { timeout: 30000 });
const ok = (name, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) process.exitCode = 1; };
const openAs = (layout, levels, folders, docs, heads) => page.evaluate(async ({ layout, levels, folders, docs, heads }) => {
  const d = await import('/src/stores/documentStore.ts'); const ui = await import('/src/stores/editorUiStore.ts'); const ll = await import('/src/utils/levelLayouts.ts');
  let seq = 0; const id = () => `n${++seq}`;
  const branches = Array.from({ length: folders }, (_, i) => ({ id: id(), text: `folder-${i}`, children: Array.from({ length: docs }, (_, j) => ({ id: id(), text: `doc-${i}-${j}`, children: Array.from({ length: heads }, (_, k) => ({ id: id(), text: `heading ${k}` })) })) }));
  const map = { title: 'T', root: { id: 'root', text: 'easymindmap docs — GitHub 연동' }, branches: levels ? ll.applyLevelLayouts(branches, levels) : branches, settings: levels ? { levelLayouts: levels } : undefined };
  // 열기 흐름과 같은 순서: loadMap(resetHistory → viewport reset) 뒤에 setLayoutType
  d.useDocumentStore.getState().loadMap(map, { resetHistory: true });
  ui.useEditorUiStore.getState().setLayoutType(layout);
}, { layout, levels, folders, docs, heads });
const measure = () => page.evaluate(async () => {
  const vp = (await import('/src/stores/viewportStore.ts')).useViewportStore.getState();
  const svg = Array.from(document.querySelectorAll('svg')).sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
  const sr = svg.getBoundingClientRect();
  const rr = document.querySelector('[data-node-id="root"]:not([data-testid="collapse-toggle"]) rect').getBoundingClientRect();
  return { zoom: vp.zoom, panX: vp.panX, panY: vp.panY, canvasH: Math.round(sr.height), rootTop: Math.round(rr.top - sr.top), rootLeft: Math.round(rr.left - sr.left), rootCenterY: Math.round(rr.top + rr.height / 2 - sr.top) };
});
const near = (a, b, tol = 3) => Math.abs(a - b) <= tol;

// ① 문서 가져오기(트리·오른쪽 + 레벨별 진행트리, 4882 노드)로 열면 중심 주제가 위쪽 72px 에
await openAs('tree-right', [null, 'process-tree-right', 'tree-right', 'process-tree-right'], 40, 10, 5); await page.waitForTimeout(700);
let m = await measure();
ok(`① 트리·오른쪽(레벨별 진행트리) 열기 — 중심 주제 위 변이 화면 위 72px (${m.rootTop}), 100%`, near(m.rootTop, 72) && m.zoom === 100 && m.panX === 0);
// ② 진행트리
await openAs('process-tree-right', null, 40, 10, 5); await page.waitForTimeout(700);
m = await measure();
ok(`② 진행트리·오른쪽 열기 — 위 72px (${m.rootTop})`, near(m.rootTop, 72));
// ③ 트리·아래
await openAs('tree-down', null, 10, 5, 3); await page.waitForTimeout(700);
m = await measure();
ok(`③ 트리·아래 열기 — 위 72px (${m.rootTop})`, near(m.rootTop, 72));
// ④ 방사형은 예전처럼 가운데
await openAs('radial-bidirectional', null, 10, 5, 3); await page.waitForTimeout(700);
m = await measure();
ok(`④ 방사형 열기 — 중심 주제가 세로 가운데 (${m.rootCenterY} ≈ ${Math.round(m.canvasH / 2)}), pan 0`, near(m.rootCenterY, m.canvasH / 2, 4) && m.panY === 0);
// ⑤ 같은 문서 안에서 레이아웃만 바꾸면 화면은 그대로 (되돌리기 경계가 아니다)
await page.evaluate(async () => { const vp = await import('/src/stores/viewportStore.ts'); vp.useViewportStore.getState().setPan(-300, -200); const ui = await import('/src/stores/editorUiStore.ts'); ui.useEditorUiStore.getState().setLayoutType('tree-right'); });
await page.waitForTimeout(500);
m = await measure();
ok('⑤ 같은 문서에서 레이아웃만 바꾸면 이동 상태 그대로 (원위치로 튀지 않는다)', m.panX === -300 && m.panY === -200);
// ⑥ 다시 열면(새 문서) 원위치 규칙이 다시 든다
await openAs('tree-right', null, 5, 3, 2); await page.waitForTimeout(700);
m = await measure();
ok(`⑥ 다시 열면 다시 위 72px (${m.rootTop}, pan ${m.panX},${m.panY}, zoom ${m.zoom})`, near(m.rootTop, 72) && m.panX === 0);
await browser.close();
console.log(process.exitCode ? '\n실패 있음' : '\n전부 통과');
