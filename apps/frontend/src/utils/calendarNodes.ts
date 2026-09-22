// 달력 노드 — 년도/년월을 읽어 월 노드(1월~12월) 또는 주 노드 아웃라인, 또는 달력 표를
// 만든다 (2026-09-22 사용자 요청: 우상단 [+] 메뉴의 "달력 노드 추가").
//
// 규칙 (사용자 지정, 2026-09-22 수정 반영):
//   · 년도만  (2026년 · 26년 · 2026 · 26)          → 하위에 1월 … 12월
//   · 년도+월 (2026년9월 · 26년09월 · 2026/09 · 26/09 …) → 그 달에 걸친 주마다
//         `[36주] 2026/08/30(일) ~ 09/05(토)` 노드, 그 아래 **날짜 노드 7개**
//         `2026/08/30(일)` … `2026/09/05(토)`. 일요일·토요일·공휴일은 빨간 글자, 공휴일은
//         줄을 바꿔 `[추석]` 처럼 이름을 붙인다. 고른 달이 아닌 날(앞뒤 달)은 회색 글자 +
//         점선 테두리로 희미하게 (2026-09-22 사용자 수정 2차).
//   · 월만 (9월) 이고 조상 노드에 년도가 있으면 그 년도를 쓴다 (2026년 → 9월 → 주)
//   · "표로 붙여넣기" — 노드 내용에 그 달의 달력 표(일~토 7열, 주마다 한 행)를 붙인다.
//         일요일·공휴일 날짜는 **굵게** (이름은 넣지 않는다 — 칸이 넓어진다).
// 주 번호 = 그 해 1월 1일이 든 주가 1주, 일요일 시작 (달력 관행). 12월 마지막 주가
// 다음 해 1월로 넘어가도 이 해 번호(53주)로 센다.
// 사양: docs/03-editor-core/canvas/10-canvas.md §21.2 · 사용자 가이드 03.

import type { NodeStyle } from '@emm/model';
import type { OutlineItem } from '@/utils/outlineLines';
import { buildMdTable } from '@/editor/node-renderer/TableDialog';
import { holidayName } from '@/utils/koreanHolidays';

export interface YearMonth { year?: number; month?: number }

/** 빨간 날(일요일·토요일·공휴일) 글자색 */
export const RED_DAY_COLOR = '#DC2626';
/** 고른 달이 아닌 날 — 회색 글자 + 점선 테두리 */
export const DIM_DAY_COLOR = '#A3A3A3';
export const DIM_DAY_BORDER = '#CFCFCF';

const toYear = (s: string): number => {
  const n = Number(s);
  return s.length === 2 ? 2000 + n : n;
};
const validYear = (y: number) => y >= 1900 && y <= 2199;
const validMonth = (m: number) => m >= 1 && m <= 12;

/** 글 하나에서 년도·월을 읽는다. 없으면 빈 객체 */
export function parseYearMonthText(text: string): YearMonth {
  const t = String(text ?? '').trim();
  // 년 + 월 (한글)
  let m = t.match(/(?<!\d)(\d{4}|\d{2})\s*년\s*(\d{1,2})\s*월/);
  if (m) {
    const y = toYear(m[1]), mo = Number(m[2]);
    if (validYear(y) && validMonth(mo)) return { year: y, month: mo };
  }
  // 년/월 (구분자 · 뒤에 일(日)이 더 붙으면 날짜라 보고 년월만 읽는다)
  m = t.match(/(?<!\d)(\d{4}|\d{2})\s*[\/.\-]\s*(\d{1,2})(?!\d)/);
  if (m) {
    const y = toYear(m[1]), mo = Number(m[2]);
    if (validYear(y) && validMonth(mo)) return { year: y, month: mo };
  }
  // 년도만
  m = t.match(/(?<!\d)(\d{4})\s*년?(?!\d)/);
  if (m && validYear(Number(m[1]))) {
    const monthOnly = t.match(/(?<!\d)(\d{1,2})\s*월/);
    return { year: Number(m[1]), ...(monthOnly && validMonth(Number(monthOnly[1])) ? { month: Number(monthOnly[1]) } : {}) };
  }
  m = t.match(/(?<!\d)(\d{2})\s*년(?!\d)/);
  if (m) return { year: 2000 + Number(m[1]) };
  if (/^\d{2}$/.test(t)) return { year: 2000 + Number(t) };
  // 월만
  m = t.match(/(?<!\d)(\d{1,2})\s*월(?!\d)/);
  if (m && validMonth(Number(m[1]))) return { month: Number(m[1]) };
  return {};
}

/**
 * 노드 글 + 조상 글들(가까운 것부터)에서 년도·월을 정한다.
 * 노드에 월만 있으면 조상에서 년도를 찾는다. 노드에 아무것도 없으면 조상의 년도(있으면)만.
 */
