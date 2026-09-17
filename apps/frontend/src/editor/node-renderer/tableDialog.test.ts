// 표 팝업(TableDialog) 도우미 — 표 만들기·끼워 넣기·바꾸기가 mdTable 파서와
// 왕복하는지 (2026-09-17).   npx tsx src/editor/node-renderer/tableDialog.test.ts

import { buildMdTable, emptyTable, spliceMdTable, replaceMdTable, hasMdTable } from './TableDialog';
import { parseMdTable, splitPipeCells } from './mdTable';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// ① 빈 표 — 격자에서 3행×4열을 고르면 머리글 1 + 데이터 2행
{
  const e = emptyTable(3, 4);
  check('① 3×4 빈 표 모양', [e.headers, e.rows.length, e.rows[0].length], [['열1', '열2', '열3', '열4'], 2, 4]);
  const md = buildMdTable(e.headers, e.rows);
  check('① MD 줄 수 = 헤더+구분선+2행', md.split('\n').length, 4);
  const p = parseMdTable(md)!;
  check('① 파서가 빈 셀 표를 읽는다', [p.headers, p.rows], [e.headers, e.rows]);
  check('① 최소 2×2 로 올림', [emptyTable(1, 1).headers.length, emptyTable(1, 1).rows.length], [2, 1]);
}

// ② 셀 정리 — '|' 와 줄바꿈은 셀 안에 둘 수 없다
{
  const md = buildMdTable(['a|b', 'c'], [['x\ny', ' z ']]);
  check('② 줄바꿈 → 공백, 앞뒤 공백 제거', parseMdTable(md)!.rows[0], ['x y', 'z']);
  check('② 셀 안 | 는 원문에 \\| 로 (GFM)', md.split('\n')[0], '| a\\|b | c |');
  check('② 파서는 \\| 를 | 로 되돌린다', parseMdTable(md)!.headers, ['a|b', 'c']);
  check('② keepEscape 면 원문 그대로', splitPipeCells('| a\\|b | c |', { keepEscape: true }), ['a\\|b', 'c']);
  check('② 왕복: build → parse → build 동일', buildMdTable(parseMdTable(md)!.headers, parseMdTable(md)!.rows), md);
}

// ③ 끼워 넣기 — 줄 경계 보충
{
  const md = buildMdTable(['h1', 'h2'], [['1', '2']]);
  const t = spliceMdTable('제목', 2, md);
  check('③ 커서가 줄 끝이면 줄바꿈 뒤에', t.split('\n')[0], '제목');
  check('③ 파서가 표를 찾고 before 는 제목', [parseMdTable(t)!.before, parseMdTable(t)!.rows], ['제목', [['1', '2']]]);
  const t2 = spliceMdTable('앞뒤', 1, md);
  check('③ 글자 사이에 넣으면 앞·뒤로 갈라진다', [parseMdTable(t2)!.before, parseMdTable(t2)!.after], ['앞', '뒤']);
}

// ④ 바꾸기 — 첫 표만, 코드 펜스 안의 파이프는 건너뛴다
{
  const old = buildMdTable(['a', 'b'], [['1', '2']]);
  const neu = buildMdTable(['x', 'y', 'z'], [['7', '8', '9'], ['', '', '']]);
  const text = `제목\n${old}\n꼬리`;
  const out = replaceMdTable(text, neu);
  check('④ 표가 새 표로', [parseMdTable(out)!.headers, parseMdTable(out)!.rows.length], [['x', 'y', 'z'], 2]);
  check('④ 앞뒤 글은 그대로', [out.startsWith('제목\n'), out.endsWith('\n꼬리')], [true, true]);
  const fenced = '```sh\n| a | b |\n| c | d |\n```\n' + old;
  const out2 = replaceMdTable(fenced, neu);
  check('④ 펜스 안 파이프 줄은 표가 아니다 — 펜스 유지, 뒤의 표만 교체', [out2.startsWith('```sh\n| a | b |\n| c | d |\n```\n'), parseMdTable(out2.split('```\n').pop()!)!.headers], [true, ['x', 'y', 'z']]);
  check('④ 표가 없으면 끝에 덧붙인다', replaceMdTable('그냥 글', neu).startsWith('그냥 글\n| x'), true);
  check('④ hasMdTable', [hasMdTable(text), hasMdTable('그냥 글')], [true, false]);
}

// ⑤ 왕복 — 파서가 읽은 표를 다시 만들면 같은 표
{
  const md = buildMdTable(['항목', '값'], [['호호홍', '1234'], ['', '빈 칸 앞']]);
  const p = parseMdTable(md)!;
  check('⑤ build → parse → build 동일', buildMdTable(p.headers, p.rows), md);
}

// ⑥ GFM 열 정렬 — 구분선 콜론으로 쓰고 읽는다
{
  const md = buildMdTable(['이름', '점수', '메모'], [['김', '90', 'x']], ['left', 'center', 'right']);
  check('⑥ 구분선에 :--- / :---: / ---:', md.split('\n')[1], '|:---|:---:|---:|');
  const p = parseMdTable(md)!;
  check('⑥ 파서가 정렬을 읽는다', p.aligns, ['left', 'center', 'right']);
  check('⑥ 정렬 없음(null)은 ---', buildMdTable(['a', 'b'], [['1', '2']], [null, 'right']).split('\n')[1], '|---|---:|');
  check('⑥ 구분선 없는 단순 파이프 표는 모두 null', parseMdTable('a | b\n1 | 2')!.aligns, [null, null]);
  check('⑥ 빈 표의 정렬', emptyTable(2, 3).aligns, [null, null, null]);
  check('⑥ build → parse → build 에서 정렬 유지', buildMdTable(p.headers, p.rows, p.aligns), md);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
