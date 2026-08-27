// readDeclaration 단위 테스트 — 문서의 `emm` 코드블록.
//
// conformance/ 는 **EMM 파싱 코퍼스**다 — 여기 끼워 넣지 않는다.
// 이 테스트가 지키는 것:
//   ① `emm` 코드블록에서 선언을 읽는다
//   ② 우리 것이 아닌 펜스는 건드리지 않는다
//   ③ 본문에서 블록을 **걷어내지 않는다** — 그 노드의 코드 노트가 되어야 한다

import { readDeclaration } from '../src/declaration';
import { parseEmm } from '../src/parse';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const md = (...lines: string[]) => lines.join('\n');
const F = '```';

// ── ① 선언 읽기 ───────────────────────────────────────────────────────
{
  const r = readDeclaration(md('# 제목', '', F + 'emm', 'template: tree-progtree', F));
  check('① template 을 읽는다', r.template, 'tree-progtree');
}
{
  const r = readDeclaration(md(F + 'emm', 'map: 7f3a9c', 'template: kanban', F));
  check('① map 은 블록 안쪽에 적는다', r.map, '7f3a9c');
  check('① template 도 함께', r.template, 'kanban');
}
{
  const r = readDeclaration(md(F + 'emm', 'template: "kanban"', F));
  check('① 따옴표를 벗긴다', r.template, 'kanban');
}
{
  const r = readDeclaration(md(F + 'emm', 'colour: red', F));
  check('① 모르는 키는 무시한다 (전방 호환)', r, {});
}
{
  const src = md('# 제목', '', '본문뿐이다');
  check('① 블록이 없으면 빈 선언', readDeclaration(src), {});
}

// ── ② 레벨 선언 ──────────────────────────────────────────────────────
{
  const r = readDeclaration(
    md(
      F + 'emm',
      'template: tree-progtree',
      'levels:',
      '  1:',
      '    layout: tree-right',
      '    shape: rounded',
      '    font: 18',
      '  2:',
      '    layout: process-tree-right',
      F,
    ),
  );
  check('② template 과 levels 를 함께 읽는다', r.template, 'tree-progtree');
  check('② 1레벨', r.levels?.[1], { layout: 'tree-right', shape: 'rounded', font: '18' });
  check('② 2레벨', r.levels?.[2], { layout: 'process-tree-right' });
  check('② 선언하지 않은 레벨은 없다 (상속은 쓰는 쪽 몫)', r.levels?.[3], undefined);
}
{
  const r = readDeclaration(md(F + 'emm', 'levels:', '  0:', '    layout: x', '  7:', '    layout: y', F));
  check('② 1~6 밖의 레벨 번호는 버린다', r.levels, undefined);
}
{
  const r = readDeclaration(md(F + 'emm', 'levels:', '  2:', '    shape: star', F));
  check('② 중간 레벨만 선언해도 된다', r.levels, { 2: { shape: 'star' } });
}

// ── ③ 남의 펜스는 건드리지 않는다 ─────────────────────────────────────
{
  const r = readDeclaration(md(F + 'bash', 'npm run build', F));
  check('③ 다른 언어의 펜스는 우리 것이 아니다', r, {});
}
{
  // 예시로 emm 블록을 **보여주는** 문서. 바깥 펜스가 더 길다.
  const r = readDeclaration(
    md('# 설명서', '', '````markdown', F + 'emm', 'template: kanban', F, '````'),
  );
  check('③ 남의 펜스 안의 emm 은 선언이 아니다', r, {});
}
{
  const r = readDeclaration(
    md(F + 'json', '{"emm": 1}', F, '', F + 'emm', 'template: timeline', F),
  );
  check('③ 앞선 펜스를 건너뛰고 진짜 선언을 찾는다', r.template, 'timeline');
}
{
  const r = readDeclaration(md('- 항목', '', '  ' + F + 'emm', '  template: kanban', '  ' + F));
  check('③ 들여쓴 펜스도 읽는다', r.template, 'kanban');
}

// ── ④ 본문에 그대로 남는다 — 중심 노드의 코드 노트가 된다 ─────────────
{
  const src = md('# 배포 절차', '', F + 'emm', 'template: tree-progtree', F, '', '## 준비');
  const map = parseEmm(src);
  const centre = map?.root;
  check('④ 중심 노드는 첫 헤딩이다', centre?.text, '배포 절차');
  check('④ 선언은 중심 노드의 코드 노트로 남는다', centre?.notes?.[0]?.type, 'code_block');
  check('④ 노트의 언어는 emm', centre?.notes?.[0]?.lang, 'emm');
  check('④ 선언이 노드를 만들지는 않는다', map?.branches?.[0]?.text, '준비');
  check('④ 가지는 하나뿐이다', map?.branches?.length, 1);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
