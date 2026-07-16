// Interaction Store — transient state: drag, multi-select, text edit draft.
// Stub for the design demo — only tracks the currently selected node id.

import { create } from 'zustand';

interface InteractionState {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  // 지금 텍스트 편집 중인 노드 — 편집 중에는 캔버스의 +/− 추가 인디케이터
  // 오버레이를 숨겨 편집창·미니 툴바와 겹치지 않게 한다.
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
}

export const useInteractionStore = create<InteractionState>((set) => ({
  selectedId: 'b1-2',
  setSelectedId: (selectedId) => set({ selectedId }),
  editingNodeId: null,
  setEditingNodeId: (editingNodeId) => set({ editingNodeId }),
}));
