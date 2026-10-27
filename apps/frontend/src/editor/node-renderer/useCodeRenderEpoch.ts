// 코드 블록 그림(Mermaid·HTML)이 새로 그려지면 바뀌는 숫자 — 배치·그리기의 의존값 (2026-10-28)
import { useSyncExternalStore } from 'react';
import { codeRenderEpoch, subscribeCodeRender } from './codeRender';

export function useCodeRenderEpoch(): number {
  return useSyncExternalStore(subscribeCodeRender, codeRenderEpoch, codeRenderEpoch);
}
