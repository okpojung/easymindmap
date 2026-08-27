// readFrontMatter 단위 테스트 — 걷어내기 하나만 한다.
//
// front matter 는 CommonMark 가 아니다. 걷어내지 않으면 표준 파서가 수평선 +
// setext 헤딩으로 읽어 문서 맨 앞에 **가짜 노드**를 만든다. 이 파일이 지키는
// 것은 그 하나이며, `emm` 코드블록 선언은 declaration.test.ts 가 맡는다.

import { readFrontMatter } from '../src/frontMatter';
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

// ── ① 걷어내기 ────────────────────────────────────────────────────────
{
  const src = md('# 제목', '', '본문');
  const r = readFrontMatter(src);
  check('① front matter 가 없으면 본문 그대로', r.body, src);
  check('① 없을 때 raw 는 null', r.raw, null);
}
{
  const r = readFrontMatter(md('---', 'title: x', '---', '', '# 제목', '본문'));
  check('① 블록과 뒤따르는 빈 줄 하나를 걷어낸다', r.body, md('# 제목', '본문'));
  check('① raw 는 블록 안쪽', r.raw, 'title: x');
}
{
  // 닫는 줄이 없으면 front matter 가 아니라 수평선으로 시작하는 문서다
  const src = md('---', 'title: x', '', '# 제목');
  check('① 닫는 --- 이 없으면 아무것도 걷어내지 않는다', readFrontMatter(src).body, src);
}
{
  const src = md('# 제목', '', '---', '', '## 다음');
  check('① 첫 줄이 아니면 front matter 가 아니다', readFrontMatter(src).body, src);
}
{
  // markmap 의 실제 머리말 모양 — 우리 키가 아니어도 걷어낸다
  const r = readFrontMatter(
    md('---', 'title: markmap', 'markmap:', '  colorFreezeLevel: 2', '---', '', '## Links'),
  );
  check('① 남의 키만 있어도 걷어낸다', r.body, '## Links');
}

// ── ② 파서 통합 — 가짜 노드가 생기지 않는다 ──────────────────────────
{
  const withFm = md(
    '---',
    'title: markmap',
    'markmap:',
    '  colorFreezeLevel: 2',
    '---',
    '',
    '# 제목',
    '',
    '## Links',
  );
  const without = md('# 제목', '', '## Links');
  // id 는 Date.now() 로 만들어지므로 비교에서 뺀다 — 지키려는 것은 모양이다
  const shape = (m: ReturnType<typeof parseEmm>): unknown =>
    (m?.branches ?? []).map(function walk(n): unknown {
      return { text: n.text, children: (n.children ?? []).map(walk) };
    });

  check('② front matter 가 있든 없든 같은 맵이 된다', shape(parseEmm(withFm)), shape(parseEmm(without)));
  check('② 중심 노드는 첫 헤딩이고, 그 앞에 가짜 노드가 없다', parseEmm(withFm)?.root?.text, '제목');
  check('② 첫 가지도 그대로', parseEmm(withFm)?.branches?.[0]?.text, 'Links');
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
