// 대화상자 **제목줄을 끌어 옮기기** (2026-10-15 사용자 요청 — 표 편집·코드블록 편집 팝업).
// 뒤의 노드를 보면서 고치려고 창을 옮긴다. 제목줄에 `onPointerDown` 을, 창에
// `ref` 와 `style.transform` 을 붙인다. 화면 밖으로 다 나가지 않게 창은 가로
// 80px·제목줄 40px 이 화면 안에 남는다. 제목줄 안의 단추·입력칸은 그대로 눌린다.
import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';

export function useDialogDrag() {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onPointerDown = (e: RPointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, select, a')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = offset.x, oy = offset.y;
    const box = panelRef.current?.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      let dx = ox + ev.clientX - sx, dy = oy + ev.clientY - sy;
      if (box) {
        const left = box.left - ox + dx, top = box.top - oy + dy;
        if (left + box.width < 80) dx += 80 - (left + box.width);
        if (left > window.innerWidth - 80) dx -= left - (window.innerWidth - 80);
        if (top < 0) dy -= top;
        if (top > window.innerHeight - 40) dy -= top - (window.innerHeight - 40);
      }
      setOffset({ x: dx, y: dy });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return {
    panelRef,
    panelStyle: (offset.x || offset.y ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : {}) as CSSProperties,
    handleProps: { onPointerDown, style: { cursor: 'move', userSelect: 'none', touchAction: 'none' } as CSSProperties },
  };
}
