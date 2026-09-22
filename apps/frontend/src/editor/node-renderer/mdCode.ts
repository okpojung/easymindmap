// mdCode — 노드 텍스트 "안"의 Markdown 코드 펜스(```)를 노드 본문 블록
// (모노스페이스 + 회색 패널)으로 렌더하기 위한 파서/레이아웃.
// mdTable.ts 와 같은 통합 방식: sizeNodeForText 가 코드 구간을 일반
// 줄바꿈에서 제외하고 패널 크기를 노드 크기에 더하며, NodeRenderer 와
// HTML 뷰어가 같은 규칙으로 그린다. (리치 노드 P1 — rich-node-content.md)
//
// 파싱 규칙 (parseMdCode = 첫 블록. 여러 블록은 nodeBlocks.splitNodeParts, 2026-09-22):
//   ```lang        ← 여는 펜스 (lang 라벨 선택)
//   코드 줄들       ← 원문 그대로 (공백 보존, 인라인 마크 미적용)
//   ```            ← 닫는 펜스 (없으면 텍스트 끝까지)
// 빈 코드(줄 0)는 블록으로 만들지 않는다.

import { cellWidth, lineCells } from '@/utils/monoGrid';

export interface MdCodeParse {
  before: string; // 코드 앞 일반 텍스트 ('' 가능)
  after: string; // 코드 뒤 일반 텍스트 ('' 가능)
  code: string[]; // 코드 줄들 (원문 보존)
  lang?: string; // 여는 펜스의 언어 라벨
}

export interface MdCodeLayout extends MdCodeParse {
  codeFs: number; // 코드 글자 크기
  lineH: number; // 코드 줄 높이
  headH: number; // 헤더 행(언어 라벨 + 복사 버튼) 높이
  w: number; // 패널 전체 폭 (패딩 포함)
  h: number; // 패널 전체 높이 (헤더 + 코드 + 패딩)
}

export const MD_CODE_PAD_X = 8;
export const MD_CODE_PAD_Y = 6;
// 헤더(노트 코드 블록과 동일 구성: 언어 라벨 왼쪽 + ⧉ 복사 오른쪽)
export const MD_CODE_HEAD_FS_DELTA = 2; // 헤더 글자 = codeFs - 2 (최소 9)

const FENCE_RE = /^\s*```(.*)$/;

/**
 * lines[i] 가 여는 펜스면 그 코드 블록을 읽는다 — 아니면 null. `end` = 블록 다음 줄
 * 인덱스 (닫는 펜스 뒤, 닫는 펜스가 없으면 lines.length). 빈 코드는 블록이 아니다
 * (그 줄들은 일반 글로 남는다). `splitNodeParts` 가 표와 함께 원문 순서대로 훑는다.
 */
export function parseCodeAt(lines: string[], i: number): { code: string[]; lang?: string; end: number; closed: boolean } | null {
  const open = lines[i]?.match(FENCE_RE);
  if (!open) return null;
  let j = i + 1;
  const code: string[] = [];
  while (j < lines.length && !FENCE_RE.test(lines[j])) {
    code.push(lines[j]);
    j++;
  }
  const closed = j < lines.length; // 닫는 펜스 존재 여부
  if (code.join('').trim() === '') return null; // 빈 코드 블록은 무시
  return { code, lang: open[1].trim() || undefined, end: closed ? j + 1 : lines.length, closed };
}

export function parseMdCode(text: string): MdCodeParse | null {
  const lines = String(text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!FENCE_RE.test(lines[i])) continue;
    const c = parseCodeAt(lines, i);
    if (!c) return null; // 빈 코드 블록 — 예전과 같이 코드 없음으로 본다
    return {
      before: lines.slice(0, i).join('\n').trimEnd(),
      after: c.closed ? lines.slice(c.end).join('\n').trim() : '',
      code: c.code,
      lang: c.lang,
    };
  }
  return null;
}

/**
 * 글 속의 코드 블록 **전부** — 원문 순서 (2026-09-22 사용자 보고: 두 번째 코드
 * 블록이 펜스 원문으로 보였다). 각 항목의 `before` 는 앞 블록 뒤부터, 마지막의
 * `after` 만 뒤 글. (`RichTextHtml` 이 코드 사이 글을 순서대로 그릴 때 쓴다)
 */
export function parseMdCodes(text: string): MdCodeParse[] {
  const out: MdCodeParse[] = [];
  let rest = String(text || '');
  for (;;) {
    const c = parseMdCode(rest);
    if (!c) break;
    out.push(c);
    rest = c.after;
    if (out.length > 200) break;
  }
  return out;
}

// 코드 폭 = **격자 칸 수 × 칸 폭** (utils/monoGrid). 렌더도 같은 격자에
// 글자를 앉히므로 근사가 아니라 정확한 값이다 — 폰트 폴백 때문에 한글
// 줄만 길이가 어긋나 도식이 깨지던 문제를 없앤다 (2026-08-05).
function monoMeasure(s: string, fs: number): number {
  return lineCells(s) * cellWidth(fs);
}

// fontSize = 노드 본문 글자 크기 (코드는 -2, 최소 10 — 노트 코드와 동일 감)
export function layoutMdCode(text: string, fontSize: number): MdCodeLayout | null {
  const parsed = parseMdCode(text);
  if (!parsed) return null;
  return layoutParsedCode(parsed, fontSize);
}

export function layoutParsedCode(parsed: MdCodeParse, fontSize: number): MdCodeLayout {
  const codeFs = Math.max(10, fontSize - 2);
  const lineH = codeFs + 6;
  const headFs = Math.max(9, codeFs - MD_CODE_HEAD_FS_DELTA);
  const headH = headFs + 10;
  let maxW = 0;
  for (const ln of parsed.code) maxW = Math.max(maxW, monoMeasure(ln, codeFs));
  // 헤더가 잘리지 않게 최소 폭 확보: 언어 라벨 + '⧉ 복사됨 ✓' 여유
  const headW = monoMeasure(parsed.lang || 'code', headFs) + headFs * 7 + 16;
  return {
    ...parsed,
    codeFs,
    lineH,
    headH,
    w: Math.ceil(Math.max(maxW, headW)) + MD_CODE_PAD_X * 2,
    h: headH + parsed.code.length * lineH + MD_CODE_PAD_Y * 2,
  };
}
