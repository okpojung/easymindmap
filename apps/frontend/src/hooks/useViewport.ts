// useViewport — 화면 폭·입력 장치 판정 (모바일 웹, 2026-10-05).
//
// 판정 기준을 **한 곳**에 둔다 — 화면마다 제각각 `innerWidth < 7xx` 를 쓰면
// 같은 폰에서 툴바는 폰 모양, 사이드바는 데스크톱 모양이 되는 일이 생긴다.
//
//   compact  폭 < 768px  — 폰(세로·가로)·작은 태블릿. 패널은 겹쳐 뜨는 서랍,
//            툴바는 아이콘만, 표는 카드 목록
//   coarse   손가락 입력(`pointer: coarse`) — 누를 자리를 44px 이상으로
//
// CSS 쪽은 같은 값을 `@media (max-width: 767px)` · `(pointer: coarse)` 로 쓴다.

import { useEffect, useState } from 'react';

export const COMPACT_MAX = 767;
const COMPACT_QUERY = `(max-width: ${COMPACT_MAX}px)`;
const COARSE_QUERY = '(pointer: coarse)';

function match(q: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(q).matches;
}

/** 컴포넌트 밖에서 — 지금 폰 폭인가 */
export function isCompactNow(): boolean {
  return match(COMPACT_QUERY);
}

/** 컴포넌트 밖에서 — 손가락 입력인가 */
export function isCoarseNow(): boolean {
  return match(COARSE_QUERY);
}

function useMedia(q: string): boolean {
  const [v, setV] = useState(() => match(q));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(q);
    const on = () => setV(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return v;
}

/** 폭 < 768px — 폰 배치를 쓸 때 */
export function useCompact(): boolean {
  return useMedia(COMPACT_QUERY);
}

/** 손가락 입력 — 누를 자리를 크게 */
export function useCoarse(): boolean {
  return useMedia(COARSE_QUERY);
}

// ── 폰 배치 (상단 막대·사이드바 서랍·분할 보기) ─────────────────────────
// 폰을 **가로로** 돌리면 폭이 800px 을 넘어 compact 가 아니게 된다. 그런데
// 높이는 390px 안팎이라 데스크톱 배치(왼쪽 레일 13칸 · 늘 펼친 패널)가
// 들어가지 않는다. 그래서 "손가락 입력 + 낮은 화면" 도 폰 배치로 본다.
// 새 폭 기준을 만든 것이 아니다 — 위의 두 판정을 합친 것이다.
const PHONE_LANDSCAPE_QUERY = '(pointer: coarse) and (max-height: 500px)';

/** 컴포넌트 밖에서 — 폰 배치인가 (세로 compact 또는 가로로 눕힌 폰) */
export function isPhoneLayoutNow(): boolean {
  return match(COMPACT_QUERY) || match(PHONE_LANDSCAPE_QUERY);
}

/** 폰 배치 — compact 이거나, 손가락 입력인데 높이가 500px 이하(가로로 눕힌 폰) */
export function usePhoneLayout(): boolean {
  const compact = useMedia(COMPACT_QUERY);
  const landscape = useMedia(PHONE_LANDSCAPE_QUERY);
  return compact || landscape;
}
