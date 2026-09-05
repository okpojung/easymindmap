// 템플릿 → 맵 설정 단위 테스트 (2026-09-05, MCP create_map `template`).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 이 파일은 프런트 `emmDeclaration.ts`·`levelLayouts.ts` 의
// **이식**이다. 같은 입력에 같은 결과가 나와야 "앱에서 불러오면 진행트리,
// MCP 로 만들면 방사형" 이 생기지 않는다. 프런트 단위 테스트
// (`emmDeclaration.test.ts`)의 기대값을 그대로 옮겨 왔다.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.7

import { emmToSnapshot } from '../dist/mcp/emm-to-doc.js';
import {
  TemplateError, applyLevelLayouts, resolveDeclaration, resolveTemplateName, templateFor,
} from '../dist/mcp/map-template.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
function throws(name, fn, wantMsgPart) {
  let msg = null;
  try { fn(); } catch (e) { msg = e instanceof TemplateError ? e.message : `다른 오류: ${e}`; }
  const ok = msg !== null && msg.includes(wantMsgPart);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${msg}`}`);
}

// ── ① 이름 → 선언 어휘 ──────────────────────────────────────────────
check('앱 라이브러리 이름', resolveTemplateName('진행트리-트리맵'), 'progtree-tree');
check('기본 템플릿 이름', resolveTemplateName('트리-진행트리맵'), 'tree-progtree');
check('선언 어휘 그대로', resolveTemplateName('progtree-tree'), 'progtree-tree');
check('레이아웃 이름 그대로', resolveTemplateName('hierarchy-right'), 'hierarchy-right');
check('흔한 말', resolveTemplateName('칸반'), 'kanban');
check('대소문자 무시', resolveTemplateName('Kanban'), 'kanban');
throws('모르는 이름 → 쓸 수 있는 이름 나열', () => resolveTemplateName('없는템플릿'), '진행트리-트리맵');

// ── ② resolveDeclaration — 프런트 테스트와 같은 기대값 ───────────────
{
  const r = resolveDeclaration({ template: 'progtree-tree' });
  check('progtree-tree: 1레벨은 맵 레이아웃', r.editor, { layoutType: 'process-tree-right' });
  check('progtree-tree: 2레벨부터 트리, 상속으로 끝까지', r.settings.levelLayouts,
    [null, 'tree-right', 'tree-right', 'tree-right', 'tree-right']);
  const t = resolveDeclaration({ template: 'tree-progtree' });
  check('tree-progtree: 맵은 트리', t.editor, { layoutType: 'tree-right' });
  check('tree-progtree: 2진행·3트리·4진행·5+진행', t.settings.levelLayouts,
    [null, 'process-tree-right', 'tree-right', 'process-tree-right', 'process-tree-right']);
  const k = resolveDeclaration({ template: 'kanban' });
  check('레이아웃 이름 하나 → 맵 전체', k, { editor: { layoutType: 'kanban' } });
  check('모르는 이름은 조용히 무시', resolveDeclaration({ template: '없는이름' }), {});
  check('빈 선언은 빈 결과', resolveDeclaration({}), {});
}
{
  // levels — 있으면 template 은 무시, 속성마다 따로 상속
  const r = resolveDeclaration({ template: 'progtree-tree', levels: { 1: { layout: 'tree-right' }, 2: { shape: 'rounded', font: '15' }, 3: { layout: 'hierarchy-right' } } });
  check('levels 가 있으면 template 무시 — 1레벨', r.editor, { layoutType: 'tree-right' });
  // 1레벨 값은 맵 레이아웃이라 2레벨 칸으로 흐르지 않는다(프런트 테스트 ③ 과 같다)
  check('layout 은 3레벨부터 상속', r.settings.levelLayouts, [null, null, 'hierarchy-right', 'hierarchy-right', 'hierarchy-right']);
  check('shape 는 2레벨부터 상속', r.settings.levelShapes, [null, 'rounded', 'rounded', 'rounded', 'rounded']);
  check('font 는 levelFonts[2] 부터', r.settings.levelFonts.map((f) => f.size ?? null), [null, null, 15, 15, 15]);
  const s = resolveDeclaration({ levels: { 2: { layout: 'kanban' } } });
  check('2레벨에 못 쓰는 레이아웃은 건너뛰고 알린다', s.skipped, ["2레벨의 'kanban'"]);
}

// ── ③ 노드에 박기 — 선언한 레벨만, 마지막 칸은 그 이상 전부 ─────────
{
  const snap = emmToSnapshot('# T\n## a\n### a1\n#### a11\n##### a111\n###### a1111\n## b\n', 'x');
  const out = applyLevelLayouts(snap.map.branches, [null, 'process-tree-right', 'tree-right', 'process-tree-right', 'process-tree-right']);
  const a = out[0];
  check('2레벨(branches) → 진행트리 + tree-line', [a.layoutType, a.edgeType], ['process-tree-right', 'tree-line']);
  check('3레벨 → 트리', a.children[0].layoutType, 'tree-right');
  check('4레벨 → 진행트리', a.children[0].children[0].layoutType, 'process-tree-right');
  check('5레벨+ → 마지막 칸', a.children[0].children[0].children[0].children[0].layoutType, 'process-tree-right');
  check('원본은 그대로', snap.map.branches[0].layoutType, undefined);
  const none = applyLevelLayouts(snap.map.branches, [null, null, 'tree-right']);
  check('말하지 않은 레벨은 건드리지 않는다', none[0].layoutType, undefined);
  check('말한 레벨만', none[0].children[0].layoutType, 'tree-right');
}

// ── ④ templateFor — 인자 우선, 없으면 문서의 ```emm 선언 ──────────────
{
  const md = '# 제목\n\n```emm\ntemplate: tree-progtree\n```\n\n## a\n';
  check('선언만 있으면 선언', templateFor(undefined, md).editor, { layoutType: 'tree-right' });
  check('인자가 있으면 인자', templateFor('진행트리-트리맵', md).editor, { layoutType: 'process-tree-right' });
  check('둘 다 없으면 빈 결과', templateFor(undefined, '# 제목\n## a\n'), {});
  throws('인자가 모르는 이름이면 거절', () => templateFor('이상한것', md), '템플릿을 모릅니다');
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
