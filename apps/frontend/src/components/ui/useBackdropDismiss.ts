import { useRef, type PointerEvent, type MouseEvent } from 'react';
/** Only an intentional click that starts AND ends on the backdrop dismisses a dialog.
 * Releasing a text selection or title drag outside the panel must never close it. */
export function shouldDismissBackdrop(start: { x: number; y: number } | null, end: { x: number; y: number }, onBackdrop: boolean): boolean {
  return !!start && onBackdrop && Math.hypot(end.x - start.x, end.y - start.y) < 5;
}
export function useBackdropDismiss(close: () => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDownCapture: (e: PointerEvent<HTMLElement>) => {
      start.current = e.target === e.currentTarget && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    },
    onPointerCancel: () => { start.current = null; },
    onClick: (e: MouseEvent<HTMLElement>) => {
      const p = start.current; start.current = null;
      if (shouldDismissBackdrop(p, { x: e.clientX, y: e.clientY }, e.target === e.currentTarget)) close();
    },
  };
}
