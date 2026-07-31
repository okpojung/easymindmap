// EditPreviewBackdrop — 노드 편집 중 인라인 마크 라이브 미리보기 (B6).
//
// 편집 textarea의 글자를 투명(caret만 표시)하게 하고, 그 **뒤에 같은
// 메트릭(글꼴·크기·행높이·패딩·정렬·줄바꿈)의 미리보기 레이어**를 깔아
// 마커가 입력되는 즉시 강조가 보이게 한다. 커밋 전에는 마커가 원문으로만
// 보여 적용 여부를 알기 어렵던 문제의 해법.
//
// 절대 규칙 — **글자 폭을 바꾸는 스타일 금지** (캐럿·선택 위치가
// textarea 원문과 1:1로 맞아야 한다):
//   · 마커 문자(**, ==, ` …)  → 지우지 않고 흐리게 (opacity)
//   · ==하이라이트==           → 노란 띠 + 진한 글자 (배경·색 = 폭 불변)
//   · `인라인 코드`            → 회색 띠 (모노 글꼴은 폭이 달라져 미적용)
//   · ~~취소선~~ · __밑줄__    → text-decoration (폭 불변)
//   · **굵게**                 → 진짜 bold는 폭이 넓어짐 → text-shadow
//                                가짜 굵게 (레이아웃 불변)
//   · *기울임*                 → synthetic oblique (동일 글리프 기울임 —
//                                advance 폭 유지)
//   · 코드 펜스(``` 줄)        → 펜스 줄 흐리게, 블록 안 줄은 회색 띠
// 스크롤은 textarea의 onScroll이 backdrop에 동기화한다 (넘칠 때 캐럿
// 따라 내부 스크롤되는 경우).

import { forwardRef } from 'react';
import type { CSSProperties } from 'react';
import {
  parseInlineMarksPreview, CODE_BG, CODE_TEXT,
} from './inlineMarks';

export const EditPreviewBackdrop = forwardRef<HTMLDivElement, {
  text: string;
  // 하이라이트 띠 위 글자색 — 커밋 후 렌더와 동일 규칙
  // (지정 글자색 있으면 그 색, 없으면 고정 진한색)
  hlTextColor: string;
  style: CSSProperties; // 폰트·패딩·정렬 등 textarea와 동일한 메트릭
}>(function EditPreviewBackdrop({ text, hlTextColor, style }, ref) {
  const lines = String(text ?? '').split('\n');
  let inFence = false;

  return (
    <div
      ref={ref}
      aria-hidden
      data-testid="edit-preview"
      style={{
        ...style,
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        userSelect: 'none',
      }}
    >
      {lines.map((line, li) => {
        const fenceLine = /^\s*```/.test(line);
        const inCodeBlock = inFence && !fenceLine;
        if (fenceLine) inFence = !inFence;
        const nl = li < lines.length - 1 ? '\n' : '';
        if (fenceLine) {
          return (
            <span key={li} style={{ opacity: 0.4 }}>{line}{nl}</span>
          );
        }
        if (inCodeBlock) {
          return (
            <span key={li}>
              <span style={{ background: CODE_BG, color: CODE_TEXT, borderRadius: 2 }}>
                {line}
              </span>{nl}
            </span>
          );
        }
        return (
          <span key={li}>
            {parseInlineMarksPreview(line).map((sg, k) => (
              <span
                key={k}
                data-preview-seg={sg.marker ? 'marker' : undefined}
                style={{
                  opacity: sg.marker ? 0.35 : undefined,
                  // 폭 불변 가짜 굵게 — 진짜 bold는 글자 폭이 넓어져
                  // 캐럿이 어긋난다
                  textShadow: sg.b ? '0 0 0.55px currentColor' : undefined,
                  fontStyle: sg.i ? 'italic' : undefined,
                  textDecoration:
                    [sg.s ? 'line-through' : '', sg.u ? 'underline' : '']
                      .filter(Boolean).join(' ') || undefined,
                  background: sg.h ? '#FFE066' : sg.c ? CODE_BG : undefined,
                  color: sg.h ? hlTextColor : sg.c ? CODE_TEXT : undefined,
                  borderRadius: sg.h || sg.c ? 2 : undefined,
                }}
              >
                {sg.text}
              </span>
            ))}
            {nl}
          </span>
        );
      })}
    </div>
  );
});
