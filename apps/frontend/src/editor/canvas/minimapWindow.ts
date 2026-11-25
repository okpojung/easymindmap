// Browser-only UI preference. Never changes a map, its viewport or server state.
export type MinimapPin = 'user' | 'right' | 'left';
export interface MinimapSize { w: number; h: number }
export interface MinimapWindowState { pin: MinimapPin; point: { x: number; y: number } | null; size?: MinimapSize }
export const MINIMAP_WINDOW_KEY = 'easymindmap.minimap.window.v1';
export const defaultMinimapWindow = (): MinimapWindowState => ({ pin: 'user', point: null });
export function parseMinimapWindow(raw: string | null): MinimapWindowState {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (!s || !['user', 'right', 'left'].includes(s.pin)) return defaultMinimapWindow();
    const p = s.point;
    const result: MinimapWindowState = { pin: s.pin, point: p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ? { x: Math.max(0, Math.min(1e7, p.x)), y: Math.max(0, Math.min(1e7, p.y)) } : null };
    if (s.size && Number.isFinite(s.size.w) && Number.isFinite(s.size.h) && s.size.w > 0 && s.size.h > 0) {
      result.size = { w: Math.round(Math.max(132, Math.min(640, s.size.w))), h: Math.round(Math.max(96, Math.min(480, s.size.h))) };
    }
    return result;
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
  return { ...s, pin: 'user', point: minimapWindowPosition({ ...s, pin: 'user', point: { x, y } }, W, H, width, height, margin) };
}

/** Clamp the rendered size without overwriting a saved desktop preference on phone screens. */
export function minimapWindowSize(s: MinimapWindowState, fallback: MinimapSize, W: number, H: number, margin: number): MinimapSize {
  const wanted = s.size ?? fallback;
  const maxW = Math.max(1, Math.min(640, W - 2 * margin - 10));
  const maxH = Math.max(1, Math.min(480, H - 2 * margin - 10));
  return { w: Math.min(maxW, Math.max(s.size ? Math.min(132, maxW) : 1, wanted.w)),
    h: Math.min(maxH, Math.max(s.size ? Math.min(96, maxH) : 1, wanted.h)) };
}
export function resizeMinimapWindow(s: MinimapWindowState, size: MinimapSize, anchor: { x: number; y: number }, W: number, H: number, margin: number): MinimapWindowState {
  if (!Number.isFinite(size.w) || !Number.isFinite(size.h)) return s;
  const next = minimapWindowSize({ ...s, size }, size, W, H, margin);
  const result = { ...s, size: { w: Math.floor(next.w), h: Math.floor(next.h) } };
  if (s.pin === 'user') result.point = minimapWindowPosition({ ...result, point: anchor }, W, H, result.size.w + 10, result.size.h + 10, margin);
  return result;
}
