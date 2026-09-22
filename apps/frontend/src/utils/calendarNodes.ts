// 달력 노드 — 년도/년월을 읽어 월 노드(1월~12월) 또는 주 노드(NN주 → 일~토 범위)
// 아웃라인을 만든다 (2026-09-22 사용자 요청: 우상단 [+] 메뉴의 "달력 노드 추가").
//
// 규칙 (사용자 지정):
//   · 년도만  (2026년 · 26년 · 2026 · 26)          → 하위에 1월 … 12월
//   · 년도+월 (2026년9월 · 2026년 09월 · 26년9월 · 26년09월 · 2026/09 · 26/09 …)
//                                                  → 하위에 그 달에 걸친 주마다 `NN주`,
//                                                    그 아래 `YY/MM/DD(일) ~ YY/MM/DD(토)`
//   · 월만 (9월) 이고 조상 노드에 년도가 있으면 그 년도를 쓴다 (2026년 → 9월 → 주)
// 주 번호 = 그 해 1월 1일이 든 주가 1주, 일요일 시작 (달력 관행). 12월 마지막 주가
// 다음 해 1월로 넘어가도 이 해 번호(53주)로 센다.
// 사양: docs/03-editor-core/canvas/10-canvas.md §21.2 · 사용자 가이드 03.

import type { OutlineItem } from '@/utils/outlineLines';

export interface YearMonth { year?: number; month?: number }

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

/** YY/MM/DD(요일) */
export function fmtDay(d: Date): string {
  return `${pad2(d.getFullYear() % 100)}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${DOW[d.getDay()]})`;
}

const DAY = 86400000;
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);

/** 그 해의 주 번호 — 1월 1일이 든 주(일요일 시작)가 1주 */
export function weekOfYear(d: Date, year = d.getFullYear()): number {
  const jan1 = new Date(year, 0, 1);
  const firstSunday = utc(year, 0, 1 - jan1.getDay());
  return Math.floor((utc(d.getFullYear(), d.getMonth(), d.getDate()) - firstSunday) / (7 * DAY)) + 1;
}

/** 1월 … 12월 */
export function monthOutline(): OutlineItem[] {
  return Array.from({ length: 12 }, (_, i) => ({ text: `${i + 1}월`, children: [] }));
}

/** 그 달에 걸친 주들 — `NN주` → `YY/MM/DD(일) ~ YY/MM/DD(토)` */
export function weekOutline(year: number, month: number): OutlineItem[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const out: OutlineItem[] = [];
  const sunday = new Date(year, month - 1, 1 - first.getDay());
  for (let s = sunday; s <= last; s = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7)) {
    const sat = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    out.push({
      text: `${pad2(weekOfYear(s, year))}주`,
      children: [{ text: `${fmtDay(s)} ~ ${fmtDay(sat)}`, children: [] }],
    });
  }
  return out;
}

/** 대화상자 미리보기 한 줄 */
export function calendarPreview(year: number, month?: number): string {
  if (!month) return `${year}년 → 1월 … 12월 (12개)`;
  const w = weekOutline(year, month);
  return `${year}년 ${month}월 → ${w[0].text} … ${w[w.length - 1].text} (${w.length}주, 각 주 아래 일~토 범위)`;
}
