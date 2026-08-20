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
  /**
   * **편집창이 들고 있는 초안** (2026-08-20).
   *
   * 노드 편집은 `NodeRenderer` 안의 `draftText` 로만 살아 있다가 Enter 를
   * 칠 때에야 문서에 들어간다. 혼자 쓸 때는 그게 맞다 — 되돌리기 기록이
   * 글자마다 쌓이지 않고, 자동저장도 헛돌지 않는다.
   *
   * 그런데 **협업에서는 그 사이가 통째로 안 보인다.** 상대는 내가 Enter 를
   * 칠 때까지 아무것도 못 본다(2026-08-20 사용자 보고).
   *
   * 그래서 초안을 **여기 한 곳에만** 비춰 둔다. 문서(`documentStore`)는
   * 건드리지 않으므로 되돌리기·자동저장은 그대로다. 유료 협업 모듈이
   * 이 값을 읽어 상대에게 흘린다. 공개판에서는 아무도 안 읽는다.
   *
   * **한글 조합 중에는 비추지 않는다** — 조합 중인 자모(`ㅎ`·`하`)가
   * 상대 화면에 그대로 가면 글자가 튄다. `compositionend` 뒤에 비춘다.
   */
  editingDraft: { nodeId: string; text: string } | null;
  setEditingNodeId: (id: string | null) => void;
  setEditingDraft: (d: { nodeId: string; text: string } | null) => void;
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
  editingDraft: null,
  setEditingDraft: (editingDraft) => set({ editingDraft }),
}));
