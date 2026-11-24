import type { CSSProperties, RefObject, KeyboardEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { flattenNodeText } from '@/editor/node-renderer/RichTextHtml';
import type { SearchHit } from '@/utils/mapSearch';
import { useLang, useTr } from '@/i18n';
import './SearchResults.css';

export const SEARCH_KIND_BADGE: Record<string, { bg: string; fg: string }> = {
  노드: { bg: '#3B82F6', fg: '#FFFFFF' }, 태그: { bg: '#F59E0B', fg: '#1F1B16' },
  노트: { bg: '#10B981', fg: '#FFFFFF' }, 링크: { bg: '#8B5CF6', fg: '#FFFFFF' },
};
const LABEL: Record<string, string> = { 노드: 'panel.search.kind.node', 태그: 'panel.search.kind.tag', 노트: 'panel.search.kind.note', 링크: 'panel.search.kind.link' };
export const optionId = (listId: string, nodeId: string) => `${listId}-${encodeURIComponent(nodeId)}`;
export function SearchField({ t, query, onChange, onFocus, onKeyDown, inputRef, listId, expanded, activeId, testId }: {
  t: ThemeTokens; query: string; onChange: (value: string) => void;
  onFocus?: () => void; onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: RefObject<HTMLInputElement | null>; listId: string; expanded: boolean;
  activeId?: string; testId?: string;
}) {
  const tr = useTr(); const lang = useLang();
  return <div data-mm-touch="" style={{ position: 'relative', width: '100%', minWidth: 0 }}>
    <span aria-hidden="true" style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', color: t.text, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, background: t.primarySoft, pointerEvents: 'none' }}><I.Search size={20} strokeWidth={2} /></span>
    <input ref={inputRef} className="mm-map-search-input" data-testid={testId} data-map-search-input={testId === 'map-search-input' ? 'header' : 'panel'}
      type="text" inputMode="search" enterKeyHint="search" role="combobox" aria-label={tr('common.search')} aria-autocomplete="list"
      aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded ? activeId : undefined}
      placeholder={tr('panel.search.placeholder')} value={query} onChange={e => onChange(e.target.value)}
      onFocus={onFocus} onClick={onFocus} onKeyDown={onKeyDown} autoComplete="off"
      style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', height: 38, padding: '7px 34px 7px 42px', borderRadius: 7,
        border: `1px solid ${t.textMuted}`, background: t.surface, color: t.text, fontSize: 14, fontWeight: 500, boxShadow: t.shadowSm, outlineOffset: 2, fontFamily: 'inherit', WebkitAppearance: 'none',
        '--search-placeholder': t.textMuted, '--search-focus': t.name === 'light' ? t.primaryHover : t.primary } as CSSProperties} />
    {query !== '' && <button type="button" data-testid={`${testId ?? 'search'}-clear`}
      aria-label={lang === 'ko' ? '검색어 지우기' : 'Clear search'}
      onClick={() => { onChange(''); inputRef?.current?.focus(); }}
      style={{ position: 'absolute', right: 3, top: 3, width: 32, height: 32, border: 0, background: 'transparent', color: t.textMuted, cursor: 'pointer', borderRadius: 5, fontSize: 20 }}>×</button>}
  </div>;
}
export function SearchResults({ t, query, results, selectedId, onChoose, listId, activeIndex = -1, onActive }: {
  t: ThemeTokens; query: string; results: SearchHit[]; selectedId: string | null;
  onChoose: (id: string) => void; listId: string; activeIndex?: number; onActive?: (index: number) => void;
}) {
  const tr = useTr(); const lang = useLang();
  return <div>
    {query.trim() !== '' && <div role="status" style={{ fontSize: 11, color: t.textSubtle, marginBottom: 6 }}>{tr('panel.search.resultsN', { n: results.length })}</div>}
    {results.length > 0 && <div style={{ fontSize: 10.5, color: t.textSubtle, marginBottom: 6 }}>{tr('panel.search.clickHint')}</div>}
    {query.trim() && results.length === 0 && <div style={{ padding: '14px 4px', fontSize: 12, color: t.textMuted }}>{lang === 'ko' ? '검색 결과가 없습니다.' : 'No results found.'}</div>}
    <div id={listId} role="listbox" aria-label={tr('common.search')}>
      {results.map((r, index) => <button type="button" key={r.id} id={optionId(listId, r.id)} role="option" tabIndex={-1}
        data-search-hit={r.id} aria-selected={activeIndex >= 0 ? activeIndex === index : selectedId === r.id}
        onMouseEnter={() => onActive?.(index)} onClick={() => onChoose(r.id)} className="mm-list-row"
        style={{ display: 'block', textAlign: 'left', width: '100%', fontFamily: 'inherit', boxSizing: 'border-box',
          padding: '8px 10px', marginBottom: 4, cursor: 'pointer', background: activeIndex === index ? t.primarySoft : 'transparent',
          border: `1px solid ${activeIndex === index ? t.primaryBorder : 'transparent'}`, borderRadius: 6,
          ['--row-hover' as string]: t.primarySoft, ['--row-hover-bd' as string]: t.primaryBorder } as CSSProperties}>
        <div style={{ fontSize: 13, fontWeight: 500, color: t.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.kinds.map(k => { const b = SEARCH_KIND_BADGE[k] ?? { bg: t.border, fg: t.text }; return <span key={k} data-search-kind={k}
            style={{ display: 'inline-block', fontSize: 9.5, fontWeight: 700, lineHeight: '14px', padding: '0 5px', borderRadius: 4, marginRight: 4, background: b.bg, color: b.fg, verticalAlign: 'text-bottom' }}>{LABEL[k] ? tr(LABEL[k]) : k}</span>; })}
          {highlight(flattenNodeText(r.title), query, t.primary)}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.4, color: t.textSubtle, overflowWrap: 'anywhere' }}>{r.path || tr('panel.search.root')}</div>
      </button>)}
    </div>
  </div>;
}
function highlight(text: string, query: string, color: string) {
  const q = query.trim(); const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0 || !q) return text;
  return <>{text.slice(0, index)}<mark style={{ background: `${color}44`, borderRadius: 2, padding: '0 2px', color: 'inherit' }}>{text.slice(index, index + q.length)}</mark>{text.slice(index + q.length)}</>;
}
