import { useEffect, useMemo } from 'react';
import { findNodeInMap, useDocumentStore } from '@/stores/documentStore';
import { useMapSearchStore } from '@/stores/mapSearchStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useViewportStore } from '@/stores/viewportStore';
import { collectSearchHits } from '@/utils/mapSearch';

export function useMapSearch() {
  const map = useDocumentStore(s => s.map);
  const epoch = useDocumentStore(s => s.docEpoch);
  const query = useMapSearchStore(s => s.docEpoch === epoch ? s.query : '');
  const selectedId = useInteractionStore(s => s.selectedId);
  useEffect(() => { useMapSearchStore.getState().setScope(epoch); }, [epoch]);
  const results = useMemo(() => collectSearchHits(map, query), [map, query]);
  const setQuery = (value: string) => {
    if (useDocumentStore.getState().docEpoch !== epoch) return;
    useMapSearchStore.getState().setQuery(epoch, value);
    if (!value.trim()) useInteractionStore.getState().setSearchHitId(null);
  };
  const choose = (id: string, onClose?: () => void) => {
    const doc = useDocumentStore.getState();
    if (doc.docEpoch !== epoch || !findNodeInMap(doc.map, id)) return;
    const ui = useEditorUiStore.getState();
    if (ui.activeSection === 'nav' && ui.navTab === 'search') useEditorUiStore.setState({ sidebarCollapsed: true });
    onClose?.();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    useInteractionStore.getState().setSelectedId(id);
    useInteractionStore.getState().setSearchHitId(id);
    doc.expandAncestors(id);
    // Let the closed drawer and ResizeObserver settle before the 100% center action.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const current = useDocumentStore.getState();
      if (current.docEpoch === epoch && findNodeInMap(current.map, id)) useViewportStore.getState().requestCenterNode(id, 100);
    }));
  };
  return { query, setQuery, results, selectedId, epoch, choose };
}
