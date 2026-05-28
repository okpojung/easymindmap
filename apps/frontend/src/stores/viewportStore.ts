// Viewport Store — zoom & pan only. Kept separate from Document Store so that
// viewport changes do NOT trigger document re-renders. Spec: § 6.7.

import { create } from 'zustand';

interface ViewportState {
  zoom: number;     // 33 ~ 400 (percent for the UI; multiply by /100 for transform scale)
  panX: number;
  panY: number;

  setZoom: (v: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  zoom: 100,
  panX: 0,
  panY: 0,

  setZoom: (zoom) => set({ zoom: clamp(zoom, 33, 400) }),
  setPan: (panX, panY) => set({ panX, panY }),
  zoomIn:  () => set((s) => ({ zoom: clamp(s.zoom + 10, 33, 400) })),
  zoomOut: () => set((s) => ({ zoom: clamp(s.zoom - 10, 33, 400) })),
  reset:   () => set({ zoom: 100, panX: 0, panY: 0 }),
}));

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
