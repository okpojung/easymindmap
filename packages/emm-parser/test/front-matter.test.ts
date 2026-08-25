// readFrontMatter 단위 테스트.
//
// conformance/ 는 **EMM 파싱 코퍼스**다 — 여기 끼워 넣지 않는다.
// 이 테스트가 지키는 것은 두 가지다:
//   ① 문서 맨 앞 `---` 블록을 본문에서 걷어낸다 (걷어내지 않으면 표준
//      파서가 수평선 + setext 헤딩으로 읽어 **가짜 노드**를 만든다)
//   ② 그 안의 `emm:` 선언만 알아보고, 나머지는 건드리지 않는다

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

// ── ② emm 선언 ───────────────────────────────────────────────────────
{
  const r = readFrontMatter(md('---', 'emm:', '  template: wbs', '---', '', '# 제목'));
  check('② template 을 읽는다', r.emm.template, 'wbs');
}
{
  const r = readFrontMatter(md('---', 'emm:', '  template: "wbs"', '---'));
  check('② 따옴표를 벗긴다', r.emm.template, 'wbs');
}
{
  // markmap 의 실제 머리말 모양 — 우리 것이 아닌 키는 건드리지 않는다
  const r = readFrontMatter(
    md('---', 'title: markmap', 'markmap:', '  colorFreezeLevel: 2', '---', '', '## Links'),
  );
  check('② 남의 키만 있으면 emm 은 비어 있다', r.emm, {});
  check('② 그래도 본문에서는 걷어낸다', r.body, '## Links');
}
{
  const r = readFrontMatter(
    md('---', 'title: 문서', 'emm:', '  template: kanban', 'markmap:', '  x: 1', '---'),
  );
  check('② 남의 키와 섞여 있어도 emm 만 읽는다', r.emm.template, 'kanban');
}
{
  const r = readFrontMatter(md('---', 'emm:', '  colour: red', '---'));
  check('② 모르는 키는 무시한다 (전방 호환)', r.emm, {});
}

// ── ③ 레벨 선언 ──────────────────────────────────────────────────────
{
  const r = readFrontMatter(
    md(
      '---',
      'emm:',
      '  template: wbs',
      '  levels:',
      '    1:',
      '      layout: tree-right',
      '      shape: rounded',
      '      font: 18',
      '    2:',
      '      layout: process-tree-right',
      '---',
      '',
      '# 제목',
    ),
  );
  check('③ template 과 levels 를 함께 읽는다', r.emm.template, 'wbs');
  check('③ 1레벨', r.emm.levels?.[1], { layout: 'tree-right', shape: 'rounded', font: '18' });
  check('③ 2레벨', r.emm.levels?.[2], { layout: 'process-tree-right' });
  check('③ 선언하지 않은 레벨은 없다 (상속은 쓰는 쪽 몫)', r.emm.levels?.[3], undefined);
}
{
  const r = readFrontMatter(
    md('---', 'emm:', '  levels:', '    0:', '      layout: x', '    7:', '      layout: y', '---'),
  );
  check('③ 1~6 밖의 레벨 번호는 버린다', r.emm.levels, undefined);
}
{
  const r = readFrontMatter(md('---', 'emm:', '  levels:', '    2:', '      shape: star', '---'));
  check('③ 중간 레벨만 선언해도 된다', r.emm.levels, { 2: { shape: 'star' } });
}

// ── ④ 파서 통합 — 가짜 노드가 생기지 않는다 ──────────────────────────
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

  check('④ front matter 가 있든 없든 같은 맵이 된다', shape(parseEmm(withFm)), shape(parseEmm(without)));
  check('④ 맨 앞에 가짜 노드가 없다', parseEmm(withFm)?.branches?.[0]?.text, 'Links');
}

console.log(failed ? `\n${failed}건 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
