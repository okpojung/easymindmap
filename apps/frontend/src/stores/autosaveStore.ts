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
}

export const useAutosaveStore = create<AutosaveState>((set) => ({
  saveState: 'saved',
  setSaveState: (saveState) => set({ saveState }),
  pendingEdits: 0,
  setPendingEdits: (pendingEdits) => set({ pendingEdits }),
  lastSavedAt: 0,
  setLastSavedAt: (lastSavedAt) => set({ lastSavedAt }),
}));
