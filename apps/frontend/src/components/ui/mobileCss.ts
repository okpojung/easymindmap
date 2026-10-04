// mobileCss — 대화상자·패널의 **폰 규칙을 CSS 한 벌로** (모바일 웹, 2026-10-05).
//
// 이 앱은 거의 전부 인라인 스타일이라 `@media` 를 쓸 자리가 없다. 그렇다고
// 대화상자마다 `useCompact()` 로 폭·높이를 갈라 쓰면 열 군데가 조금씩 달라진다.
// 그래서 **표시(data-* 속성)만 붙이고 규칙은 여기 한 곳**에 둔다 — 붙인 자리는
// 폰에서 같은 모양이 되고, 데스크톱에서는 아무 규칙도 걸리지 않는다.
//
//   data-mm-dialog-overlay   어두운 배경 — 폰에서 가장자리 여백 + safe-area
//   data-mm-dialog           대화상자 판 — 폰(가로로 든 폰 포함 = usePhoneLayout 과 같은 판정)에서
//                            화면 폭 - 24px, 높이는 100dvh 안
//   data-mm-dialog-x         오른쪽 위 × — 손가락이면 40px
//   data-mm-touch            이 안의 입력칸은 손가락 기기에서 16px 글자
//                            (iOS Safari 는 16px 보다 작은 칸에 들어가면 화면을
//                            확대한다 — 확대된 채로 남아 대화상자가 잘린다)
//                            버튼은 손가락 기기에서 높이 40px 이상
//   data-mm-touch-compact    위와 같되 버튼 최소 높이를 걸지 않는다(색 견본처럼
//                            촘촘해야 하는 격자 — 그 자리는 각자 크기를 정한다)
//
// ★ `!important` 를 쓰는 이유 — 인라인 스타일을 이길 방법이 그것뿐이다.
//   그래서 미디어 쿼리 **안에서만** 쓴다. 데스크톱 화면은 한 줄도 바뀌지 않는다.

const CSS = `
@media (max-width: 767px), (pointer: coarse) and (max-height: 500px) {
  [data-mm-dialog-overlay] {
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
      max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)) !important;
    box-sizing: border-box !important;
  }
  [data-mm-dialog] {
    max-width: 100% !important;
    max-height: calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)) !important;
    box-sizing: border-box !important;
  }
}
/* 폭을 꽉 채우는 것은 세로 폰만 — 가로로 든 폰(844px)에서 대화상자가 화면 끝까지 퍼지면 읽기 어렵다 */
@media (max-width: 767px) {
  [data-mm-dialog] { width: 100% !important; }
}
@media (pointer: coarse) {
  [data-mm-dialog-x] {
    width: 40px !important; height: 40px !important; top: 4px !important; right: 4px !important;
  }
  [data-mm-touch] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),
  [data-mm-touch] select,
  [data-mm-touch] textarea,
  [data-mm-touch-compact] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),
  [data-mm-touch-compact] select,
  [data-mm-touch-compact] textarea {
    font-size: 16px !important;
  }
  [data-mm-touch] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),
  [data-mm-touch] select {
    min-height: 40px !important;
  }
  [data-mm-touch] button:not([data-mm-small]) {
    min-height: 40px !important;
  }
  [data-mm-touch] input[type=range], [data-mm-touch-compact] input[type=range] {
    height: 32px;
  }
  [data-mm-touch] input[type=checkbox], [data-mm-touch] input[type=radio] {
    width: 20px; height: 20px;
  }
}
`;

let injected = false;

/** 규칙을 문서에 한 번 넣는다 — 렌더 중에 불러도 된다(멱등) */
export function ensureMobileCss(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const el = document.createElement('style');
  el.setAttribute('data-mm-mobile-css', '');
  el.textContent = CSS;
  document.head.appendChild(el);
}

// 불러오기만 해도 들어간다 — 손으로 그린 대화상자는 `import '@/components/ui/mobileCss'` 한 줄로 충분하다
ensureMobileCss();
