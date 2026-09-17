/**
 * 떠 있는 카드를 **화면 안에** 접어 넣는 자리 계산 (2026-09-18).
 *
 * ★ 왜 함수로 뺐나 — 문서함의 상세 정보 카드가 **아래로 잘려** 보였다
 *   (사용자 지적). 원인은 `window.innerHeight - 250` 처럼 **높이를 추측**한
 *   것이었다. 카드는 내용에 따라 줄 수가 달라진다 — 퍼블리싱 링크 줄이
 *   붙고 '마지막 저장 자리'까지 채워지면 250 을 훌쩍 넘어, 넘은 만큼
 *   잘렸다. 눈으로만 확인하면 "내 맵에서는 멀쩡하던데" 로 넘어가기 쉬워서
 *   **셈을 따로 떼어 시험**한다.
 */

/** 화면 가장자리에서 이만큼은 띄운다 */
export const EDGE = 8;

/**
 * 카드의 위쪽 좌표.
 *
 * @param y        붙이고 싶은 자리(보통 누른 버튼의 아래)
 * @param cardH    카드의 **실제** 높이. 아직 못 쟀으면 0 — 그때는 fallback
 * @param viewH    화면 높이(`window.innerHeight`)
 * @param fallback 높이를 모를 때 쓸 어림값
 */
export function clampTop(y: number, cardH: number, viewH: number, fallback = 300): number {
  const h = cardH || fallback;
  // 아래가 모자라면 위로 올린다. 그래도 모자라면(카드가 화면보다 크면)
  // 맨 위에 붙인다 — 부르는 쪽이 maxHeight 로 굴리게 둔다.
  return Math.max(EDGE, Math.min(y, viewH - h - EDGE));
}

/** 카드의 왼쪽 좌표 — 오른쪽으로 넘치지 않게 접는다 */
export function clampLeft(x: number, cardW: number, viewW: number): number {
  return Math.max(EDGE, Math.min(x, viewW - cardW - EDGE));
}
