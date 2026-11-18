import { create } from 'zustand';

// Current document, memory only. Closing a search surface never clears it.
// Epoch isolates replacements, including a reopened map with the same ID.
interface MapSearchState {
  docEpoch: number; query: string; scrollTop: number;
  setScope: (epoch: number) => void;
  setQuery: (epoch: number, query: string) => void;
  setScrollTop: (epoch: number, top: number) => void;
}
export const useMapSearchStore = create<MapSearchState>((set) => ({
  docEpoch: -1, query: '', scrollTop: 0,
  setScope: (docEpoch) => set((s) => s.docEpoch >= docEpoch ? s : { docEpoch, query: '', scrollTop: 0 }),
  setQuery: (docEpoch, query) => set((s) => s.docEpoch > docEpoch ? s : { docEpoch, query, scrollTop: 0 }),
  setScrollTop: (docEpoch, scrollTop) => set((s) => s.docEpoch === docEpoch ? { scrollTop: Math.max(0, scrollTop) } : s),
}));
