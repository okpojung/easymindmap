import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
export interface CanvasViewControls { hasSelection: boolean; focusActive?: boolean; onFitView?: () => void; onFocusSelected?: () => void; kanban?: boolean }
const registrations = new Map<symbol, CanvasViewControls>();
const listeners = new Set<() => void>();
let current: CanvasViewControls | null = null;
function publish() { const values = [...registrations.values()]; current = values[values.length - 1] ?? null; listeners.forEach((fn) => fn()); }
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useRegisterCanvasViewControls(value: CanvasViewControls) {
  const owner = useRef(Symbol('canvas-view'));
  const stable = useMemo(() => value, [value.hasSelection, value.focusActive, value.onFitView, value.onFocusSelected, value.kanban]);
  useEffect(() => { registrations.set(owner.current, stable); publish(); return () => { registrations.delete(owner.current); publish(); }; }, [stable]);
}
export function useCanvasViewControls() { return useSyncExternalStore(subscribe, () => current, () => null); }
