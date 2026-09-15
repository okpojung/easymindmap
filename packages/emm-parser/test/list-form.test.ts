// 리스트 항목(`- 항목`) MD 왕복 단위 테스트 (2026-09-15).
//
// 견출 아래 `- a` / `- b` 로 쓴 항목을 불러오면 하위 노드가 된다. 그런데
// 내보내기는 깊이만 보고 `### a` / `### b` 견출로 써서, 왕복 뒤 파일이
// 리스트 → 견출로 바뀌었다(사용자 지적). 파서가 리스트 출신 노드에
// `mdForm: 'list'` 를 남기고 직렬화가 그 노드(와 그 하위)를 다시 `-` 로
// 쓰는지, 그리고 그렇게 써도 트리 구조가 그대로 돌아오는지 지킨다.

import { parseEmm } from '../src/parse';
import { buildEmmBody } from '../src/serialize';
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
const tree = (n: { text: string; children?: MindNode[] }): unknown =>
  [n.text, ...(n.children ?? []).map((c) => tree(c))];
const shape = (m: SampleMap): unknown => tree({ text: m.root.text, children: m.branches as MindNode[] });
const forms = (nodes: MindNode[]): unknown =>
  nodes.map((n) => [n.text, n.mdForm ?? 'heading', ...(n.children?.length ? [forms(n.children)] : [])]);
const base = (md: string): SampleMap => parseEmm(md, 'mindmap', OPT)!;
const roundtrip = (m: SampleMap): SampleMap => parseEmm(buildEmmBody(m, []), 'mindmap', OPT)!;
const bodyLines = (m: SampleMap): string[] => buildEmmBody(m, []).split('\n').filter((l) => l !== '');

// ── ① 견출 아래 리스트 — 왕복 뒤에도 리스트 ─────────────────────────
{
  const m = base('# 제목\n\n## 절\n- a\n- b\n  - b1\n\n### 소절\n');
  check('① 파서가 리스트 출신 노드에 mdForm 을 남긴다', forms(m.branches[0].children!),
    [['a', 'list'], ['b', 'list', [['b1', 'list']]], ['소절', 'heading']]);
  check('① 내보내기가 `-` 로 쓴다 (견출로 바꾸지 않는다)', bodyLines(m),
    ['# 제목', '## 절', '- a', '- b', '  - b1', '### 소절']);
  const back = roundtrip(m);
  check('① 다시 읽어도 트리가 같다', shape(back), shape(m));
  check('① 다시 읽어도 리스트 표시가 남는다', forms(back.branches[0].children!), forms(m.branches[0].children!));
  check('① 두 번 왕복해도 파일이 같다', buildEmmBody(back, []), buildEmmBody(m, []));
}

// ── ② 리스트 노드 아래에 앱에서 새로 붙인 노드(표시 없음) — 들여쓴 `-` ─
{
  const m = base('# 제목\n\n## 절\n- a\n');
  const a = m.branches[0].children![0];
  a.children = [{ id: 'new', text: '새 하위', children: [{ id: 'new2', text: '손자' }] } as MindNode];
  check('② 리스트 노드의 하위는 표시가 없어도 들여쓴 `-`', bodyLines(m),
    ['# 제목', '## 절', '- a', '  - 새 하위', '    - 손자']);
  check('② 다시 읽으면 구조 그대로', shape(roundtrip(m)), ['제목', ['절', ['a', ['새 하위', ['손자']]]]]);
}

// ── ③ 빈 리스트 항목 — `-` 만 쓰고 이름 없는 노드로 돌아온다 ───────────
{
  const m = base('# 제목\n\n## 절\n- x\n-\n- y\n');
  check('③ 빈 항목은 `-` 만', bodyLines(m), ['# 제목', '## 절', '- x', '-', '- y']);
  check('③ 다시 읽으면 이름 없는 노드', shape(roundtrip(m)), ['제목', ['절', ['x'], [''], ['y']]]);
}

// ── ④ 견출 뒤에 리스트 형제 — 견출로 써야 구조가 산다 ────────────────
// `### 소절` 다음에 `- z` 를 쓰면 파서는 z 를 소절의 자식으로 읽는다.
// 그래서 형제 묶음 안에서 견출이 먼저 나오면 그 뒤 형제는 견출로 쓴다.
{
  const m = base('# 제목\n\n## 절\n\n### 소절\n\n## 다음\n- z\n');
  // 앱에서 z 를 '절' 아래(소절 뒤)로 옮겼다고 치자
  const z = m.branches[1].children!.pop()!;
  m.branches[0].children!.push(z);
  check('④ 견출 뒤의 리스트 노드는 견출로', bodyLines(m), ['# 제목', '## 절', '### 소절', '### z', '## 다음']);
  check('④ 다시 읽으면 형제 관계 유지', shape(roundtrip(m)), ['제목', ['절', ['소절'], ['z']], ['다음']]);
}

// ── ⑤ 리스트 다음에 견출 형제 — 순서 그대로 ───────────────────────────
{
  const m = base('# 제목\n\n## 절\n- a\n- b\n\n### 소절\n\n- c\n\n## 다음\n');
  check('⑤ 리스트 → 견출 → 소절의 리스트', bodyLines(m),
    ['# 제목', '## 절', '- a', '- b', '### 소절', '- c', '## 다음']);
  check('⑤ 왕복 구조', shape(roundtrip(m)), ['제목', ['절', ['a'], ['b'], ['소절', ['c']]], ['다음']]);
}

// ── ⑥ 리스트 항목에 딸린 노트·링크 — 빈 줄로 띄우고 다시 읽힌다 ───────
{
  const m = base('# 제목\n\n## 절\n- a\n- b\n');
  const a = m.branches[0].children![0];
  a.notes = [{ id: 'n1', type: 'paragraph', text: '메모' } as never];
  a.links = [{ url: 'https://example.com', label: '예' } as never];
  const body = buildEmmBody(m, []);
  check('⑥ 노트·링크가 항목 아래에 붙는다', body.split('\n').filter((l) => l !== ''),
    ['# 제목', '## 절', '- a', '🔗 [예](https://example.com)', '> 메모', '- b']);
  // 인용문은 'note' 배치에서 노트로 돌아온다 (견출 아래 인용문과 같은 규칙 —
  // 'node' 배치에서는 견출이든 리스트든 본문 줄로 합쳐진다. 앱은 메타데이터로 복원)
  const back = parseEmm(body, 'mindmap', { blockPlacement: 'note' })!;
  check('⑥ 왕복 구조', shape(back), ['제목', ['절', ['a'], ['b']]]);
  check('⑥ 노트가 항목의 노트로 돌아온다', (back.branches[0].children![0].notes ?? []).map((n) => n.text), ['메모']);
  check('⑥ 링크가 노드 링크로 돌아온다', (back.branches[0].children![0].links ?? []).map((l) => l.url), ['https://example.com']);
}

// ── ⑦ 7레벨 이상은 예전처럼 리스트 (mdForm 없어도) ────────────────────
{
  const m = base('# 제목\n\n## 2\n\n### 3\n\n#### 4\n\n##### 5\n\n###### 6\n- 7\n  - 8\n');
  check('⑦ 6레벨까지 견출, 그 아래 리스트', bodyLines(m).slice(-3), ['###### 6', '- 7', '  - 8']);
  check('⑦ 왕복 구조', shape(roundtrip(m)), shape(m));
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
