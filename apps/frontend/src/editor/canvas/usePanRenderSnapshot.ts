import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useViewportStore } from '@/stores/viewportStore';

export interface PanPoint { panX: number; panY: number }

/** Keep a guard band inside Canvas's existing half-viewport overscan. */
export function needsPanRender(anchor: PanPoint, next: PanPoint, width: number, height: number): boolean {
  return Math.abs(next.panX - anchor.panX) >= Math.max(16, width * 0.25)
    || Math.abs(next.panY - anchor.panY) >= Math.max(16, height * 0.25);
}

export function outsidePanCoverage(anchor: PanPoint, next: PanPoint, width: number, height: number): boolean {
  return Math.abs(next.panX - anchor.panX) >= Math.max(32, width * 0.5)
    || Math.abs(next.panY - anchor.panY) >= Math.max(32, height * 0.5);
}

export function cameraTransform(cx: number, cy: number, panX: number, panY: number, zoom: number): string {
  return `translate(${cx + panX} ${cy + panY}) scale(${(zoom || 100) / 100}) translate(${-cx} ${-cy})`;
}

/**
 * The viewport store remains authoritative, including for minimap/edit overlays.
 * During a pan only the existing world group's transform changes each frame.
 * React refreshes the overscanned scene before its guard band is exhausted, and
 * always at gesture end. Zoom/search/reset outside a pan keep normal rendering.
 */
export function usePanRenderSnapshot(width: number, height: number,
  paint: (panX: number, panY: number, zoom: number) => void) {
  const [pan, setPan] = useState<PanPoint>(() => {
    const s = useViewportStore.getState();
    return { panX: s.panX, panY: s.panY };
  });
  const active = useRef(false);
  const deferAllowed = useRef(true);
  const geometry = useRef({ width, height, paint });
  geometry.current = { width, height, paint };
  const anchor = useRef(pan);
  anchor.current = pan;
  const sync = useCallback((panX: number, panY: number) => {
    setPan(old => old.panX === panX && old.panY === panY ? old : { panX, panY });
  }, []);

  useLayoutEffect(() => useViewportStore.subscribe((s, previous) => {
    if (s.panX === previous.panX && s.panY === previous.panY && s.zoom === previous.zoom) return;
    if (active.current) {
      const g = geometry.current;
      // A teleport must not expose an unrendered strip. Let React populate
      // that scene first rather than moving beyond the painted overscan.
      if (!outsidePanCoverage(anchor.current, s, g.width, g.height)) g.paint(s.panX, s.panY, s.zoom);
      if (deferAllowed.current && s.zoom === previous.zoom
          && !needsPanRender(anchor.current, s, g.width, g.height)) return;
    }
    sync(s.panX, s.panY);
  }), [sync]);

  // An unrelated React update must not roll back the live camera transform.
  useLayoutEffect(() => {
    if (active.current) {
      const s = useViewportStore.getState();
      const g = geometry.current;
      if (!outsidePanCoverage(anchor.current, s, g.width, g.height)) g.paint(s.panX, s.panY, s.zoom);
    }
  });

  const begin = useCallback((visiblePanX?: number, visiblePanY?: number) => {
    const s = useViewportStore.getState();
    // Preserve Canvas's guarded first-screen camera, even when its raw store
    // was stale. A stationary press must not disarm auto-home or jump the map.
    if (visiblePanX !== undefined && visiblePanY !== undefined
        && (s.panX !== visiblePanX || s.panY !== visiblePanY)) s.setHomePan(visiblePanX, visiblePanY);
    active.current = true;
  }, []);
  const end = useCallback(() => {
    active.current = false;
    const s = useViewportStore.getState();
    sync(s.panX, s.panY);
  }, [sync]);
  return { ...pan, active, deferAllowed, begin, end };
}
