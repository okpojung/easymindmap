// 표 셀 자동 줄바꿈 (2026-10-15) — PDF·AI 표의 긴 셀을 `<br>` 로 나눠 표 폭을 맞춘다.
//   npx tsx packages/emm-parser/test/table-wrap.test.ts
import { textEm, TABLE_MAX_EM, wrapLine, wrapTableCells } from '../src/table-wrap';
import { parseEmm } from '../src/parse';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${JSON.stringify(detail)}`}`);
}
const lineEms = (cell: string) => cell.split('<br>').map(textEm);
const tableEm = (rows: string[][]) => {
  const n = Math.max(...rows.map((r) => r.length));
  let s = 0;
  for (let c = 0; c < n; c++) s += Math.max(...rows.map((r) => Math.max(...lineEms(r[c] ?? '')))) + 1.2;
  return s;
};

// ① 좁은 표는 한 글자도 바꾸지 않는다 (같은 배열)
const small = [['구분', '내용'], ['POS', '편의점']];
check('① 좁은 표는 그대로(같은 배열)', wrapTableCells(small) === small);

// ② 사용자 화면의 표 (PDF → 맵) — 셀이 한 줄로 길다
const krs = [
  ['구분', '대상 내역', '상세 구성'],
  ['POS 시스템', '전문점, 편의점, 키오스크, 스마트편의점 POS프로그램 / 통신, 중계서버',
    'OS : Windows 10, Windows Server / DB : MS-SQL(로컬) / Oracle19C(서버) / 통신방식 : 서버 소켓통신 / API통신 / 언어 : C#(POS), C++(통신서버), JAVA(중계서버)'],
  ['통합 정보 시스템', 'WebDDC(승인내역확인 시스템) / API서버, 통합정보시스템 / (영업, 회계, 경영관리, 광고 등 개발부문) / 홈페이지 / 상생물류 / 파트너 포털',
    'OS : UNIX / DB : Oracle 19C / WEB / WAS : WebToB / JEUS / 언어 : JAVA(전자정부표준프레임워크) / 기타사항 : Websquare 5.0 / Spring'],
];
const before = tableEm(krs);
const out = wrapTableCells(krs);
const after = tableEm(out);
check(`② 넓은 표(${before.toFixed(0)}em)가 상한(${TABLE_MAX_EM}em) 안으로 (${after.toFixed(1)}em)`, before > TABLE_MAX_EM && after <= TABLE_MAX_EM + 0.01, { before, after });
check('② 좁은 열(구분)은 줄바꿈하지 않는다', out.every((r) => !r[0].includes('<br>')), out.map((r) => r[0]));
check('② 넓은 열에 <br> 이 들어갔다', out[1][2].includes('<br>') && out[2][1].includes('<br>'));
check('② 글자는 하나도 잃지 않는다(빈칸·<br> 빼고 같음)',
  out.flat().map((c) => c.replace(/<br>/g, '').replace(/\s+/g, '')).join('|') === krs.flat().map((c) => c.replace(/\s+/g, '')).join('|'));
check('② 빈칸에서만 끊는다 — <br> 를 빈칸으로 되돌리면 원문과 같다',
  out.every((r, i) => r.every((c, j) => c.replace(/<br>/g, ' ') === krs[i][j].replace(/\s+/g, ' '))));
check('② 머리글은 그대로', JSON.stringify(out[0]) === JSON.stringify(krs[0]));

// ③ 이미 있는 <br> 은 줄로 존중한다
const pre = [['a', '짧음<br>' + '아주 긴 글 '.repeat(20).trim()], ['b', '짧음']];
const preOut = wrapTableCells(pre, 30);
check('③ 원래 있던 <br> 앞의 줄은 그대로 첫 줄', preOut[0][1].startsWith('짧음<br>'));

// ④ 링크·코드는 끊지 않는다
const link = '[아주 긴 링크 이름 이것은 끊으면 안 된다](https://example.com/a/b/c) 그리고 `코드 조각 그대로` 끝';
const ws = wrapLine(link, 6);
check('④ 링크는 한 덩어리', ws.some((l) => l.includes('[아주 긴 링크 이름 이것은 끊으면 안 된다](https://example.com/a/b/c)')));
check('④ 코드는 한 덩어리', ws.some((l) => l.includes('`코드 조각 그대로`')));

// ⑤ 빈칸 없이 긴 한글은 글자 단위로 끊는다
const long = wrapLine('가'.repeat(30), 10);
check(`⑤ 빈칸 없는 30자 → 10em 씩 ${long.length}줄`, long.length === 3 && long.every((l) => textEm(l) <= 10), long);

// ⑥ 최소 열 폭 — 열이 많아도 8em 아래로 줄이지 않는다
const many = [Array.from({ length: 12 }, (_, i) => `열${i} ` + '내용 '.repeat(10).trim())];
const manyOut = wrapTableCells(many);
check('⑥ 열이 많으면 상한을 넘더라도 각 열은 최소 폭을 지킨다', manyOut[0].every((c) => c.split('<br>').every((l) => textEm(l) <= Math.max(8, TABLE_MAX_EM / 12) + 1)), manyOut[0][0]);

// ⑦ 파서 경로 — md 표가 노드(blockPlacement 'node')·노트 어디로 가든 줄바꿈된다
const md = ['# 맵', '## 유지관리 대상', '',
  '| 구분 | 상세 구성 |', '| --- | --- |',
  `| POS | ${krs[1][2]} |`, ''].join('\n');
const asNode = JSON.stringify(parseEmm(md, 'mindmap', { blockPlacement: 'node' }));
const asNote = JSON.stringify(parseEmm(md, 'mindmap', { blockPlacement: 'note' }));
check('⑦ 노드에 넣은 표의 긴 셀에 <br>', asNode.includes('<br>'));
check('⑦ 노트에 넣은 표의 긴 셀에 <br>', asNote.includes('<br>'));
const short = ['# 맵', '## 표', '', '| a | b |', '| --- | --- |', '| 1 | 2 |', ''].join('\n');
check('⑦ 짧은 표는 <br> 없음', !JSON.stringify(parseEmm(short, 'mindmap', { blockPlacement: 'node' })).includes('<br>'));

if (failed) { console.error(`\n${failed}건 실패`); process.exit(1); }
console.log('\ntable-wrap 전부 통과');
