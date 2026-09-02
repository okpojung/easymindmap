// setextToAtx 단위 테스트.
//
// 이 파일이 지키는 것은 두 가지다.
//   ① 밑줄로 쓴 헤딩을 `#` 로 바꾼다 — 안 바꾸면 parseEmm 이 null 이다
//   ② **바꾸지 않아야 할 `---` 를 건드리지 않는다** — 수평선·표 구분선·
//      리스트·코드 펜스 안쪽. 이쪽이 더 위험하다

import { setextToAtx } from '../src/setext';
import { parseEmm } from '../src/parse';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const conv = (...lines: string[]) => setextToAtx(lines);
const F = '```';

// ── ① 바꾼다 ──────────────────────────────────────────────────────
check('① = 밑줄은 1레벨', conv('Install', '======='), ['# Install']);
check('① - 밑줄은 2레벨', conv('Requirements', '------------'), ['## Requirements']);
check('① 밑줄 한 글자도 밑줄이다', conv('Title', '='), ['# Title']);
check('① 앞뒤 공백은 다듬는다', conv('  Title  ', '==='), ['# Title']);
check('① 최대 3칸 들여쓴 밑줄', conv('Title', '   ==='), ['# Title']);
check(
  '① 빈 줄로 나뉜 두 개',
  conv('A', '===', '', 'B', '---'),
  ['# A', '', '## B'],
);

// ── ② 건드리지 않는다 ─────────────────────────────────────────────
check('② 빈 줄 뒤의 --- 는 수평선', conv('# A', '', '---', '', '# B'), ['# A', '', '---', '', '# B']);
check('② 문서 첫 줄의 --- 는 수평선', conv('---', '', '# A'), ['---', '', '# A']);
check('② 표 구분선', conv('| a | b |', '|---|---|'), ['| a | b |', '|---|---|']);
check('② 리스트 항목 뒤', conv('- item', '---'), ['- item', '---']);
check('② 인용문 뒤', conv('> quote', '---'), ['> quote', '---']);
check('② ATX 헤딩 뒤', conv('# A', '---'), ['# A', '---']);
check('② 들여쓴 코드 뒤', conv('    code', '---'), ['    code', '---']);
check('② *** 는 밑줄이 아니다', conv('A', '***'), ['A', '***']);
check(
  '② 코드 펜스 안쪽',
  conv('# C', '', F, 'title', '=====', F),
  ['# C', '', F, 'title', '=====', F],
);
check(
  '② 여러 줄은 펴지 않는다',
  conv('Foo', 'bar', '==='),
  ['Foo', 'bar', '==='],
);

// ── ③ 파서 통합 — 이것이 고치려던 문제다 ──────────────────────────
{
  const setext = 'Install\n=======\n\nRequirements\n------------\n';
  const atx = '# Install\n\n## Requirements\n';
  const shape = (md: string) => {
    const m = parseEmm(md);
    return m === null ? null : {
      root: m.root?.text,
      branches: (m.branches ?? []).map((b) => b.text),
    };
  };
  check('③ setext 문서가 더는 null 이 아니다', shape(setext) !== null, true);
  check('③ ATX 로 쓴 같은 문서와 같은 맵', shape(setext), shape(atx));
}
{
  // 수평선이 헤딩으로 바뀌어 가짜 노드가 생기지 않는지 — 반대 방향 확인
  const m = parseEmm('# A\n\n---\n\n## B\n');
  check('③ 수평선은 여전히 무시된다', (m?.branches ?? []).map((b) => b.text), ['B']);
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
