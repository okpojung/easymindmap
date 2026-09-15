// 여러 줄 노드·블록으로 시작하는 노드의 MD 왕복 (2026-09-15).
//
// ① 견출 아래 인용문(`>`)으로 쓴 여러 줄 본문은 'node' 배치에서 그 노드의
//    추가 줄이 된다. 그런데 내보내기가 모든 줄을 공백으로 이어 **한 줄
//    견출**로 뭉개, 왕복 뒤 줄바꿈과 인용문 표시가 사라졌다(사용자 지적).
//    → 제목은 첫 줄, 나머지 줄은 다시 `>` 로.
// ② 코드 펜스로 시작하는 노드는 종류 라벨(`### 코드`)을 견출로 써서 다시
//    읽으면 "코드" 노드가 끼어들어 왕복마다 한 단계 깊어졌다.
//    → 하위·노트·링크·사진 없는 잎 노드면 라벨 없이 블록만.

import { parseEmm } from '../src/parse';
import { buildEmmBody, splitNodeBody } from '../src/serialize';
import type { MindNode, SampleMap } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const OPT = { blockPlacement: 'node' as const };
const full = (n: { text: string; children?: MindNode[] }): unknown =>
  [n.text, ...(n.children ?? []).map((c) => full(c))];
const tree = (m: SampleMap): unknown => m.branches.map((b) => full(b));
const base = (md: string): SampleMap => parseEmm(md, 'mindmap', OPT)!;
const roundtrip = (m: SampleMap): SampleMap => parseEmm(buildEmmBody(m, []), 'mindmap', OPT)!;
const lines = (m: SampleMap): string[] => buildEmmBody(m, []).split('\n');

// ── ① 견출 + 인용문 여러 줄 (빈 줄 포함) ─────────────────────────────
{
  const md = '# 제목\n\n## 8. 기대 결과\n\n> 첫 줄\n>\n> 1. 둘째 줄\n> 셋째 줄\n\n## 다음\n';
  const m = base(md);
  check('① 불러오면 인용문이 노드의 추가 줄', m.branches[0].text, '8. 기대 결과\n첫 줄\n\n1. 둘째 줄\n셋째 줄');
  check('① 내보내기 — 제목은 첫 줄, 나머지는 `>` (빈 줄은 `>` 만)', lines(m).filter(Boolean).slice(1, 7),
    ['## 8. 기대 결과', '> 첫 줄', '>', '> 1. 둘째 줄', '> 셋째 줄', '## 다음']);
  check('① 행 끝 공백 없음', lines(m).filter((l) => /[ \t]+$/.test(l)), []);
  check('① 왕복 뒤 글자(줄바꿈 포함)·트리 동일', tree(roundtrip(m)), tree(m));
  check('① 두 번 왕복해도 파일 동일', buildEmmBody(roundtrip(m), []), buildEmmBody(m, []));
}

// ── ② 앱에서 Shift+Enter 로 만든 여러 줄 노드 (리스트 항목 포함) ─────────
{
  const m = base('# 제목\n\n## 절\n- a\n- b\n');
  m.branches[0].text = '절\n둘째 줄';
  m.branches[0].children![0].text = 'a\na-둘째';
  check('② 견출·리스트 항목 모두 `>` 로 이어 쓴다', lines(m).filter(Boolean),
    ['# 제목', '## 절', '> 둘째 줄', '- a', '> a-둘째', '- b']);
  check('② 왕복 동일', tree(roundtrip(m)), tree(m));
}

// ── ③ 코드 펜스로 시작하는 잎 노드 — 라벨 견출 없이 블록만 ──────────────
{
  const md = '# 제목\n\n## 7. 코드\n\n```bash\n##\n# 주석\n```\n\n## 다음\n';
  const m = base(md);
  check('③ 불러오면 펜스가 자식 노드', tree(m), [['7. 코드', ['```bash\n##\n# 주석\n```']], ['다음']]);
  check('③ 내보내기에 `### 코드` 라벨이 없다', lines(m).some((l) => l === '### 코드'), false);
  check('③ 왕복 동일 (한 단계 깊어지지 않는다)', tree(roundtrip(m)), tree(m));
  check('③ 두 번 왕복해도 동일', tree(roundtrip(roundtrip(m))), tree(m));
}

// ── ④ 표로 시작하는 잎 노드 ─────────────────────────────────────────
{
  const md = '# 제목\n\n## 표 절\n\n| a | b |\n|---|---|\n| 1 | 2 |\n';
  const m = base(md);
  check('④ 라벨 `### 표` 없음', lines(m).some((l) => l === '### 표'), false);
  check('④ 왕복 동일', tree(roundtrip(m)), tree(m));
}

// ── ⑤ 블록으로 시작하지만 하위가 있는 노드 — 라벨을 남겨 하위를 붙인다 ──
{
  const m = base('# 제목\n\n## 절\n\n```js\nx\n```\n');
  const code = m.branches[0].children![0];
  code.children = [{ id: 'k', text: '코드의 하위' } as MindNode];
  check('⑤ 라벨 견출이 남는다', lines(m).some((l) => l === '### 코드'), true);
  // 알려진 한계(예전과 같음): 라벨이 있으면 다시 읽을 때 "코드" 노드 아래에
  // 펜스 노드와 하위가 형제로 놓인다 — 앱은 메타데이터로 원래 구조를 복원한다.
  check('⑤ 왕복 뒤 하위는 라벨 노드 아래 (예전과 같은 동작)', tree(roundtrip(m)), [['절', ['코드', ['```js\nx\n```'], ['코드의 하위']]]]);
}

// ── ⑥ 가지(depth 1)가 블록으로 시작하면 라벨 유지 (머리말로 읽히지 않게) ──
{
  const m = base('# 제목\n\n## 절\n');
  m.branches[0].text = '```js\ny\n```';
  check('⑥ 가지의 라벨 `## 코드`', lines(m).includes('## 코드'), true);
}

// ── ⑦ 짝짓기 키 — 첫 줄이 제목, 루트는 예전처럼 한 줄 ────────────────
{
  check('⑦ 제목은 첫 줄', splitNodeBody('첫 줄\n둘째 줄').title, '첫 줄');
  check('⑦ 루트(singleLine)는 이어 붙인다', splitNodeBody('첫 줄\n둘째 줄', { singleLine: true }).title, '첫 줄 둘째 줄');
  const m = base('# 제목\n\n## 절\n');
  m.root.text = '제목\n부제';
  check('⑦ 루트는 `# 제목 부제` 한 줄', lines(m)[0], '# 제목 부제');
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
