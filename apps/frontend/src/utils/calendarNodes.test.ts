// 달력 노드 단위 테스트 (2026-09-22).   npx tsx src/utils/calendarNodes.test.ts

import { calendarPreview, fmtDay, monthOutline, parseYearMonth, parseYearMonthText, weekOfYear, weekOutline } from './calendarNodes';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${JSON.stringify(got)}\n      기대 ${JSON.stringify(want)}`}`);
}

// ① 년도만 — 사용자가 든 네 꼴
for (const [s, y] of [['2026년', 2026], ['26년', 2026], ['2026', 2026], ['26', 2026], ['2026년 계획', 2026], ['계획 2026', 2026]] as const) {
  check(`① "${s}" → ${y}`, parseYearMonthText(s), { year: y });
}
// ② 년도 + 월 — 사용자가 든 꼴들
for (const s of ['2026년9월', '2026년 09월', '26년9월', '26년09월', '2026/09', '26/09', '2026-9', '2026.09 실적', '2026년 9월 매출']) {
  check(`② "${s}" → 2026/9`, parseYearMonthText(s), { year: 2026, month: 9 });
}
// ③ 안 읽히는 것 · 월만
check('③ "3. 세부 기능 목록" 은 년도가 아니다', parseYearMonthText('3. 세부 기능 목록'), {});
check('③ "13" 은 두 자리 → 2013 (사용자 규칙: 두 자리 숫자만 있으면 년도)', parseYearMonthText('13'), { year: 2013 });
check('③ "2026/13" 은 월이 아니다 → 년도만', parseYearMonthText('2026/13'), { year: 2026 });
check('③ "9월" → 월만', parseYearMonthText('9월'), { month: 9 });
check('③ 날짜 "26/09/15" 는 년월로 읽는다', parseYearMonthText('26/09/15'), { year: 2026, month: 9 });
check('③ 빈 글 → 없음', parseYearMonthText(''), {});
// ④ 조상에서 년도 — "2026년" → "9월" 선택
check('④ 월만 + 조상 년도', parseYearMonth('9월', ['2026년', '중심']), { year: 2026, month: 9 });
check('④ 자기 글에 년도가 있으면 조상은 안 본다', parseYearMonth('2025년 3월', ['2026년']), { year: 2025, month: 3 });
check('④ 아무것도 없고 조상에 년도 → 년도만', parseYearMonth('메모', ['9월', '2026년']), { year: 2026 });
check('④ 조상 "9월" 은 년도가 아니라 건너뛴다', parseYearMonth('메모', ['9월']), {});

// ⑤ 주 번호 — 2026년 1월 1일(목)이 든 주가 1주 (일요일 시작: 2025-12-28 ~ 2026-01-03)
check('⑤ 2026-01-01 → 1주', weekOfYear(new Date(2026, 0, 1)), 1);
check('⑤ 2026-01-03(토) → 1주 · 01-04(일) → 2주', [weekOfYear(new Date(2026, 0, 3)), weekOfYear(new Date(2026, 0, 4))], [1, 2]);
check('⑤ 2026-08-30(일) → 36주', weekOfYear(new Date(2026, 7, 30)), 36);
check('⑤ 2025-12-28(일) 을 2026년 기준으로 세면 1주', weekOfYear(new Date(2025, 11, 28), 2026), 1);

// ⑥ 2026년 9월 — 36주 ~ 40주, 첫 주 26/08/30(일) ~ 26/09/05(토)
const sep = weekOutline(2026, 9);
check('⑥ 9월은 5주', sep.map((w) => w.text), ['36주', '37주', '38주', '39주', '40주']);
check('⑥ 36주 → 26/08/30(일) ~ 26/09/05(토)', sep[0].children[0].text, '26/08/30(일) ~ 26/09/05(토)');
check('⑥ 40주 → 26/09/27(일) ~ 26/10/03(토)', sep[4].children[0].text, '26/09/27(일) ~ 26/10/03(토)');
// ⑦ 1월 — 첫 주가 전년 12월에서 시작해도 01주, 두 자리 패딩
const jan = weekOutline(2026, 1);
check('⑦ 2026년 1월 첫 주 = 01주 · 25/12/28(일) ~ 26/01/03(토)', [jan[0].text, jan[0].children[0].text], ['01주', '25/12/28(일) ~ 26/01/03(토)']);
check('⑦ 1월은 5주 (01~05)', jan.map((w) => w.text), ['01주', '02주', '03주', '04주', '05주']);
// ⑧ 12월 — 마지막 주가 다음 해로 넘어가도 53주 (이 해 번호)
const dec = weekOutline(2026, 12);
check('⑧ 2026년 12월 마지막 주 = 53주 · 26/12/27(일) ~ 27/01/02(토)', [dec[dec.length - 1].text, dec[dec.length - 1].children[0].text], ['53주', '26/12/27(일) ~ 27/01/02(토)']);
// ⑨ 월 노드 · 미리보기 · 날짜 형식
check('⑨ 월 노드 12개', monthOutline().map((m) => m.text), ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']);
check('⑨ 미리보기(년)', calendarPreview(2026), '2026년 → 1월 … 12월 (12개)');
check('⑨ 미리보기(년월)', calendarPreview(2026, 9), '2026년 9월 → 36주 … 40주 (5주, 각 주 아래 일~토 범위)');
check('⑨ 날짜 형식 YY/MM/DD(요일)', fmtDay(new Date(2026, 8, 22)), '26/09/22(화)');

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
