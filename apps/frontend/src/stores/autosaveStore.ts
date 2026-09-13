// Autosave Store — 상단 툴바 저장 배지가 쓰는 상태.

import { create } from 'zustand';
import type { SaveState } from '@/components/top-toolbar/TopToolbar';

interface AutosaveState {
  saveState: SaveState;
  setSaveState: (v: SaveState) => void;
  /**
   * **아직 서버에 반영되지 않은 편집 수** (2026-08-06).
   *
   * 저장 모델이 "손 멈춤 1.5초"에서 **주기 자동저장**으로 바뀌면서,
   * 사용자에게 "지금 몇 개가 서버에 없는가"를 숫자로 보여 준다 —
   * "저장됨"인지 아닌지 애매한 상태를 남기지 않기 위해서다.
   */
  pendingEdits: number;
  setPendingEdits: (n: number) => void;
  /** 마지막으로 서버에 반영된 시각 (ms). 0 = 이 세션에서 아직 없음 */
  lastSavedAt: number;
  setLastSavedAt: (t: number) => void;
  /**
   * **브라우저 임시 보관(초안) 쓰기가 실패했다** (2026-08-06).
   *
   * 저장소가 꽉 찼거나(QuotaExceeded) 도중에 차단되면 초안이 하나도
   * 안 적힌다. 첫 열기는 성공하므로 시작 시 검사는 통과한다 — 조용히
   * 넘어가면 **사용자가 인식하지 못하는 유실**이 된다. 화면에 알린다.
   */
  draftWriteFailed: boolean;
  setDraftWriteFailed: (v: boolean) => void;
  /**
   * **협업 세션이 몰고 있는 맵 id** (2026-08-18). 없으면 null.
   *
   * 배지를 `saveState` 한 값에 얹지 않고 따로 두는 이유 — 검증에서
   * 잡았다: 맵을 여는 경로가 끝에서 `saveState='saved'` 를 쓰는데 협업
   * 세션은 그보다 **먼저** 붙는다. 한 값을 나눠 쓰면 순서에 따라 배지가
   * "저장됨"으로 덮여, **통째 저장을 안 하고 있는데 저장됐다고 말하는**
   * 화면이 된다. 배지는 이 값을 우선으로 파생한다.
   */
  collabDrivingMapId: string | null;
  setCollabDrivingMapId: (mapId: string | null) => void;
  /**
   * **서버에 닿지 않아 자동저장이 대기 중** (2026-09-13, B20 ⑧ⓑ).
   *
   * 배포로 API 가 5~15초 비는 동안 자동저장은 끝까지 재시도하고 편집은
   * 초안에 남는다 — 잃는 것은 없다. 다만 사용자에게는 "요청 실패 (502)"
   * 만 보였다. 연결이 안 되는 실패(`outageNoticeFor`)면 여기에 문구를 두고
   * 화면 위쪽 띠(OutageBanner)로 보여 준다. 다음 저장이 성공하면 비운다.
   */
  outageNotice: import('@/utils/outageNotice').OutageNotice | null;
  /** 사용자가 [알겠습니다] 를 눌렀다 — 이 장애가 끝날 때까지 다시 띄우지 않는다 */
  outageDismissed: boolean;
  setOutageNotice: (n: import('@/utils/outageNotice').OutageNotice | null) => void;
  dismissOutage: () => void;
}

export const useAutosaveStore = create<AutosaveState>((set) => ({
  saveState: 'saved',
  setSaveState: (saveState) => set({ saveState }),
  pendingEdits: 0,
  setPendingEdits: (pendingEdits) => set({ pendingEdits }),
  lastSavedAt: 0,
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
  draftWriteFailed: false,
  setDraftWriteFailed: (draftWriteFailed) => set({ draftWriteFailed }),
  collabDrivingMapId: null,
  setCollabDrivingMapId: (collabDrivingMapId) => set({ collabDrivingMapId }),
  outageNotice: null,
  outageDismissed: false,
  // 비우면 dismissed 도 함께 푼다 — 다음 장애는 다시 알려야 한다
  setOutageNotice: (outageNotice) => set(outageNotice
    ? { outageNotice }
    : { outageNotice: null, outageDismissed: false }),
  dismissOutage: () => set({ outageDismissed: true }),
}));
