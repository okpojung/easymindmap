// 표 팝업(TableDialog) 도우미 — 표 만들기·끼워 넣기·바꾸기가 mdTable 파서와
// 왕복하는지 (2026-09-17).   npx tsx src/editor/node-renderer/tableDialog.test.ts

import { buildMdTable, emptyTable, spliceMdTable, replaceMdTable, hasMdTable } from './TableDialog';
import { layoutMdTables, parseMdTable, parseMdTables, splitPipeCells } from './mdTable';
import { tableBlockGaps } from './sizeNodeForText';

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


// ⑦ 표 여러 개 (2026-09-22 사용자 보고: 두 번째 표가 안 그려졌다) — 파서·측정·교체
{
  const t1 = buildMdTable(['a', 'b'], [['1', '2']]);
  const t2 = buildMdTable(['x', 'y', 'z'], [['7', '8', '9'], ['4', '5', '6']]);
  const text = `머리\n둘째 줄\n\n${t1}\n\n가운데\n\n${t2}\n\n끝`;
  const all = parseMdTables(text);
  check('⑦ 표 2개를 순서대로 읽는다', all.map((t) => t.headers), [['a', 'b'], ['x', 'y', 'z']]);
  check('⑦ 각 표의 before = 앞 표 뒤부터의 글 · 마지막 after = 끝 글', [all[0].before, all[1].before, all[1].after], ['머리\n둘째 줄', '가운데', '끝']);
  const lay = layoutMdTables(text, 14)!;
  check('⑦ plainText 는 표를 뺀 글', lay.plainText, '머리\n둘째 줄\n가운데\n끝');
  check('⑦ beforeLines = 앞 글의 수동 줄 수 누적 (표1 앞 2줄, 표2 앞 3줄)', lay.tables.map((t) => t.beforeLines), [2, 3]);
  check('⑦ 표 하나면 배열 1 · 없으면 null', [parseMdTables(t1).length, layoutMdTables('그냥 글', 14)], [1, null]);
  // 붙은 표 두 개 (사이 글 없음, 빈 줄로만 구분 — GFM 처럼 빈 줄이 표를 끝낸다) — beforeLines 같다
  const adj = layoutMdTables(`${t1}\n\n${t2}`, 14)!;
  check('⑦ 붙은 표 2개: plainText 빈 문자열 · beforeLines 0,0', [adj.plainText, adj.tables.map((t) => t.beforeLines)], ['', [0, 0]]);
  check('⑦ 빈 줄 없이 이어 쓰면 두 번째 표의 머리글은 첫 표의 행이 된다 (GFM 과 같은 한계)', parseMdTables(`${t1}\n${t2}`)[0].rows.length, 2);
  // 여백 규칙 — 측정과 렌더가 공유
  const tabs = [{ at: 2 }, { at: 3 }];
  check('⑦ gaps: 표1(at 2, 뒤에 글) 위6 아래6 · 표2(at 3, 뒤에 글) 위6 아래6', [tableBlockGaps(tabs, 0, 4), tableBlockGaps(tabs, 1, 4)], [{ above: 6, below: 6, total: 12 }, { above: 6, below: 6, total: 12 }]);
  const stacked = [{ at: 0 }, { at: 0 }];
  check('⑦ gaps: 글 없이 붙은 표 2개 → 표1 위0 아래0 · 표2 위6 아래0', [tableBlockGaps(stacked, 0, 0), tableBlockGaps(stacked, 1, 0)], [{ above: 0, below: 0, total: 0 }, { above: 6, below: 0, total: 6 }]);
  const stackedText = [{ at: 1 }, { at: 1 }];
  check('⑦ gaps: 글 뒤 붙은 표 2개, 뒤에 글 → 표1 아래 여백은 표2 가 대신(0) · 표2 아래 6', [tableBlockGaps(stackedText, 0, 2).below, tableBlockGaps(stackedText, 1, 2).below], [0, 6]);
  // n 번째 표만 바꾼다
  const nt = buildMdTable(['q', 'r'], [['new', 'n2']]);
  const r1 = replaceMdTable(text, nt, 1);
  check('⑦ replaceMdTable(index 1) → 두 번째 표만 바뀌고 첫 표·글은 그대로', [parseMdTables(r1).map((t) => t.headers), r1.startsWith('머리\n둘째 줄\n\n| a | b |'), r1.endsWith('| new | n2 |\n\n끝')], [[['a', 'b'], ['q', 'r']], true, true]);
  const r0 = replaceMdTable(text, nt);
  check('⑦ replaceMdTable(기본 index 0) → 첫 표만', parseMdTables(r0).map((t) => t.headers), [['q', 'r'], ['x', 'y', 'z']]);
  check('⑦ index 가 표 수를 넘으면 끝에 붙인다', parseMdTables(replaceMdTable(text, nt, 5)).length, 3);
}

if (failed) { console.log(`\n${failed} FAIL`); process.exit(1); }
console.log('\n모두 통과');
