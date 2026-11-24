// Browser-only UI preference. Never changes a map, its viewport or server state.
export type MinimapPin = 'user' | 'right' | 'left';
export interface MinimapWindowState { pin: MinimapPin; point: { x: number; y: number } | null }
export const MINIMAP_WINDOW_KEY = 'easymindmap.minimap.window.v1';
export const defaultMinimapWindow = (): MinimapWindowState => ({ pin: 'user', point: null });
export function parseMinimapWindow(raw: string | null): MinimapWindowState {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (!s || !['user', 'right', 'left'].includes(s.pin)) return defaultMinimapWindow();
    const p = s.point;
    return { pin: s.pin, point: p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { x: Math.max(0, Math.min(1e7, p.x)), y: Math.max(0, Math.min(1e7, p.y)) } : null };
  } catch { return defaultMinimapWindow(); }
}
export function loadMinimapWindow(): MinimapWindowState {
  try { return parseMinimapWindow(localStorage.getItem(MINIMAP_WINDOW_KEY)); } catch { return defaultMinimapWindow(); }
}
export function saveMinimapWindow(s: MinimapWindowState): void {
  try { localStorage.setItem(MINIMAP_WINDOW_KEY, JSON.stringify(s)); } catch { /* Storage unavailable: keep in-memory behavior. */ }
}
export function nextMinimapPin(pin: MinimapPin): MinimapPin { return pin === 'user' ? 'right' : pin === 'right' ? 'left' : 'user'; }
export function minimapWindowPosition(s: MinimapWindowState, W: number, H: number, width: number, height: number, margin: number) {
  const maxX = Math.max(0, W - width - margin), maxY = Math.max(0, H - height - margin);
  const minX = Math.min(margin, maxX), minY = Math.min(margin, maxY);
  const x = s.pin === 'left' ? minX : s.pin === 'right' ? maxX : s.point?.x ?? maxX;
  const y = s.pin === 'user' ? s.point?.y ?? maxY : maxY;
  return { x: Math.max(minX, Math.min(maxX, x)), y: Math.max(minY, Math.min(maxY, y)) };
}
export function moveMinimapWindow(s: MinimapWindowState, x: number, y: number, W: number, H: number, width: number, height: number, margin: number): MinimapWindowState {
  if (s.pin !== 'user' || !Number.isFinite(x) || !Number.isFinite(y)) return s;
  return { pin: 'user', point: minimapWindowPosition({ pin: 'user', point: { x, y } }, W, H, width, height, margin) };
}
