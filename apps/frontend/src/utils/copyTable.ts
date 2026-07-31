// copyTable — 렌더링된 표를 클립보드에 복사 (2026-07-31 사용자 요청).
//
// 붙여넣는 곳에 따라 맞는 형식이 다르므로 **두 형식을 동시에** 넣는다:
//   · text/html  = <table> — 웹 에디터(그룹웨어 결재 등)·워드에 표로 붙음
//   · text/plain = 탭 구분(TSV) — 엑셀·시트에 셀 단위로 붙음
// 셀의 인라인 마커(**굵게** 등)는 제거한 표시 텍스트로 복사한다.

import { stripInlineMarks } from '@/editor/node-renderer/inlineMarks';

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 붙여넣는 웹 에디터가 <style> 블록은 버려도 **인라인 style 속성은
// 유지**하므로, 테두리·패딩을 셀마다 인라인으로 넣는다 — 메일 편집기
// 등에 붙였을 때 표 테두리가 보이게 (2026-07-31 사용자 요청)
const CELL_STYLE = 'border:1px solid #999;padding:4px 8px;';
const TH_STYLE = CELL_STYLE + 'background:#F1F3F5;font-weight:700;text-align:left;';
const TABLE_STYLE = 'border-collapse:collapse;border:1px solid #999;';

export function tableClipboardPayload(headers: string[], rows: string[][]) {
  const clean = (s: string) => stripInlineMarks(String(s ?? '')).trim();
  const h = headers.map(clean);
  const rs = rows.map((r) => r.map(clean));
  const html =
    `<table style="${TABLE_STYLE}"><thead><tr>` +
    h.map((c) => `<th style="${TH_STYLE}">${escHtml(c)}</th>`).join('') +
    '</tr></thead><tbody>' +
    rs.map((r) =>
      '<tr>' + r.map((c) => `<td style="${CELL_STYLE}">${escHtml(c)}</td>`).join('') + '</tr>',
    ).join('') +
    '</tbody></table>';
  const tsv = [h, ...rs]
    .map((r) => r.map((c) => c.replace(/\t/g, ' ')).join('\t'))
    .join('\n');
  return { html, tsv };
}

export async function copyTable(headers: string[], rows: string[][]): Promise<boolean> {
  const { html, tsv } = tableClipboardPayload(headers, rows);
  try {
    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([tsv], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    // ClipboardItem 미지원/거부 — 아래 텍스트 폴백
  }
  try {
    await navigator.clipboard.writeText(tsv);
    return true;
  } catch {
    return false;
  }
}

// 파이프 MD 표 원문(줄 배열 아님, '\n' 포함 텍스트)에서 헤더/행을 뽑는다 —
// 노트 표 블록(원문이 파이프 줄)의 복사에 사용
export function pipeTextToTable(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = String(text || '').split('\n')
    .filter((r) => r.trim() && !/^[\s|:\-]+$/.test(r))
    .map((r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, ''));
  if (!lines.length) return null;
  const cells = (r: string) => r.split('|').map((c) => c.trim());
  return { headers: cells(lines[0]), rows: lines.slice(1).map(cells) };
}
