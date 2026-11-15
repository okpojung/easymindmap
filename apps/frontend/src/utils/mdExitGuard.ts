// No stores/React/network dependencies: document exits share this small registry.
export interface MdExitGuard {
  prepare?: () => void;
  pending: () => boolean;
  flush: () => Promise<boolean>;
}
const guards = new Set<MdExitGuard>();
export function registerMdExitGuard(guard: MdExitGuard): () => void {
  guards.add(guard);
  return () => { guards.delete(guard); };
}
export function hasPendingMdEdits(): boolean {
  for (const guard of guards) {
    try { guard.prepare?.(); if (guard.pending()) return true; }
    catch { return true; } // Missing/inaccessible content must never silently permit exit.
  }
  return false;
}
export async function flushMdExits(): Promise<boolean> {
  for (;;) {
    let flushed = false;
    for (const guard of [...guards]) {
      try {
        guard.prepare?.();
        if (!guard.pending()) continue;
        if (!await guard.flush()) return false;
        flushed = true;
      } catch { return false; }
    }
    if (!flushed || !hasPendingMdEdits()) return true;
  }
}

/** Hiding/unmounting the editor is also an exit, even when the map stays open. */
export async function afterMdExit(action: () => void): Promise<boolean> {
  if (!await flushMdExits()) return false;
  action();
  return true;
}
