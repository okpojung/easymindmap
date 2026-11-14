import { TooltipButton } from '@/components/top-toolbar/Tooltip';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { useCoarse } from '@/hooks/useViewport';
import { useTr } from '@/i18n';
import { clampToolbarPosition, readToolbarPreference, TOOLBAR_STORAGE_KEY, type ToolbarPoint } from './floatingToolbarPosition';

export function FloatingToolbarFrame({ t, children, compact }: { t: ThemeTokens; children: ReactNode; compact?: boolean }) {
  const tr = useTr();
  const ref = useRef<HTMLDivElement>(null);
  const coarse = useCoarse();
  const [pref, setPref] = useState(() => { try { return readToolbarPreference(localStorage.getItem(TOOLBAR_STORAGE_KEY)); } catch { return readToolbarPreference(null); } });
  const [position, setPosition] = useState<ToolbarPoint | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; start: ToolbarPoint } | null>(null);
  const latest = useRef(pref); latest.current = pref;
  const currentPosition = useRef(position); currentPosition.current = position;
  const clamp = useCallback((candidate?: ToolbarPoint | null) => {
    const el = ref.current; const parent = el?.parentElement;
    if (!el || !parent) return;
    const p = clampToolbarPosition(candidate ?? { x: parent.clientWidth - el.offsetWidth - 14, y: 14 }, { width: el.offsetWidth, height: el.offsetHeight }, { width: parent.clientWidth, height: parent.clientHeight });
    currentPosition.current = p;
    setPosition((old) => old?.x === p.x && old?.y === p.y ? old : p);
  }, []);
  useLayoutEffect(() => {
    const resize = () => clamp(latest.current.position);
    resize();
    const observer = new ResizeObserver(resize);
    if (ref.current) observer.observe(ref.current);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    return () => observer.disconnect();
  }, [clamp]);
  useLayoutEffect(() => { clamp(pref.position); try { localStorage.setItem(TOOLBAR_STORAGE_KEY, JSON.stringify(pref)); } catch { /* Storage may be unavailable. */ } }, [pref, clamp]);
  const buttonStyle = { flexShrink: 0, width: coarse ? 40 : 28, height: coarse ? 40 : 28, border: 0, borderRadius: 5, background: t.surfaceAlt, color: t.text, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } as const;
  const reset = () => setPref((p) => ({ ...p, position: null }));
  return <div ref={ref} data-testid={compact ? 'm-canvas-toolbar' : 'canvas-floating-toolbar'} data-pinned={pref.pinned} data-collapsed={pref.collapsed}
    onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}
    style={{ position: 'absolute', left: position?.x ?? undefined, top: position?.y ?? 14, right: position ? undefined : 14, zIndex: 5, maxWidth: '100%', boxSizing: 'border-box', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3, padding: 3, borderRadius: 9, background: t.surface, border: '1px solid ' + t.border, boxShadow: t.shadowSm }}>
    <div style={{ display: 'flex', flexShrink: 0, gap: 2 }}>
      <TooltipButton type="button" data-testid="toolbar-collapse" style={buttonStyle} aria-label={tr(pref.collapsed ? 'editor.toolbar.chromeExpand' : 'editor.toolbar.chromeCollapse')} title={tr(pref.collapsed ? 'editor.toolbar.chromeExpand' : 'editor.toolbar.chromeCollapse')} aria-expanded={!pref.collapsed} onClick={() => setPref((p) => ({ ...p, collapsed: !p.collapsed }))}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"><path d={pref.collapsed ? 'M5 3l5 5-5 5' : 'M11 3L6 8l5 5'} /></svg>
      </TooltipButton>
      <TooltipButton type="button" data-testid="toolbar-drag" aria-label={tr('editor.toolbar.chromeMove')} title={tr('editor.toolbar.chromeMoveHint')} style={{ ...buttonStyle, touchAction: 'none', cursor: pref.pinned ? 'default' : 'grab' }}
        onDoubleClick={reset} onKeyDown={(e) => { if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); reset(); } else if (!pref.pinned && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); const p = position ?? { x: 14, y: 14 }; setPref((old) => ({ ...old, position: { x: p.x + (e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0), y: p.y + (e.key === 'ArrowUp' ? -10 : e.key === 'ArrowDown' ? 10 : 0) } })); } }}
        onPointerDown={(e) => { if (pref.pinned || e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, start: position ?? { x: 14, y: 14 } }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d || d.pointer !== e.pointerId) return; clamp({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }); }}
        onPointerUp={(e) => { if (drag.current?.pointer !== e.pointerId) return; drag.current = null; setPref((p) => ({ ...p, position: currentPosition.current })); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { drag.current = null; clamp(pref.position); }} onLostPointerCapture={() => { drag.current = null; }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="4" r="1.2"/><circle cx="11" cy="4" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="11" cy="8" r="1.2"/><circle cx="5" cy="12" r="1.2"/><circle cx="11" cy="12" r="1.2"/></svg>
      </TooltipButton>
      <TooltipButton type="button" data-testid="toolbar-pin" style={{ ...buttonStyle, color: pref.pinned ? t.primary : t.text }} aria-label={tr(pref.pinned ? 'editor.toolbar.chromeUnpin' : 'editor.toolbar.chromePin')} title={tr(pref.pinned ? 'editor.toolbar.chromeUnpin' : 'editor.toolbar.chromePin')} aria-pressed={pref.pinned} onClick={() => setPref((p) => ({ ...p, pinned: !p.pinned }))}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill={pref.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3"><path d="M5 2h6l-1 5 2 3H4l2-3-1-5ZM8 10v5"/></svg>
      </TooltipButton>
    </div>
    <div style={{ display: pref.collapsed ? 'none' : 'flex', flexWrap: 'wrap', alignItems: 'center', gap: compact ? 2 : 4, minWidth: 0, maxWidth: '100%' }}>{children}</div>
  </div>;
}
