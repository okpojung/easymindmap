// mdTable — 노드 텍스트 안의 Markdown 표를 감지·측정한다.
// (향후 Markdown 파일 가져오기를 대비 — 노드 내용에 MD 표가 들어오면
//  원문 파이프 문자열 대신 실제 표로 그린다. markmap 스타일.)
//
//   | 헤더A | 헤더B |
//   | ----- | ----- |
//   | 값1   | 값2   |
//
// 감지 규칙: 파이프(|) 행 바로 다음 줄이 구분선 행(각 셀이 :?-{2,}:? 형태)
// 이면 표 시작. 이어지는 파이프 행들을 데이터 행으로 소비한다.
// 표는 노드당 첫 번째 것 하나만 표로 그리고, 나머지 텍스트는 그대로 둔다.
//
// sizeNodeForText()가 박스 크기 계산에, NodeRenderer가 실제 그리기에 같은
// layoutMdTable() 결과를 사용해 편집기·레이아웃이 항상 일치한다.

const CJK_RE = /[\u3000-\u9FFF\uAC00-\uD7AF]/;

// sizeNodeForText와 동일한 근사 폭 측정 (글꼴 미측정 환경용)
import { stripInlineMarks } from './inlineMarks';

export function measureTextApprox(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of Array.from(s)) {
    if (CJK_RE.test(ch)) w += fontSize * 1.0;
    else if (ch === ' ') w += fontSize * 0.34;
    else if (/\d/.test(ch)) w += fontSize * 0.62;
    // 대문자 라틴은 소문자보다 넓다 (KISTI·NHN·POS 등 약어가 많은 노드가
    // 0.55 배율로는 과소측정되어 텍스트가 테두리를 넘던 문제 보정)
    else if (/[A-Z]/.test(ch)) w += fontSize * 0.72;
    else w += fontSize * 0.55;
  }
  return w;
}

/** GFM 열 정렬 — 구분선 행의 콜론(`:---` 왼쪽 · `:---:` 가운데 · `---:` 오른쪽). null = 지정 없음(왼쪽) */
export type MdTableAlign = 'left' | 'center' | 'right' | null;

/** 구분선 셀 하나 → 정렬. 구분선이 아니면 null */
export function alignOfSepCell(cell: string): MdTableAlign {
  const c = cell.trim();
  if (!/^:?-{2,}:?$/.test(c)) return null;
  const l = c.startsWith(':'), r = c.endsWith(':');
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
}

/** 정렬 → 구분선 셀 (`---` · `:---` · `:---:` · `---:`) */
export function sepCellOfAlign(a: MdTableAlign): string {
  return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---';
}

export interface MdTableParse {
  before: string; // 표 앞의 일반 텍스트 (없으면 '')
  after: string; // 표 뒤의 일반 텍스트 (없으면 '')
  headers: string[];
  rows: string[][];
  /** 열별 GFM 정렬 (구분선 행에서 읽음, 2026-09-17). 길이 = headers.length */
  aligns: MdTableAlign[];
}

export interface MdTableLayout extends MdTableParse {
  colWs: number[]; // 열별 픽셀 폭 (패딩 포함)
  rowH: number; // 행 높이
  cellFs: number; // 셀 글자 크기
  w: number; // 표 전체 폭
  h: number; // 표 전체 높이 (헤더 + 데이터 행)
}

const CELL_PAD_X = 6; // 셀 좌우 여백
const MIN_COL_W = 26;

function isPipeRow(line: string): boolean {
  const s = line.trim();
  return s.length > 1 && s.includes('|');
}

/**
 * GFM 규칙: 셀 안의 `|` 는 `\\|` 로 이스케이프한다 (2026-09-17 — 예전엔 `¦` 로
 * 바꿨다). 이스케이프를 존중해 셀을 나눈다. 기본은 표시용으로 `\\|` → `|`,
 * keepEscape 면 원문 그대로(노드 글자에 되쓸 때).
 */
