/** Tab-local UI state only. No document data or credentials are retained. */
export interface LibraryViewState {
  expanded: string[];
  selected: string | null;
  scrollTop: number;
  scrollLeft: number;
  query: string;
}
const views = new Map<string, LibraryViewState>();
const storageKey = (account: string) => 'emm.library-view.v1:' + encodeURIComponent(account);
function storedView(account: string): LibraryViewState | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey(account));
    if (!raw) return;
    const value = JSON.parse(raw);
    if (!Array.isArray(value.expanded) || !value.expanded.every((id: unknown) => typeof id === 'string')
      || !(value.selected === null || typeof value.selected === 'string')
      || typeof value.query !== 'string' || !Number.isFinite(value.scrollTop) || value.scrollTop < 0
      || !Number.isFinite(value.scrollLeft) || value.scrollLeft < 0) return;
    return value;
  } catch { return; } // private mode, denied storage, malformed values, and non-browser tests
}
export function readLibraryView(account: string): LibraryViewState {
  const value = views.get(account) ?? storedView(account);
  return value ? { ...value, expanded: [...value.expanded] }
    : { expanded: [], selected: null, scrollTop: 0, scrollLeft: 0, query: '' };
}
export function saveLibraryView(account: string, value: LibraryViewState): void {
  views.set(account, { ...value, expanded: [...value.expanded] });
  try { sessionStorage.setItem(storageKey(account), JSON.stringify(value)); } catch { /* memory fallback */ }
}
/** Call only after a successful folder response, never against loading/error placeholders. */
export function pruneLibraryView(value: LibraryViewState, ids: ReadonlySet<string>): LibraryViewState {
  return { ...value, expanded: value.expanded.filter(id => ids.has(id)),
    selected: value.selected && ids.has(value.selected) ? value.selected : null };
}
/** Keep edge scrolling within the list; a root-drop overlay must not scroll it. */
export function libraryEdgeScroll(x: number, y: number,
  box: { left: number; right: number; top: number; bottom: number }, rootDrop = false): number {
  if (rootDrop || x < box.left || x > box.right || y < box.top || y > box.bottom) return 0;
  const edge = Math.min(56, (box.bottom - box.top) / 3);
  if (y < box.top + edge) return -Math.ceil(12 * (1 - (y - box.top) / edge));
  if (y > box.bottom - edge) return Math.ceil(12 * (1 - (box.bottom - y) / edge));
  return 0;
}
