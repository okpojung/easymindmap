import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useMapSearchStore } from '@/stores/mapSearchStore';
import { clampLeft, EDGE } from '@/utils/popupPosition';
import { useMapSearch } from '@/components/left-sidebar/useMapSearch';
import { optionId, SearchField, SearchResults } from '@/components/left-sidebar/SearchResults';

/** Desktop search is anchored to the field, not the left sidebar. */
export function MapSearch({ t }: { t: ThemeTokens }) {
  const model = useMapSearch();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [position, setPosition] = useState({ left: 0, top: 0, width: 320 });
  const positionMenu = () => {
    const box = root.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(440, window.innerWidth - EDGE * 2);
    const next = { left: clampLeft(box.left, width, window.innerWidth), top: box.bottom + 6, width };
    setPosition(old => old.left === next.left && old.top === next.top && old.width === next.width ? old : next);
  };
  useLayoutEffect(() => { if (open) positionMenu(); });
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const focus = () => { input.current?.focus(); setOpen(true); };
    const shortcut = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f'
        && !document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')) { e.preventDefault(); focus(); }
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('keydown', shortcut);
    window.addEventListener('mm:focus-map-search', focus);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('resize', positionMenu); window.removeEventListener('keydown', shortcut); window.removeEventListener('mm:focus-map-search', focus); };
  }, []);
  useEffect(() => { setOpen(false); setActive(-1); }, [model.epoch]);
  useLayoutEffect(() => {
    if (open && scroll.current) {
      const state = useMapSearchStore.getState();
      scroll.current.scrollTop = state.docEpoch === model.epoch ? state.scrollTop : 0;
    }
  }, [open, model.epoch, model.query]);
  const choose = (id: string) => model.choose(id, () => { setOpen(false); setActive(-1); });
  const move = (next: number) => {
    setActive(next);
    if (model.results[next]) requestAnimationFrame(() => document.getElementById(optionId(listId, model.results[next].id))?.scrollIntoView({ block: 'nearest' }));
  };
  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); e.stopPropagation(); setOpen(true);
      const n = model.results.length;
      if (n) move(active < 0 ? (e.key === 'ArrowDown' ? 0 : n - 1) : (active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    }
    if (e.key === 'Enter' && open && model.results.length) { e.preventDefault(); e.stopPropagation(); choose(model.results[Math.max(0, active)]?.id ?? model.results[0].id); }
  };
  return <div ref={root} data-testid="map-search-header" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
    style={{ position: 'relative', flex: '1 1 220px', maxWidth: 360, minWidth: 220 }}>
    <SearchField t={t} inputRef={input} query={model.query} onChange={v => { model.setQuery(v); setActive(-1); setOpen(true); }}
      onFocus={() => setOpen(true)} onKeyDown={keyDown} listId={listId} expanded={open && !!model.query.trim()}
      activeId={open && active >= 0 && model.results[active] ? optionId(listId, model.results[active].id) : undefined}
      testId="map-search-input" />
    {open && model.query.trim() && <div ref={scroll} data-testid="map-search-dropdown"
      onScroll={e => useMapSearchStore.getState().setScrollTop(model.epoch, e.currentTarget.scrollTop)}
      style={{ position: 'fixed', top: position.top, left: position.left, width: position.width,
        maxHeight: `min(60vh, 480px, calc(100dvh - ${position.top + EDGE}px))`, overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box',
        border: `1px solid ${t.border}`, borderRadius: 10, background: t.surface, padding: 10, boxShadow: '0 8px 24px #0003', zIndex: 70 }}>
      <SearchResults t={t} {...model} listId={listId} activeIndex={active} onActive={setActive} onChoose={choose} />
    </div>}
  </div>;
}
