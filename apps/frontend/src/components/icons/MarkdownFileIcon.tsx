// 마크다운 첨부 아이콘 — 문서 + 주황 "MD" 글자 (2026-10-31 사용자 지정 SVG).
//
// .md/.markdown 첨부만 이 아이콘을 쓴다 (첨부 탭 목록 · 캔버스 첨부
// 인디케이터 · ChooserPopover). 다른 파일은 기존 아이콘 그대로다.
// 24×24 좌표계 한 벌을 HTML(<svg>)과 캔버스 SVG(<g>) 두 곳이 같이 쓴다.

/** 24×24 좌표계의 도형 — 바깥 <svg>/<g> 는 쓰는 쪽이 감싼다 */
export function MarkdownFileShapes() {
  return (
    <>
      <path d="M5 1.5h9.5L20 7v14a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 21V3a1.5 1.5 0 0 1 1-1.5z"
        fill="#fff" stroke="#475569" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M14.5 1.5V6a1 1 0 0 0 1 1H20"
        fill="#e2e8f0" stroke="#475569" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x="2" y="11" width="16" height="9" rx="2" fill="#d97706" />
      <text x="10" y="18" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7" fontWeight="700" fill="#fff">MD</text>
    </>
  );
}

/** HTML 안(목록 행·팝오버)에서 쓰는 아이콘 */
export function MarkdownFileIcon({ size = 16 }: { size?: number }) {
  return (
    <svg data-testid="md-file-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      width={size} height={size} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      aria-hidden="true">
      <MarkdownFileShapes />
    </svg>
  );
}

/** 캔버스(SVG) 안 — 원점이 아이콘 중심이 되도록 놓는다 (IndicatorGlyph 와 같은 규칙) */
export function MarkdownFileGlyph({ size }: { size: number }) {
  return (
    <g data-testid="md-file-glyph" transform={`scale(${size / 24}) translate(-12,-12)`}>
      <MarkdownFileShapes />
    </g>
  );
}
