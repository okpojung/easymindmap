// Interaction Store — transient state: drag, multi-select, text edit draft.
// Stub for the design demo — only tracks the currently selected node id.

import { create } from 'zustand';

interface InteractionState {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export const useInteractionStore = create<InteractionState>((set) => ({
  selectedId: 'b1-2',
  setSelectedId: (selectedId) => set({ selectedId }),
}));