export function splitPipeCells(line: string, opts?: { keepEscape?: boolean }): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') { cur += opts?.keepEscape ? '\\|' : '|'; i++; continue; }
    if (ch === '|') { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** 셀 글자 → 표 원문용 (`|` → `\\|`) */
export function escapePipe(s: string): string {
  return String(s ?? '').replace(/\|/g, '\\|');
}

function splitCells(line: string): string[] {
  return splitPipeCells(line);
}

function isSeparatorRow(line: string): boolean {
  if (!isPipeRow(line)) return false;
  const cells = splitCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

// 두 문법을 모두 지원한다 (노트 표 블록과 동일한 사용감):
//   ① Markdown 표 — 헤더 행 다음에 구분선 행(|---|---|)이 있는 형태
//   ② 단순 파이프 표 — 구분선 없이 파이프 행이 2줄 이상 연속 (줄=행,
//      |=열, 첫 행=헤더). 헤더가 2칸 이상이어야 표로 인정해
//      본문 속 파이프 한 줄이 표로 오인되는 것을 막는다.
/**
 * lines[i] 에서 시작하는 표를 읽는다 — 아니면 null. `end` = 표 다음 줄 인덱스.
 * (`splitNodeParts` 가 코드 펜스와 함께 원문 순서대로 훑을 때 쓴다, 2026-09-22)
 */
export function parseTableAt(lines: string[], i: number): { headers: string[]; rows: string[][]; aligns: MdTableAlign[]; end: number } | null {
  if (i >= lines.length - 1) return null;
  if (!isPipeRow(lines[i]) || isSeparatorRow(lines[i])) return null;
  if (!isPipeRow(lines[i + 1])) return null; // 다음 줄도 파이프 행이어야 표
  const headers = splitCells(lines[i]);
  if (headers.length < 2) return null;
  let j = i + 1;
  let aligns: MdTableAlign[] = headers.map(() => null);
  if (isSeparatorRow(lines[j])) {
    // MD 구분선 행 — 건너뛰되 GFM 정렬 콜론은 읽는다
    const sep = splitCells(lines[j]);
    aligns = headers.map((_, c) => alignOfSepCell(sep[c] ?? ''));
    j++;
  }
  const rows: string[][] = [];
  while (j < lines.length && isPipeRow(lines[j]) && !isSeparatorRow(lines[j])) {
    const cells = splitCells(lines[j]);
    // 열 수를 헤더에 맞춘다 (모자라면 빈 칸, 넘치면 자름)
    while (cells.length < headers.length) cells.push('');
    rows.push(cells.slice(0, headers.length));
    j++;
  }
  if (rows.length === 0) return null; // 데이터 행 없는 표는 무시
  return { headers, rows, aligns, end: j };
}

export function parseMdTable(text: string): MdTableParse | null {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    const t = parseTableAt(lines, i);
    if (!t) continue;
    return {
      before: lines.slice(0, i).join('\n').trimEnd(),
      after: lines.slice(t.end).join('\n').trim(),
      headers: t.headers,
      rows: t.rows,
      aligns: t.aligns,
    };
  }
  return null;
}

/**
 * 글 속의 표 **전부** — 원문 순서대로 (2026-09-22 사용자 보고: 노드에 표를 두 개
 * 넣으면 두 번째가 파이프 원문으로 보였다). 각 항목의 `before` 는 **앞 표 뒤부터**
 * 이 표 앞까지의 일반 텍스트, 마지막 항목의 `after` 만 뒤 텍스트다 (중간 항목의
 * `after` 는 쓰지 않는다).
 */
export function parseMdTables(text: string): MdTableParse[] {
  const out: MdTableParse[] = [];
  let rest = String(text || '');
  for (;;) {
    const t = parseMdTable(rest);
    if (!t) break;
    out.push(t);
    rest = t.after;
    if (out.length > 200) break; // 안전장치
  }
  return out;
}

export interface MdTablesLayout {
  /** 표 측정값 — 원문 순서. `beforeLines` = 이 표 앞에 오는 일반 텍스트의 **수동 줄 수**(누적) */
  tables: (MdTableLayout & { beforeLines: number })[];
  /** 표를 모두 뺀 일반 텍스트 (빈 조각은 빼고 `\n` 으로 이음) */
  plainText: string;
}

/** 표 전부의 측정 — 없으면 null. `sizeNodeForText` · `NodeRenderer` 가 같은 값을 쓴다 */
export function layoutMdTables(text: string, fontSize: number): MdTablesLayout | null {
  const parsed = parseMdTables(text);
  if (parsed.length === 0) return null;
  const parts: string[] = [];
  let count = 0;
  const tables = parsed.map((t, i) => {
    if (t.before) { parts.push(t.before); count += t.before.split('\n').length; }
    const lay = layoutParsedTable(t, fontSize);
    if (i === parsed.length - 1 && t.after) parts.push(t.after);
    return { ...lay, beforeLines: count };
  });
  return { tables, plainText: parts.join('\n') };
}

// fontSize = 노드 본문 글자 크기 (셀은 -2, 최소 10)
export function layoutMdTable(text: string, fontSize: number): MdTableLayout | null {
  const parsed = parseMdTable(text);
  if (!parsed) return null;
  return layoutParsedTable(parsed, fontSize);
}

export function layoutParsedTable(parsed: MdTableParse, fontSize: number): MdTableLayout {

  const cellFs = Math.max(10, fontSize - 2);
  const rowH = cellFs + 10;

  const colWs = parsed.headers.map((h, c) => {
    // 셀 폭은 마커(** 등)를 뺀 표시 텍스트 기준으로 잰다
    let m = measureTextApprox(stripInlineMarks(h), cellFs);
    for (const row of parsed.rows) {
      m = Math.max(m, measureTextApprox(stripInlineMarks(row[c] ?? ''), cellFs));
    }
    return Math.max(MIN_COL_W, Math.ceil(m) + CELL_PAD_X * 2);
  });

  return {
    ...parsed,
    colWs,
    rowH,
    cellFs,
    w: colWs.reduce((a, b) => a + b, 0),
    h: (1 + parsed.rows.length) * rowH,
  };
}

export const MD_TABLE_CELL_PAD_X = CELL_PAD_X;

// 표 위 복사(⧉) 전용 줄 높이 — 아이콘이 표 안(머리글 셀)과 겹치지 않게
// 표 "바깥 오른쪽 위" 스트립에 놓는다 (2026-07-31, 사이징·렌더·뷰어 공용)
export const MD_TABLE_COPY_STRIP = 13;
