export interface ToolbarPoint { x: number; y: number }
export interface ToolbarSize { width: number; height: number }
export const TOOLBAR_STORAGE_KEY = 'emm.canvas.floatingToolbar.v1';
export interface ToolbarPreference { position: ToolbarPoint | null; pinned: boolean; collapsed: boolean }
export function clampToolbarPosition(position: ToolbarPoint, toolbar: ToolbarSize, bounds: ToolbarSize, margin = 8): ToolbarPoint {
  const axis = (value: number, size: number, bound: number) => {
    const limit = Math.max(0, bound - size);
    const inset = Math.min(margin, limit / 2);
    return Math.min(Math.max(inset, Number.isFinite(value) ? value : inset), Math.max(inset, limit - inset));
  };
  return { x: axis(position.x, toolbar.width, bounds.width), y: axis(position.y, toolbar.height, bounds.height) };
}
export function readToolbarPreference(raw: string | null): ToolbarPreference {
  const fallback = { position: null, pinned: false, collapsed: false };
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object') return fallback;
    const p = value.position;
    return { position: p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : null, pinned: value.pinned === true, collapsed: value.collapsed === true };
  } catch { return fallback; }
}
