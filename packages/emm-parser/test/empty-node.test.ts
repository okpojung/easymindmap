// 빈 노드(글자를 모두 지운 노드) MD 왕복 단위 테스트 (2026-09-15).
//
// 앱은 2026-08-05 부터 빈 노드를 정상 상태로 저장한다. 그런데 내보냈다
// 다시 읽으면 ① 빈 노드가 사라지고 ② 그 하위가 한 단계 올라가며 ③ 7레벨
// 이상의 빈 노드는 `###` 이라는 이름의 노드가 됐다 — 구조가 망가지는
// 데이터 손상이다. 이 파일은 그 셋이 **왕복(내보내기 → 다시 읽기)** 에서
// 다시 생기지 않는지 지킨다.

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
const roundtrip = (m: SampleMap): SampleMap => parseEmm(buildEmmBody(m, []), 'mindmap', OPT)!;
const base = (md: string): SampleMap => parseEmm(md, 'mindmap', OPT)!;

// ── ① 빈 견출 하나 ───────────────────────────────────────────────
{
  const m = base('# 제목\n\n## 가지 A\n\n## 가지 B\n');
  m.branches[0].text = '';
  const body = buildEmmBody(m, []);
  check('① 빈 제목은 `##` 만 쓴다 (행 끝 공백 없음)', body.split('\n').includes('##'), true);
  check('① 어떤 줄도 행 끝 공백으로 끝나지 않는다', body.split('\n').filter((l) => /[ \t]+$/.test(l)), []);
  check('① 다시 읽으면 이름 없는 노드가 남는다', shape(roundtrip(m)), ['제목', [''], ['가지 B']]);
}

// ── ② 하위 견출이 딸린 빈 견출 — 하위 구조 유지 ───────────────────
{
  const m = base('# 제목\n\n## 가지 A\n\n### 하위 1\n\n### 하위 2\n\n## 가지 B\n\n- 항목\n');
  m.branches[0].text = '';
  m.branches[1].children![0].text = '';
  check('② 빈 부모 아래 하위가 그대로 (한 단계 올라가지 않는다)', shape(roundtrip(m)),
    ['제목', ['', ['하위 1'], ['하위 2']], ['가지 B', ['']]]);
}

// ── ③ 목록 항목이던 빈 노드 → `###` 이름의 노드가 되지 않는다 ─────
{
  const m = base('# 제목\n\n## 가지\n\n- 항목\n');
  m.branches[0].children![0].text = '';
  const back = roundtrip(m);
  check('③ 빈 노드가 "###" 이름이 되지 않는다', back.branches[0].children![0].text, '');
}

// ── ④ `## #` (닫는 기호만) 도 빈 견출 ────────────────────────────
{
  const m = base('# 제목\n\n## #\n\n### 하위\n\n## ###\n');
  check('④ `## #` 은 이름 없는 노드', shape(m), ['제목', ['', ['하위']], ['']]);
}

// ── ⑤ 7레벨 이상의 빈 노드 — `-` 형식 ───────────────────────────
{
  let md = '# 제목\n';
  for (let d = 2; d <= 6; d++) md += `\n${'#'.repeat(d)} L${d}\n`;
  md += '\n- L7\n  - L8\n';
  const m = base(md);
  const l6 = ((((m.branches[0].children![0].children![0].children![0].children![0]))));
  check('⑤ 준비 — 7·8레벨이 리스트로 읽혔다', tree(l6), ['L6', ['L7', ['L8']]]);
  l6.children![0].text = '';                 // L7 을 비운다
  const body = buildEmmBody(m, []);
  check('⑤ 빈 7레벨은 `-` 만 쓴다', body.split('\n').includes('-'), true);
  check('⑤ 행 끝 공백 없음', body.split('\n').filter((l) => /[ \t]+$/.test(l)), []);
  const back = roundtrip(m);
  const b6 = back.branches[0].children![0].children![0].children![0].children![0];
  check('⑤ 다시 읽으면 빈 7레벨 아래 8레벨이 그대로', tree(b6), ['L6', ['', ['L8']]]);
}

// ── ⑥ 옛 내보내기(`## ` 행 끝 공백)도 이제 빈 견출로 읽는다 ──────────
{
  const m = base('# 제목\n\n## \n\n### 하위\n');
  check('⑥ `## ` (행 끝 공백) 는 빈 견출', shape(m), ['제목', ['', ['하위']]]);
}

// ── ⑦ 코드 펜스 안의 `##` 은 견출이 아니다 (기존 규칙 유지) ──────────
{
  const m = base('# 제목\n\n## 가지\n\n```sh\n##\n## #\n```\n');
  check('⑦ 펜스 안 `##` 은 노드가 되지 않는다', m.branches.length, 1);
}

// ── ⑧ 닫지 않은 emm 선언 블록은 빈 견출 앞에서도 끊긴다 ─────────────
{
  const m = base('```emm\nlayout: TP\n\n# 제목\n\n##\n\n### 하위\n');
  check('⑧ 닫지 않은 emm 블록 뒤의 빈 견출', shape(m), ['제목', ['', ['하위']]]);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