export function parseYearMonth(text: string, ancestors: string[] = []): YearMonth {
  const own = parseYearMonthText(text);
  if (own.year) return own;
  for (const a of ancestors) {
    const p = parseYearMonthText(a);
    if (p.year) return own.month ? { year: p.year, month: own.month } : { year: p.year };
  }
  return own;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];

/** YYYY/MM/DD(요일) */
export function fmtDay(d: Date): string {
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${DOW[d.getDay()]})`;
}
/** MM/DD(요일) — 같은 해 안의 끝 날짜에 */
const fmtDayShort = (d: Date) => `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${DOW[d.getDay()]})`;

const DAY = 86400000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** 그 해의 주 번호 — 1월 1일이 든 주(일요일 시작)가 1주 */
export function weekOfYear(d: Date, year = d.getFullYear()): number {
  const jan1 = new Date(year, 0, 1);
  const firstSunday = utc(year, 0, 1 - jan1.getDay());
  return Math.floor((utc(d.getFullYear(), d.getMonth(), d.getDate()) - firstSunday) / (7 * DAY)) + 1;
}

/**
 * 날짜 노드의 스타일 — 고른 달(month, 1~12)이 아닌 날은 회색 글자 + 점선 테두리,
 * 일요일·토요일·공휴일은 빨간 글자, 평일은 없음
 */
export function dayStyle(d: Date, month?: number): NodeStyle | undefined {
  if (month && d.getMonth() !== month - 1) return { textColor: DIM_DAY_COLOR, borderColor: DIM_DAY_BORDER, borderStyle: 'dashed' };
  if (d.getDay() === 0 || d.getDay() === 6 || holidayName(d)) return { textColor: RED_DAY_COLOR };
  return undefined;
}

/** 날짜 노드 글 — `2026/09/25(금)`, 공휴일이면 줄을 바꿔 `[추석]` */
export function dayText(d: Date): string {
  const hol = holidayName(d);
  return hol ? `${fmtDay(d)}\n[${hol}]` : fmtDay(d);
}

/** 1월 … 12월 */
export function monthOutline(): OutlineItem[] {
  return Array.from({ length: 12 }, (_, i) => ({ text: `${i + 1}월`, children: [] }));
}

/** 그 달에 걸친 주(일~토)의 첫 일요일들 */
function weekStarts(year: number, month: number): Date[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const out: Date[] = [];
  for (let s = addDays(first, -first.getDay()); s <= last; s = addDays(s, 7)) out.push(s);
  return out;
}

/** 주 노드 문구 — `[36주] 2026/08/30(일) ~ 09/05(토)` (해가 바뀌면 끝 날짜에도 년도) */
export function weekLabel(sunday: Date, year: number): string {
  const sat = addDays(sunday, 6);
  const end = sat.getFullYear() === sunday.getFullYear() ? fmtDayShort(sat) : fmtDay(sat);
  return `[${pad2(weekOfYear(sunday, year))}주] ${fmtDay(sunday)} ~ ${end}`;
}

/** 그 달에 걸친 주들 — `[NN주] 시작 ~ 끝` → 날짜 노드 7개 (빨간 날 · 공휴일 이름 · 다른 달은 희미하게) */
export function weekOutline(year: number, month: number): OutlineItem[] {
  return weekStarts(year, month).map((s) => ({
    text: weekLabel(s, year),
    children: Array.from({ length: 7 }, (_, i) => {
      const d = addDays(s, i);
      const style = dayStyle(d, month);
      return { text: dayText(d), children: [], ...(style ? { style } : {}) };
    }),
  }));
}

/**
 * 달력 표 (GFM) — 일~토 7열, 그 달에 걸친 주마다 한 행. 다른 달의 날은 빈 칸.
 * 일요일·공휴일은 **굵게** (이름은 넣지 않는다 — 2026-09-22 사용자 수정 2차).
 */
export function calendarTable(year: number, month: number): string {
  const rows = weekStarts(year, month).map((s) =>
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(s, i);
      if (d.getMonth() !== month - 1) return '';
      return d.getDay() === 0 || holidayName(d) ? `**${d.getDate()}**` : String(d.getDate());
    }));
  return buildMdTable(DOW, rows, DOW.map(() => 'center'));
}

/** 대화상자 미리보기 한 줄 */
export function calendarPreview(year: number, month?: number, asTable = false): string {
  if (!month) return `${year}년 → 1월 … 12월 (12개)`;
  const w = weekStarts(year, month);
  if (asTable) return `${year}년 ${month}월 → 노드 내용에 달력 표 (일~토 7열 × ${w.length}주)`;
  const first = pad2(weekOfYear(w[0], year)), last = pad2(weekOfYear(w[w.length - 1], year));
  return `${year}년 ${month}월 → [${first}주] … [${last}주] (${w.length}주, 각 주 아래 일~토 날짜 노드 7개)`;
}
