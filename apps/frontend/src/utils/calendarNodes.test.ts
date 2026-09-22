// 달력 노드 단위 테스트 (2026-09-22 · 같은 날 수정: 주 노드 문구 · 날짜 노드 7개 · 빨간 날 · 달력 표).
//   npx tsx src/utils/calendarNodes.test.ts

import {
  DIM_DAY_BORDER, DIM_DAY_COLOR, RED_DAY_COLOR, calendarPreview, calendarTable, dayStyle, dayText, fmtDay, monthOutline,
  parseYearMonth, parseYearMonthText, weekLabel, weekOfYear, weekOutline,
} from './calendarNodes';
import { holidayName, holidayTableCovers, isRedDay } from './koreanHolidays';

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

// ⑥ 2026년 9월 — 주 노드 문구 `[36주] 2026/08/30(일) ~ 09/05(토)` · 아래 날짜 노드 7개 (사용자 지정 2026-09-22)
const sep = weekOutline(2026, 9);
check('⑥ 9월은 5주 · 주 노드 문구', sep.map((w) => w.text), [
  '[36주] 2026/08/30(일) ~ 09/05(토)', '[37주] 2026/09/06(일) ~ 09/12(토)', '[38주] 2026/09/13(일) ~ 09/19(토)',
  '[39주] 2026/09/20(일) ~ 09/26(토)', '[40주] 2026/09/27(일) ~ 10/03(토)',
]);
check('⑥ 36주 아래 날짜 노드 7개 (4자리 년도)', sep[0].children.map((c) => c.text), [
  '2026/08/30(일)', '2026/08/31(월)', '2026/09/01(화)', '2026/09/02(수)', '2026/09/03(목)', '2026/09/04(금)', '2026/09/05(토)',
]);
check('⑥ 모든 주가 7개씩', sep.map((w) => w.children.length), [7, 7, 7, 7, 7]);
const DIM = { textColor: DIM_DAY_COLOR, borderColor: DIM_DAY_BORDER, borderStyle: 'dashed' };
check('⑥ 36주: 8월의 08/30(일)·08/31(월)은 회색 점선 · 평일 없음 · 09/05(토) 빨강 (2차 수정)', [sep[0].children[0].style, sep[0].children[1].style, sep[0].children[2].style, sep[0].children[6].style],
  [DIM, DIM, undefined, { textColor: RED_DAY_COLOR }]);
check('⑥ 37주: 일요일 빨강 · 토요일 빨강', [sep[1].children[0].style, sep[1].children[6].style], [{ textColor: RED_DAY_COLOR }, { textColor: RED_DAY_COLOR }]);
// 2026-09-24(목)·25(금)·26(토) 추석 연휴·추석·추석 연휴 → 빨강 + 줄바꿈 [이름]
check('⑥ 39주: 추석 연휴 목·금·토 빨강', sep[3].children.slice(4).map((c) => c.style?.textColor), [RED_DAY_COLOR, RED_DAY_COLOR, RED_DAY_COLOR]);
check('⑥ 39주: 공휴일 노드 글 = 날짜 + 줄바꿈 + [이름]', sep[3].children.slice(4).map((c) => c.text), ['2026/09/24(목)\n[추석 연휴]', '2026/09/25(금)\n[추석]', '2026/09/26(토)\n[추석 연휴]']);
check('⑥ 40주: 10월의 10/01~10/03 은 회색 점선 (개천절이라도 다른 달이면 희미하게)', sep[4].children.slice(4).map((c) => c.style), [DIM, DIM, DIM]);
check('⑥ 40주: 10/03(토) 글에는 [개천절]', sep[4].children[6].text, '2026/10/03(토)\n[개천절]');
// ⑦ 1월 — 첫 주가 전년 12월에서 시작해도 01주, 두 자리 패딩. 해가 다르면 끝 날짜에도 년도
const jan = weekOutline(2026, 1);
check('⑦ 2026년 1월 첫 주 = [01주] 2025/12/28(일) ~ 2026/01/03(토)', jan[0].text, '[01주] 2025/12/28(일) ~ 2026/01/03(토)');
check('⑦ 1월 첫 주 날짜 7개 · 01/01(목) 신정 빨강 + [신정] · 12월 날들은 희미하게', [jan[0].children.map((c) => c.text), jan[0].children[4].style, jan[0].children[0].style], [
  ['2025/12/28(일)', '2025/12/29(월)', '2025/12/30(화)', '2025/12/31(수)', '2026/01/01(목)\n[신정]', '2026/01/02(금)', '2026/01/03(토)'],
  { textColor: RED_DAY_COLOR }, DIM,
]);
check('⑦ 1월은 5주 (01~05)', jan.map((w) => w.text.slice(0, 5)), ['[01주]', '[02주]', '[03주]', '[04주]', '[05주]']);
// ⑧ 12월 — 마지막 주가 다음 해로 넘어가도 53주 (이 해 번호)
const dec = weekOutline(2026, 12);
check('⑧ 2026년 12월 마지막 주 = [53주] 2026/12/27(일) ~ 2027/01/02(토)', dec[dec.length - 1].text, '[53주] 2026/12/27(일) ~ 2027/01/02(토)');
check('⑧ weekLabel 직접', weekLabel(new Date(2026, 7, 30), 2026), '[36주] 2026/08/30(일) ~ 09/05(토)');

