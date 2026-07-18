// Viewport Store — zoom & pan only. Kept separate from Document Store so that
// viewport changes do NOT trigger document re-renders. Spec: § 6.7.

import { create } from 'zustand';

// 최소 2% — '맵 전체 맞추기'가 수백 노드 맵도 전부 담을 수 있어야 하므로
// (예전 33%·10% 하한은 큰 맵에서 fit이 잘리는 원인이었다. 10-canvas.md §6)
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 400;

interface ViewportState {
  zoom: number;     // ZOOM_MIN ~ ZOOM_MAX (percent for the UI; /100 for transform scale)
  panX: number;     // viewBox units
  panY: number;
  panMode: boolean; // Hand tool — drag anywhere on the canvas pans the view
  fitRequestId: number; // bumped by requestFit(); the canvas reacts and fits the map

  setZoom: (v: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPanMode: (v: boolean) => void;
  togglePanMode: () => void;
  requestFit: () => void;
  reset: () => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  zoom: 100,
  panX: 0,
  panY: 0,
  panMode: false,
  fitRequestId: 0,

  setZoom: (zoom) => set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) }),
  setPan: (panX, panY) => set({ panX, panY }),
  zoomIn:  () => set((s) => ({ zoom: clamp(s.zoom + 10, ZOOM_MIN, ZOOM_MAX) })),
  zoomOut: () => set((s) => ({ zoom: clamp(s.zoom - 10, ZOOM_MIN, ZOOM_MAX) })),
  setPanMode: (panMode) => set({ panMode }),
  togglePanMode: () => set((s) => ({ panMode: !s.panMode })),
  requestFit: () => set((s) => ({ fitRequestId: s.fitRequestId + 1 })),
  reset:   () => set({ zoom: 100, panX: 0, panY: 0 }),
}));

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
