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
] as const;

export function MarkToolbar({
  t,
  onApply,
  style,
}: {
  t: ThemeTokens;
  onApply: (mark: string) => void;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState<string | null>(null);
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
        ...style,
      }}
    >
      {MARK_BUTTONS.map((b) => (
        <button
          key={b.label}
          type="button"
          title={b.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApply(b.m)}
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
          <span style={b.st as CSSProperties}>{b.label}</span>
        </button>
      ))}
    </div>
  );
}
