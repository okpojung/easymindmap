// Viewport Store — zoom & pan only. Kept separate from Document Store so that
// viewport changes do NOT trigger document re-renders. Spec: § 6.7.

import { create } from 'zustand';

interface ViewportState {
  zoom: number;     // 33 ~ 400 (percent for the UI; multiply by /100 for transform scale)
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

  setZoom: (zoom) => set({ zoom: clamp(zoom, 33, 400) }),
  setPan: (panX, panY) => set({ panX, panY }),
  zoomIn:  () => set((s) => ({ zoom: clamp(s.zoom + 10, 33, 400) })),
  zoomOut: () => set((s) => ({ zoom: clamp(s.zoom - 10, 33, 400) })),
  setPanMode: (panMode) => set({ panMode }),
  togglePanMode: () => set((s) => ({ panMode: !s.panMode })),
  requestFit: () => set((s) => ({ fitRequestId: s.fitRequestId + 1 })),
  reset:   () => set({ zoom: 100, panX: 0, panY: 0 }),
}));

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