// ⑨ 공휴일 — 고정 · 연도별 표 · 표 밖의 해
check('⑨ 2026-10-09(금) 한글날', [holidayName(new Date(2026, 9, 9)), dayStyle(new Date(2026, 9, 9)), dayText(new Date(2026, 9, 9))], ['한글날', { textColor: RED_DAY_COLOR }, '2026/10/09(금)\n[한글날]']);
check('⑨ dayStyle 에 달을 주면 다른 달은 희미하게, 같은 달 토요일은 빨강', [dayStyle(new Date(2026, 9, 9), 9), dayStyle(new Date(2026, 8, 5), 9)], [DIM, { textColor: RED_DAY_COLOR }]);
check('⑨ 2026-03-02(월) 삼일절 대체공휴일', holidayName(new Date(2026, 2, 2)), '삼일절 대체공휴일');
check('⑨ 2026-09-25(금) 추석', holidayName(new Date(2026, 8, 25)), '추석');
check('⑨ 2027-02-07(일) 설날', holidayName(new Date(2027, 1, 7)), '설날');
check('⑨ 2026-09-22(화) 는 공휴일 아님', [holidayName(new Date(2026, 8, 22)), dayStyle(new Date(2026, 8, 22)), isRedDay(new Date(2026, 8, 22)), dayText(new Date(2026, 8, 22))], [null, undefined, false, '2026/09/22(화)']);
check('⑨ 표 범위 2024~2030', [holidayTableCovers(2024), holidayTableCovers(2030), holidayTableCovers(2031), holidayTableCovers(2023)], [true, true, false, false]);
check('⑨ 표 밖의 해(2035)는 고정 공휴일만', [holidayName(new Date(2035, 7, 15)), holidayName(new Date(2035, 1, 10))], ['광복절', null]);

// ⑩ 달력 표 (GFM) — 일~토 7열 · 다른 달은 빈 칸 · 일요일·공휴일 굵게 + 이름
const tbl = calendarTable(2026, 9).split('\n');
check('⑩ 헤더 · 가운데 정렬', tbl.slice(0, 2), ['| 일 | 월 | 화 | 수 | 목 | 금 | 토 |', '|:---:|:---:|:---:|:---:|:---:|:---:|:---:|']);
check('⑩ 첫 행: 8/30·31 은 빈 칸, 9/1(화)~', tbl[2], '|  |  | 1 | 2 | 3 | 4 | 5 |');
check('⑩ 셋째 행(9/13~19): 일요일 13 굵게', tbl[4], '| **13** | 14 | 15 | 16 | 17 | 18 | 19 |');
check('⑩ 넷째 행(9/20~26): 추석 연휴 굵게, 이름은 없음 (2차 수정)', tbl[5], '| **20** | 21 | 22 | 23 | **24** | **25** | **26** |');
check('⑩ 표에는 공휴일 이름이 없다', calendarTable(2026, 10).includes('개천절') || calendarTable(2026, 10).includes('한글날'), false);
check('⑩ 마지막 행: 27~30, 10월은 빈 칸', tbl[6], '| **27** | 28 | 29 | 30 |  |  |  |');
check('⑩ 5주 = 헤더 2 + 5행', tbl.length, 7);

// ⑪ 월 노드 · 미리보기 · 날짜 형식
check('⑪ 월 노드 12개', monthOutline().map((m) => m.text), ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']);
check('⑪ 미리보기(년)', calendarPreview(2026), '2026년 → 1월 … 12월 (12개)');
check('⑪ 미리보기(년월)', calendarPreview(2026, 9), '2026년 9월 → [36주] … [40주] (5주, 각 주 아래 일~토 날짜 노드 7개)');
check('⑪ 미리보기(표)', calendarPreview(2026, 9, true), '2026년 9월 → 노드 내용에 달력 표 (일~토 7열 × 5주)');
check('⑪ 날짜 형식 YYYY/MM/DD(요일)', fmtDay(new Date(2026, 8, 22)), '2026/09/22(화)');

console.log(failed ? `\n${failed}개 실패` : '\n모두 통과');
if (failed) process.exit(1);
