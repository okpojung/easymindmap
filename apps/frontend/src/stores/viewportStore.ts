// Viewport Store — zoom & pan only. Kept separate from Document Store so that
// viewport changes do NOT trigger document re-renders. Spec: § 6.7.

import { create } from 'zustand';
import { isPhoneLayoutNow } from '@/hooks/useViewport';

/**
 * **폰에서는 Pan 모드로 시작한다** (2026-10-05 사용자 요청). 손가락으로 맵을
 * 훑다가 노드를 잘못 끌어 옮기는 일을 막는다 — Pan 모드에서도 노드는 탭으로
 * 고를 수 있다. 맵을 열 때마다(`reset`, 문서 경계) 다시 켠다.
 */
const panByDefault = (): boolean => isPhoneLayoutNow();

// 최소 2% — '맵 전체 맞추기'가 수백 노드 맵도 전부 담을 수 있어야 하므로
// (예전 33%·10% 하한은 큰 맵에서 fit이 잘리는 원인이었다. 10-canvas.md §6)
export const ZOOM_MIN = 2;
export const ZOOM_MAX = 400;

interface ViewportState {
  zoom: number;     // ZOOM_MIN ~ ZOOM_MAX (percent for the UI; /100 for transform scale)
  panX: number;     // viewBox units
  panY: number;
  panMode: boolean; // Hand tool — drag anywhere on the canvas pans the view
  /** 새 중심주제 배치 모드 (2026-10-02) — 켜진 동안 빈 캔버스를 클릭한 자리에
   *  중심주제가 생긴다. 툴바 [새 중심주제] 로 켜고, 클릭·Esc·재클릭으로 꺼진다. */
  placingCenter: boolean;
  fitRequestId: number; // bumped by requestFit(); the canvas reacts and fits the map
  // 특정 노드를 화면 중앙 + 지정 배율로 보기 요청 (검색 결과 클릭 등).
  // seq가 바뀔 때마다 캔버스가 반응한다 — fitRequestId와 같은 패턴.
  centerRequest: { id: string; zoom: number; seq: number } | null;
  /**
   * **원위치 요청 번호** (2026-09-29) — `reset()` 마다 오른다. 캔버스는 이 번호가 바뀌면
   * 레이아웃에 맞는 첫 화면을 잡는다: 위에서 아래로 자라는 레이아웃(트리·진행트리)은
   * 중심 주제를 **화면 위쪽**에, 나머지는 가운데에. 예전엔 언제나 원점(가운데)이라
   * 트리 맵은 위 1/5 이 빈 채로 열렸다(사용자 지적).
   */
  homeSeq: number;
  /**
   * **첫 화면이 아직 살아 있는가** (2026-09-29 보강). `reset()` 이 켜고, 사용자가
   * 화면을 옮기거나 배율을 바꾸는 순간(setPan·setZoom·zoomIn/Out·fit·센터)
   * 꺼진다. 켜져 있는 동안 캔버스는 **배치가 바뀔 때마다** 첫 화면(트리·
   * 진행트리는 중심 주제를 위쪽에)을 다시 잡는다 — 한 번만 잡는 방식은
   * "잡은 뒤에 배치가 바뀌면"(큰 맵의 늦은 렌더·글꼴 로드·크기 측정) 그
   * 결과가 낡아 중심 주제가 화면 밖에 남을 수 있었다(2026-09-29 실사용
   * 보고: 2847 노드 맵이 빈 화면으로 열림 — 로컬에서는 재현되지 않았다).
   */
  homeArmed: boolean;

  setZoom: (v: number) => void;
  setPan: (x: number, y: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setPanMode: (v: boolean) => void;
  setPlacingCenter: (v: boolean) => void;
  togglePanMode: () => void;
  requestFit: () => void;
  requestCenterNode: (id: string, zoom?: number) => void;
  reset: () => void;
  /** 첫 화면 보정 전용 — `homeArmed` 를 끄지 않는 pan 설정 (캔버스 homeArmed 효과만 쓴다) */
  setHomePan: (x: number, y: number) => void;
}

/**
 * **뷰포트 변경 이력** (2026-10-02 진단) — 재현되지 않는 "첫 화면이 아래쪽" 보고를 사후에
 * 추적한다. pan·배율을 바꾸는 모든 길(setPan·setZoom·zoomIn/Out·setHomePan·reset·fit·센터
 * 요청)과 캔버스의 조작 감지가 한 줄씩 남기고, 호출 스택 몇 줄을 함께 적는다. 마지막 60개.
 * DevTools 콘솔 `__emm.viewportLog()` 로 본다. 프로덕션 번들에서도 남는다(비용 미미).
 */
export interface ViewportLogEntry { t: number; what: string; args?: unknown; stack?: string[] }
const viewportLog: ViewportLogEntry[] = [];
export function logViewport(what: string, args?: unknown): void {
  let stack: string[] | undefined;
  try {
    stack = (new Error().stack ?? '').split('\n').slice(2, 7).map((l) => l.trim().replace(/^at /, '').slice(0, 120));
  } catch { /* 무시 */ }
  viewportLog.push({ t: Math.round(performance.now()), what, args, stack });
  if (viewportLog.length > 60) viewportLog.splice(0, viewportLog.length - 60);
}
export function readViewportLog(): ViewportLogEntry[] { return viewportLog.slice(); }

export const useViewportStore = create<ViewportState>((set) => ({
  zoom: 100,
  panX: 0,
  panY: 0,
  panMode: panByDefault(),
  placingCenter: false,
  fitRequestId: 0,
  centerRequest: null,
  homeSeq: 1,
  homeArmed: true,

  // 사용자(또는 맞추기·센터 같은 명시적 이동)가 화면을 바꾸면 첫 화면은 끝난다
  setZoom: (zoom) => { logViewport('setZoom', zoom); set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX), homeArmed: false }); },
  setPan: (panX, panY) => { logViewport('setPan', [panX, panY]); set({ panX, panY, homeArmed: false }); },
  setHomePan: (panX, panY) => { logViewport('setHomePan', [panX, panY]); set({ panX, panY }); },
  // 버튼·단축키 줌 스텝 5% — 하단 상태바 ±버튼과 동일 (10-canvas.md §17)
  zoomIn:  () => { logViewport('zoomIn'); set((s) => ({ zoom: clamp(s.zoom + 5, ZOOM_MIN, ZOOM_MAX), homeArmed: false })); },
  zoomOut: () => { logViewport('zoomOut'); set((s) => ({ zoom: clamp(s.zoom - 5, ZOOM_MIN, ZOOM_MAX), homeArmed: false })); },
  setPanMode: (panMode) => set({ panMode }),
  setPlacingCenter: (placingCenter) => set({ placingCenter }),
  togglePanMode: () => set((s) => ({ panMode: !s.panMode })),
  requestFit: () => { logViewport('requestFit'); set((s) => ({ fitRequestId: s.fitRequestId + 1, homeArmed: false })); },
  requestCenterNode: (id, zoom = 100) => {
    logViewport('requestCenterNode', [id, zoom]);
    set((s) => ({
      centerRequest: { id, zoom, seq: (s.centerRequest?.seq ?? 0) + 1 },
      homeArmed: false,
    }));
  },
  reset:   () => { logViewport('reset'); set((s) => ({ zoom: 100, panX: 0, panY: 0, homeSeq: s.homeSeq + 1, homeArmed: true, placingCenter: false, panMode: panByDefault() })); },
}));

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
