// 노드 노트 **표 블록** ↔ 표 팝업(TableDialog) 사이의 변환 (2026-09-19 사용자
// 요청: "노드 노트의 표 삽입도 노드 내용의 표처럼 n×n 격자 선택 + 렌더링된
// 표 편집 화면과 MD 편집 화면으로").
//
// 노트 표 블록의 저장 형식은 그대로다 — **줄 = 행, ` | ` = 열, 바깥 파이프
// 없음, 첫 행 = 머리글** (노트 뷰어 팝업·HTML 뷰어·MD 내보내기·불러오기가 전부
// 이 꼴을 읽는다). GFM 정렬 콜론이 있는 구분선 행(`:--- | ---:`)만 정렬
// 정보로 남긴다 — 불러오기(`flushTable`)가 정규화하는 규칙과 같다.
// 셀 안의 `|` 는 `\|` 로 그대로 둔다(노트 뷰어·뷰어·내보내기가 존중).

import { buildMdTable } from '@/editor/node-renderer/TableDialog';
import { parseMdTable, splitPipeCells } from '@/editor/node-renderer/mdTable';

const SEP_RE = /^[\s|:\-]+$/;

/** 팝업이 돌려준 GFM 표 → 노트 표 블록 원문 */
export function noteTableFromMd(md: string): string {
  const out: string[] = [];
  for (const raw of String(md ?? '').split('\n')) {
    const line = raw.trim();
    if (!line || !line.includes('|')) continue;
    // 구분선: 정렬 콜론이 있을 때만 남긴다 (없으면 순수 장식)
    if (SEP_RE.test(line) && !line.includes(':')) continue;
    out.push(splitPipeCells(line, { keepEscape: true }).join(' | '));
  }
  return out.join('\n');
}

/**
 * 노트 표 블록 원문 → 팝업에 줄 GFM 표. 표로 읽히지 않으면(빈 블록·한 줄)
 * undefined — 팝업은 빈 표로 연다.
 */
export function noteTableToMd(text: string): string | undefined {
  const parsed = parseMdTable(String(text ?? ''));
  if (!parsed) return undefined;
  return buildMdTable(parsed.headers, parsed.rows, parsed.aligns);
}

/** 노트 표 블록 원문 → 그려 보일 셀 (정렬 포함). 표가 아니면 null */
export function noteTableCells(text: string): { headers: string[]; rows: string[][]; aligns: (string | null)[] } | null {
  const parsed = parseMdTable(String(text ?? ''));
  if (!parsed) return null;
  return { headers: parsed.headers, rows: parsed.rows, aligns: parsed.aligns };
}
