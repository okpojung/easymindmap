// MarkToolbar — 텍스트 부분 강조(B/I/S/U/H) 공용 툴바.
//
// 노드 편집 오버레이(NodeRenderer)와 아웃라인 편집창(OutlineEditorPane)이
// 같은 툴바를 쓴다. 버튼을 누르면 선택 구간에 인라인 마커를 토글한다
// (이미 적용돼 있으면 해제 — inlineMarks.toggleMarkRange).
//
// ThinkWise 상단 서식 툴바 수준의 크기·시인성: 28px 버튼, 진한 글자,
// 흰 배경 + 뚜렷한 테두리·그림자, 호버 배경. onMouseDown preventDefault로
// 편집창의 포커스·선택이 풀리지 않게 유지한다.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { TableGridPicker } from './TableDialog';

export const MARK_BUTTONS = [
  { m: '**', label: 'B', title: '굵게 (Ctrl+B)', st: { fontWeight: 800 } },
  { m: '*', label: 'I', title: '기울임 (Ctrl+I)', st: { fontStyle: 'italic', fontWeight: 600 } },
  { m: '~~', label: 'S', title: '취소선', st: { textDecoration: 'line-through', fontWeight: 600 } },
  { m: '__', label: 'U', title: '밑줄 (Ctrl+U)', st: { textDecoration: 'underline', fontWeight: 600 } },
  { m: '==', label: 'H', title: '하이라이트 (다시 누르면 해제)', st: { background: '#FFE066', color: '#1F1B16', borderRadius: 3, padding: '0 4px', fontWeight: 700 } },
  // 코드는 { } 하나로 통일 — 팝업에서 언어·코드를 입력해 블록으로 삽입.
  // (한 줄 인라인 코드가 필요하면 백틱 ` 로 직접 감싸는 것은 계속 지원)
  { m: '```', label: '{ }', title: '코드 블록 (팝업에서 언어·코드 입력)', st: { fontFamily: "ui-monospace, 'Consolas', monospace", background: '#334155', color: '#ECEFF3', borderRadius: 3, padding: '0 3px', fontWeight: 700, fontSize: 11 } },
  // 체크박스 줄 — 커서 줄에 '- [ ] ' 마커 토글 (노드에 체크박스로 렌더)
  { m: 'check', label: '☑', title: '체크박스 줄 (- [ ] — 다시 누르면 해제)', st: { color: '#22A06B', fontWeight: 700, fontSize: 15 } },
  // 표 — 10×10 격자에서 크기를 고르면 그 크기의 표가 들어가고 팝업에서 채운다
  // (노드에 이미 표가 있으면 그 표를 팝업에서 수정). TableDialog 참조 (2026-09-17)
  { m: 'table', label: '⊞', title: '표 (격자에서 행·열을 고르면 삽입 · 이미 있으면 수정)', st: { color: '#2563EB', fontWeight: 700, fontSize: 16 } },
] as const;

export function MarkToolbar({
  t,
  onApply,
  style,
}: {
  t: ThemeTokens;
  /** 표(⊞)는 격자에서 고른 크기를 두 번째 인자로 넘긴다 */
  onApply: (mark: string, size?: { rows: number; cols: number }) => void;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [gridOpen, setGridOpen] = useState(false);
  return (
    <div
      data-testid="mark-toolbar"
      style={{
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        background: t.surface,
        border: `1.5px solid ${t.border}`,
        borderRadius: 9,
        padding: '4px 6px',
        boxShadow: '0 4px 14px rgba(60,45,15,0.28), 0 1px 3px rgba(60,45,15,0.18)',
        whiteSpace: 'nowrap',
        position: 'relative',
        // 격자 선택기가 편집창(textarea)·미리보기 위에 뜨도록
        zIndex: 30,
        ...style,
      }}
    >
      {MARK_BUTTONS.map((b) => (
        <button
          key={b.label}
          type="button"
          title={b.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (b.m === 'table' ? setGridOpen((v) => !v) : onApply(b.m))}
          aria-pressed={b.m === 'table' ? gridOpen : undefined}
          onMouseEnter={() => setHover(b.label)}
          onMouseLeave={() => setHover(null)}
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: hover === b.label ? t.surfaceAlt ?? 'rgba(0,0,0,0.08)' : 'transparent',
            cursor: 'pointer',
            fontSize: 15,
            color: t.text,
            padding: 0,
            borderRadius: 6,
            lineHeight: 1,
          }}
        >
          {b.m === 'table' ? (
            // 글꼴 글리프 ⊞ 는 너무 작게 찍혀 SVG 격자 아이콘으로 그린다
            <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden style={{ color: '#2563EB' }}>
              <rect x={1.5} y={1.5} width={13} height={13} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.6} />
              <line x1={1.5} y1={6} x2={14.5} y2={6} stroke="currentColor" strokeWidth={1.4} />
              <line x1={1.5} y1={10.5} x2={14.5} y2={10.5} stroke="currentColor" strokeWidth={1.4} />
              <line x1={6} y1={1.5} x2={6} y2={14.5} stroke="currentColor" strokeWidth={1.4} />
              <line x1={10.5} y1={1.5} x2={10.5} y2={14.5} stroke="currentColor" strokeWidth={1.4} />
            </svg>
          ) : (
            <span style={b.st as CSSProperties}>{b.label}</span>
          )}
        </button>
      ))}
      {gridOpen && (
        <TableGridPicker
          t={t}
          onClose={() => setGridOpen(false)}
          onPick={(rows, cols) => { setGridOpen(false); onApply('table', { rows, cols }); }}
        />
      )}
    </div>
  );
}
