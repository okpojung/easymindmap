// Interaction Store — transient state: drag, multi-select, text edit draft.
// Stub for the design demo — only tracks the currently selected node id.

import { create } from 'zustand';

interface InteractionState {
  selectedId: string | null;
  // 검색 결과 클릭으로 선택된 노드 — 캔버스에서 노란 채움 + 붉은 테두리로
  // 강하게 표시한다 (캔버스에서 다른 조작을 하면 해제)
  searchHitId: string | null;
  setSelectedId: (id: string | null) => void;
  setSearchHitId: (id: string | null) => void;
  // 러버밴드(드래그 사각형)로 선택한 노드들 — 스타일 탭에서 일괄 적용 대상.
  // 단일 클릭 선택 시에는 비워진다.
  multiSelectedIds: string[];
  setMultiSelectedIds: (ids: string[]) => void;
  // 지금 텍스트 편집 중인 노드 — 편집 중에는 캔버스의 +/− 추가 인디케이터
  // 오버레이를 숨겨 편집창·미니 툴바와 겹치지 않게 한다.
  editingNodeId: string | null;
  setEditingNodeId: (id: string | null) => void;
}

export const useInteractionStore = create<InteractionState>((set) => ({
  selectedId: 'b1-2',
  setSearchHitId: (searchHitId: string | null) => set({ searchHitId }),
  searchHitId: null,
  setSelectedId: (selectedId) => set({ selectedId }),
  multiSelectedIds: [],
  setMultiSelectedIds: (multiSelectedIds) => set({ multiSelectedIds }),
  editingNodeId: null,
  setEditingNodeId: (editingNodeId) => set({ editingNodeId }),
}));
