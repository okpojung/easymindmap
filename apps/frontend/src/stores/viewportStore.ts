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
  // 특정 노드를 화면 중앙 + 지정 배율로 보기 요청 (검색 결과 클릭 등).
  // seq가 바뀔 때마다 캔버스가 반응한다 — fitRequestId와 같은 패턴.
  centerRequest: { id: string; zoom: number; seq: number } | null;

  setZoom: (v: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPanMode: (v: boolean) => void;
  togglePanMode: () => void;
  requestFit: () => void;
  requestCenterNode: (id: string, zoom?: number) => void;
  reset: () => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  zoom: 100,
  panX: 0,
  panY: 0,
  panMode: false,
  fitRequestId: 0,
  centerRequest: null,

  setZoom: (zoom) => set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) }),
  setPan: (panX, panY) => set({ panX, panY }),
  // 버튼·단축키 줌 스텝 5% — 하단 상태바 ±버튼과 동일 (10-canvas.md §17)
  zoomIn:  () => set((s) => ({ zoom: clamp(s.zoom + 5, ZOOM_MIN, ZOOM_MAX) })),
  zoomOut: () => set((s) => ({ zoom: clamp(s.zoom - 5, ZOOM_MIN, ZOOM_MAX) })),
  setPanMode: (panMode) => set({ panMode }),
  togglePanMode: () => set((s) => ({ panMode: !s.panMode })),
  requestFit: () => set((s) => ({ fitRequestId: s.fitRequestId + 1 })),
  requestCenterNode: (id, zoom = 100) =>
    set((s) => ({
      centerRequest: { id, zoom, seq: (s.centerRequest?.seq ?? 0) + 1 },
    })),
  reset:   () => set({ zoom: 100, panX: 0, panY: 0 }),
}));

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
