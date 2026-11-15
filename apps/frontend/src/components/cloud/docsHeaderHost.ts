// 문서함 머리 자리(slot) — DocsToolbar 가 한 줄 막대 안에 자리를 열고, MapBrowser 가
// 거기에 도구(검색·새 맵 등)를 포탈로 그린다. EditorPage 의 props 를 건드리지 않는 연결 고리.
import { useSyncExternalStore } from 'react';
import { usePhoneLayout } from '@/hooks/useViewport';

export const DOCS_TABLE_MIN_WIDTH = 1020;
const touchQuery = '(pointer: coarse) and (max-width: 1019px)';
const touchSnapshot = () => typeof window !== 'undefined' && !!window.matchMedia?.(touchQuery).matches;
function subscribeTouch(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(touchQuery); mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
/** The docs logo row and the tools row must use exactly the same breakpoint. */
export function useDocsCompactHeader() {
  const phone = usePhoneLayout();
  const narrowTouch = useSyncExternalStore(subscribeTouch, touchSnapshot, () => false);
  return phone || narrowTouch;
}

let host: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** DocsToolbar 의 ref 콜백. 폰 배치에서는 null (자리 없음 → MapBrowser 가 제자리에 그린다). */
export function setDocsHeaderHost(el: HTMLElement | null): void {
  if (host === el) return;
  host = el;
  listeners.forEach((l) => l());
}

export function useDocsHeaderHost(): HTMLElement | null {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => host,
    () => null,
  );
}
