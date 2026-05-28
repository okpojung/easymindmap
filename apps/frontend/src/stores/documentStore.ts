// Document Store — owns the persisted map document (root + branches + children).
// Only this store's data is written to the DB; everything else is UI state.
// Spec: docs/03-editor-core/state-architecture.md (Zustand 5-Store)

import { create } from 'zustand';
import { SAMPLE_ROADMAP, SAMPLE_META, SAMPLE_KANBAN } from '@/editor/__samples__';
import type { SampleMap, KanbanBoardData } from '@/editor/__samples__/types';

interface DocumentState {
  map: SampleMap;
  kanban: KanbanBoardData;
  setSample: (key: 'roadmap' | 'meta') => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  map: SAMPLE_ROADMAP,
  kanban: SAMPLE_KANBAN,
  setSample: (key) => set({
    map: key === 'meta' ? SAMPLE_META : SAMPLE_ROADMAP,
  }),
}));
