// Autosave Store — dirty flag, patch queue, save state.
// Stub for design demo: only tracks the visual save-state for the top toolbar badge.

import { create } from 'zustand';
import type { SaveState } from '@/components/top-toolbar/TopToolbar';

interface AutosaveState {
  saveState: SaveState;
  setSaveState: (v: SaveState) => void;
}

export const useAutosaveStore = create<AutosaveState>((set) => ({
  saveState: 'saved',
  setSaveState: (saveState) => set({ saveState }),
}));
