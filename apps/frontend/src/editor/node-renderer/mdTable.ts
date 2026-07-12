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
export function measureTextApprox(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of Array.from(s)) {
    if (CJK_RE.test(ch)) w += fontSize * 1.0;
    else if (ch === ' ') w += fontSize * 0.34;
    else if (/\d/.test(ch)) w += fontSize * 0.58;
    else w += fontSize * 0.55;
  }
  return w;
}

export interface MdTableParse {
  before: string; // 표 앞의 일반 텍스트 (없으면 '')
  after: string; // 표 뒤의 일반 텍스트 (없으면 '')
  headers: string[];
  rows: string[][];
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

function splitCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
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
export function parseMdTable(text: string): MdTableParse | null {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (!isPipeRow(lines[i]) || isSeparatorRow(lines[i])) continue;
    if (!isPipeRow(lines[i + 1])) continue; // 다음 줄도 파이프 행이어야 표

    const headers = splitCells(lines[i]);
    if (headers.length < 2) continue;

    let j = i + 1;
    if (isSeparatorRow(lines[j])) j++; // MD 구분선 행은 건너뛴다 (선택 사항)

    const rows: string[][] = [];
    while (j < lines.length && isPipeRow(lines[j]) && !isSeparatorRow(lines[j])) {
      const cells = splitCells(lines[j]);
      // 열 수를 헤더에 맞춘다 (모자라면 빈 칸, 넘치면 자름)
      while (cells.length < headers.length) cells.push('');
      rows.push(cells.slice(0, headers.length));
      j++;
    }
    if (rows.length === 0) continue; // 데이터 행 없는 표는 무시

    return {
      before: lines.slice(0, i).join('\n').trimEnd(),
      after: lines.slice(j).join('\n').trim(),
      headers,
      rows,
    };
  }
  return null;
}

// fontSize = 노드 본문 글자 크기 (셀은 -2, 최소 10)
export function layoutMdTable(text: string, fontSize: number): MdTableLayout | null {
  const parsed = parseMdTable(text);
  if (!parsed) return null;

  const cellFs = Math.max(10, fontSize - 2);
  const rowH = cellFs + 10;

  const colWs = parsed.headers.map((h, c) => {
    let m = measureTextApprox(h, cellFs);
    for (const row of parsed.rows) m = Math.max(m, measureTextApprox(row[c] ?? '', cellFs));
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
