// resolveDeclaration 단위 테스트.
//
// 이 파일이 지키는 것은 두 가지다.
//   ① **template 과 levels 는 둘 중 하나다** — 섞이지 않는다
//   ② 상속은 **속성마다 따로** 흐른다
//
// 둘 다 실제로 틀렸던 적이 있어서 여기 있다. 처음에는 template 이 채워 둔
// 깊은 레벨을 얕은 레벨 선언 하나가 함께 덮어썼고, 다음에는 3레벨의 도형만
// 비고 4레벨부터 다시 채워졌다. 읽어서가 아니라 **돌려봐서** 나온 것들이다.
//
//   npx tsx src/utils/emmDeclaration.test.ts

import { resolveDeclaration } from './emmDeclaration';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// ── ① template — levels 가 없을 때만 ─────────────────────────────────
{
  const r = resolveDeclaration({ template: 'progtree-tree' });
  check('① 패턴 — 1레벨은 맵 전체 레이아웃', r.editor?.layoutType, 'process-tree-right');
  // 색인은 branches 기준 depth — [1] 이 "2레벨"이다 (utils/levelLayouts)
  check('① 패턴 — 2레벨부터 levelLayouts', r.settings?.levelLayouts, [
    null, 'tree-right', 'tree-right', 'tree-right', 'tree-right',
  ]);
}
{
  const r = resolveDeclaration({ template: 'kanban' });
  check('① 레이아웃 이름 그대로 — 맵 전체 하나', r.editor?.layoutType, 'kanban');
  check('① 레벨별 정책은 건드리지 않는다', r.settings, undefined);
}
{
  check('① 모르는 이름은 조용히 무시한다', resolveDeclaration({ template: '없는이름' }), {});
}
{
  check('① 빈 선언은 빈 결과', resolveDeclaration({}), {});
}

// ── ② levels 가 있으면 template 은 읽지 않는다 ───────────────────────
{
  const r = resolveDeclaration({
    template: 'progtree-tree',
    levels: { 2: { layout: 'kanban' } },
  });
  check('② template 의 1레벨 레이아웃이 새어 나오지 않는다', r.editor, undefined);
  check('② levels 만 반영된다', r.settings?.levelLayouts, [
    null, 'kanban', 'kanban', 'kanban', 'kanban',
  ]);
}

// ── ③ 상속은 속성마다 따로 흐른다 ────────────────────────────────────
{
  // 2레벨은 도형만, 3레벨은 레이아웃만 정했다. 3레벨의 도형은 2레벨 것을
  // 물려받아야 한다 — 3레벨만 비고 4레벨부터 채워지면 설명할 수 없다.
  const r = resolveDeclaration({
    levels: { 2: { shape: 'rounded' }, 3: { layout: 'kanban' } },
  });
  check('③ 도형은 2레벨에서 흘러 3레벨을 지나 끝까지', r.settings?.levelShapes, [
    null, 'rounded', 'rounded', 'rounded', 'rounded',
  ]);
  check('③ 레이아웃은 3레벨부터', r.settings?.levelLayouts, [
    null, null, 'kanban', 'kanban', 'kanban',
  ]);
  // ★ 두 배열의 같은 칸이 같은 레벨을 뜻한다 — [1]=2레벨, [2]=3레벨.
  //   levelLayouts 만 레벨 번호로 색인해 한 칸 밀려 있던 것을 맞췄다.
  check('③ 도형과 레이아웃의 색인 기준이 같다',
    [r.settings?.levelShapes?.[2], r.settings?.levelLayouts?.[2]],
    ['rounded', 'kanban']);
}
{
  // 1레벨 레이아웃은 맵 전체 몫이다 (levelLayouts[0] 은 쓰이지 않는다)
  const r = resolveDeclaration({ levels: { 1: { layout: 'tree-right', font: '18' } } });
  check('③ 1레벨 레이아웃은 editor 로 간다', r.editor?.layoutType, 'tree-right');
  check('③ 폰트는 levelFonts 색인 1', r.settings?.levelFonts?.[1], { size: 18 });
}
{
  const r = resolveDeclaration({ levels: { 2: { shape: '없는도형', layout: '없는레이아웃' } } });
  check('③ 모르는 값은 버린다', r, {});
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
