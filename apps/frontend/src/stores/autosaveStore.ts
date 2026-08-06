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
}));
