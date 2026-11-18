import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useMapSearchStore } from '@/stores/mapSearchStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useMapSearch } from './useMapSearch';
import { optionId, SearchField, SearchResults } from './SearchResults';
import '@/components/ui/mobileCss';
export { SEARCH_KIND_BADGE } from './SearchResults';

export function SearchPanel({ t }: { t: ThemeTokens }) {
  const model = useMapSearch();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  useLayoutEffect(() => {
    const s = useMapSearchStore.getState();
    if (scroll.current) scroll.current.scrollTop = s.docEpoch === model.epoch ? s.scrollTop : 0;
  }, [model.epoch, model.query]);
  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.stopPropagation(); useEditorUiStore.setState({ sidebarCollapsed: true }); input.current?.blur(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation();
      const count = model.results.length;
      setActive(i => count ? (i < 0 ? (e.key === 'ArrowDown' ? 0 : count - 1) : (i + (e.key === 'ArrowDown' ? 1 : -1) + count) % count) : -1);
    }
    if (e.key === 'Enter' && model.results.length) { e.preventDefault(); e.stopPropagation(); model.choose(model.results[Math.max(0, active)]?.id ?? model.results[0].id); }
  };
  return <div ref={scroll} data-testid="map-search-panel" data-mm-touch=""
    onScroll={e => useMapSearchStore.getState().setScrollTop(model.epoch, e.currentTarget.scrollTop)}
    style={{ padding: 12, height: '100%', overflowY: 'auto', boxSizing: 'border-box', overscrollBehavior: 'contain' }}>
    <div style={{ marginBottom: 12 }}><SearchField t={t} query={model.query} onChange={v => { model.setQuery(v); setActive(-1); }}
      inputRef={input} listId={listId} expanded={model.results.length > 0}
      activeId={active >= 0 && model.results[active] ? optionId(listId, model.results[active].id) : undefined}
      onKeyDown={keyDown} testId="map-search-panel-input" /></div>
    <SearchResults t={t} {...model} listId={listId} activeIndex={active} onActive={setActive} onChoose={id => model.choose(id)} />
  </div>;
}