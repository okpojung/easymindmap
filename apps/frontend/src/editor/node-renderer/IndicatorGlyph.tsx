// IndicatorGlyph — 노드 콘텐츠 인디케이터(하이퍼링크/첨부파일) 전용 SVG 글리프.
// 이모지(🔗📎)는 OS·폰트에 따라 흐리거나 제각각으로 렌더링되므로, 사용자
// 참고 이미지의 디자인(파란 지구본 + 금색 체인, 클립)을 SVG로 직접 그려
// 어떤 환경에서도 진하고 선명하게 표시한다. 24×24 좌표계를 size로 스케일.
// note(📝)·media(▶️) 이모지는 원래 선명해서 그대로 사용한다.

import type { ContentKind, NoteKind } from './nodeContent';
import { NOTE_KIND_META } from './nodeContent';

// 노트 종류별 인디케이터 글리프 — 색이 다른 둥근 사각 배지 + 구분 문자.
//   문단 = T(회색) · 코드 = C(주황) · 표 = 격자(파랑) · 체크 = ✓(초록)
// HTML 내보내기 뷰어(drawMarkerGlyph)도 동일한 모양을 그린다.
export function NoteTypeGlyph({ kind, size }: { kind: NoteKind; size: number }) {
  const meta = NOTE_KIND_META[kind];
  const s = size / 24;

  return (
    <g transform={`scale(${s}) translate(-12,-12)`}>
      <rect x="2" y="2" width="20" height="20" rx="5" fill={meta.color} />
      {kind === 'note-table' ? (
        // 격자(⊞) — 문자 대신 미니 그리드를 직접 그린다 (모든 OS에서 선명)
        <g stroke="#FFFFFF" strokeWidth="1.8">
          <rect x="6" y="6" width="12" height="12" rx="1" fill="none" />
          <line x1="6" y1="12" x2="18" y2="12" />
          <line x1="12" y1="6" x2="12" y2="18" />
        </g>
      ) : kind === 'note-check' ? (
        <path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke="#FFFFFF"
              strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x="12" y="17" textAnchor="middle" fontSize="14.5" fontWeight="800"
              fill="#FFFFFF" style={{ fontFamily: 'Arial, sans-serif' }}>
          {meta.letter}
        </text>
      )}
    </g>
  );
}

// HTML 내보내기 뷰어(exportHtml.ts)와 동일한 도형을 유지할 것 — 뷰어는 이
// 좌표들을 문자열 path로 복제해 그린다. 수정 시 양쪽을 함께 바꾼다.
export function IndicatorGlyph({ kind, size }: { kind: ContentKind; size: number }) {
  const s = size / 24;

  if (kind === 'link') {
    // 지구본(파랑) + 금색 체인 — 참고 이미지의 하이퍼링크 아이콘
    return (
      <g transform={`scale(${s}) translate(-12,-12)`}>
        <circle cx="10" cy="9.5" r="7.2" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="1.6" />
        <ellipse cx="10" cy="9.5" rx="3.1" ry="7.2" fill="none" stroke="#DBEAFE" strokeWidth="1.2" />
        <line x1="2.8" y1="9.5" x2="17.2" y2="9.5" stroke="#DBEAFE" strokeWidth="1.2" />
        <rect x="10.2" y="14.4" width="6.6" height="4.8" rx="2.4" fill="#F59E0B" stroke="#92400E" strokeWidth="1.5" />
        <rect x="15.2" y="14.4" width="6.6" height="4.8" rx="2.4" fill="#FBBF24" stroke="#92400E" strokeWidth="1.5" />
      </g>
    );
  }

  if (kind === 'file') {
    // 진한 클립 — 참고 이미지의 첨부파일 아이콘을 선명한 색·두께로
    return (
      <g transform={`scale(${s}) translate(-12,-12)`}>
        <path
          d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
          fill="none"
          stroke="#4A3B28"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    );
  }

  return null;
}
