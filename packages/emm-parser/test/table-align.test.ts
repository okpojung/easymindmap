// 표의 GFM 열 정렬(구분선 콜론)이 불러오기·내보내기를 지나 남는지 (2026-09-17).
//   `| a | b |` / `|:---|---:|` — 왼쪽·가운데·오른쪽은 열 단위이며 GFM 표 확장의 문법이다.

import { parseEmm } from '../src/parse';
import { buildEmmBody, splitNodeBody } from '../src/serialize';
import type { SampleMap } from '../src/model';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const md = '# 제목\n\n## 절\n\n| 항목 | 값 | 비고 |\n|:---|:---:|---:|\n| a | 1 | x |\n| b | 2 | y |\n';

// ① 'node' 배치 — 표가 자식 노드가 되고, 정렬 구분선이 노드 글자에 남는다
{
  const m = parseEmm(md, 'x', { blockPlacement: 'node' })!;
  const node = m.branches[0].children![0];
  check('① 노드 글자에 정렬 구분선 유지 (콜론 없는 구분선은 예전처럼 제거)', node.text.split('\n'),
    ['항목 | 값 | 비고', ':--- | :---: | ---:', 'a | 1 | x', 'b | 2 | y']);
  const body = splitNodeBody(node.text);
  check('① splitNodeBody 가 정렬을 읽는다', body.blocks[0].aligns, [':---', ':---:', '---:']);
  const out = buildEmmBody(m, []);
  check('① 내보내기 구분선에 콜론', out.split('\n').filter((l) => /^\|:?-/.test(l)), ['|:---|:---:|---:|']);
  const back = parseEmm(out, 'x', { blockPlacement: 'node' })!;
  check('① 두 번 왕복해도 같다', buildEmmBody(back, []), out);
}

// ② 콜론 없는 구분선 — 예전과 같이 `|---|` 로 (변화 없음)
{
  const plain = md.replace('|:---|:---:|---:|', '|---|---|---|');
  const m = parseEmm(plain, 'x', { blockPlacement: 'node' })!;
  check('② 구분선 제거', m.branches[0].children![0].text.split('\n').length, 3);
  check('② 내보내기 구분선은 |---|', buildEmmBody(m, []).split('\n').filter((l) => /^\|-/.test(l)), ['|---|---|---|']);
}

// ③ 'note' 배치 — 표 노트에 남은 정렬 구분선도 내보내기에 반영
{
  const m = parseEmm(md, 'x', { blockPlacement: 'note' })!;
  const note = m.branches[0].notes![0];
  check('③ 표 노트 원문에 정렬 구분선', note.text.split('\n')[1], ':--- | :---: | ---:');
  check('③ 노트 내보내기 구분선에 콜론', buildEmmBody(m, []).split('\n').filter((l) => /^\|:?-/.test(l)), ['|:---|:---:|---:|']);
}

// ④ 앱에서 만든 노드(정렬 구분선 포함) → 내보내기 → 파서 → 같은 정렬
{
  const m: SampleMap = {
    title: 't', root: { id: 'root', text: 't', colorKey: 'root', side: 'center' },
    branches: [{ id: 'b', text: '절\n| 이름 | 점수 |\n|---|---:|\n| 김 | 90 |', colorKey: 'l1A', side: 'right', children: [] }],
  } as SampleMap;
  const out = buildEmmBody(m, []);
  check('④ 오른쪽 정렬 한 열만', out.split('\n').filter((l) => /^\|-/.test(l)), ['|---|---:|']);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
