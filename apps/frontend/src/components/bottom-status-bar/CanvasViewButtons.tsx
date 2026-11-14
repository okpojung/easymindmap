import { TooltipButton } from '@/components/top-toolbar/Tooltip';
import { useEffect, useState } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import { I } from '@/components/icons';
import { useTr } from '@/i18n';
import { useCoarse, usePhoneLayout } from '@/hooks/useViewport';
import { useViewportStore } from '@/stores/viewportStore';
import { useCanvasViewControls } from '@/editor/canvas/canvasViewControls';
export function CanvasViewButtons({ t, narrow, compact = false }: { t: ThemeTokens; narrow: boolean; compact?: boolean }) {
  const controls = useCanvasViewControls();
  const tr = useTr(); const coarse = useCoarse(); const phone = usePhoneLayout();
  const touchSize = coarse || phone;
  const buttonWidth = compact ? 32 : touchSize ? 40 : 34;
  const buttonHeight = touchSize ? 40 : 34;
  const pan = useViewportStore((s) => s.panMode); const togglePan = useViewportStore((s) => s.togglePanMode);
  const [fullscreen, setFullscreen] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { const change = () => setFullscreen(!!document.fullscreenElement); change(); document.addEventListener('fullscreenchange', change); return () => document.removeEventListener('fullscreenchange', change); }, []);
  useEffect(() => { if (!open) return; const close = (e: PointerEvent) => { if (!(e.target as Element).closest?.('[data-testid="canvas-view-buttons"]')) setOpen(false); }; const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', key); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); }; }, [open]);
  if (!controls) return null;
  const button = (id: string, title: string, icon: React.ReactNode, action?: () => void, active = false, disabled = false) => <TooltipButton type="button" data-testid={id} title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={() => { action?.(); setOpen(false); }} style={{ width: buttonWidth, height: buttonHeight, flexShrink: 0, border: '1px solid ' + t.border, borderRadius: 7, background: active ? t.primarySoft : t.surface, color: active ? t.primary : t.text, opacity: disabled ? .4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer' }}>{icon}</TooltipButton>;
  const extras = <>
    {button('canvas-view-focus', (controls.kanban ? tr('editor.toolbar.m.scrollToCard') : tr(controls.focusActive ? 'editor.toolbar.m.focusOff' : 'editor.toolbar.m.focus') + ' (Alt+F)'), controls.focusActive ? <I.FocusOff size={20} strokeWidth={2}/> : <I.Focus size={20} strokeWidth={2}/>, controls.onFocusSelected, controls.focusActive, !controls.onFocusSelected || (!controls.hasSelection && !controls.focusActive))}
    {button('canvas-view-fit', tr(controls.kanban ? 'editor.toolbar.boardHome' : 'editor.toolbar.fit'), <I.FitMap size={20} strokeWidth={2}/>, controls.onFitView, false, !controls.onFitView)}
    {typeof document !== 'undefined' && (document.fullscreenEnabled ?? typeof document.documentElement.requestFullscreen === 'function') && button('canvas-view-fullscreen', tr(fullscreen ? 'editor.toolbar.m.fullscreenExit' : 'editor.toolbar.m.fullscreen'), fullscreen ? <I.Shrink size={20} strokeWidth={2}/> : <I.Expand size={20} strokeWidth={2}/>, () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void document.documentElement.requestFullscreen?.()?.catch(() => {}); }, fullscreen)}
  </>;
  return <div data-testid="canvas-view-buttons" onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }} style={{ display: 'flex', gap: 3, alignItems: 'center', position: 'relative', flexShrink: 0 }}>
    {!controls.kanban && button('m-canvas-pan', tr('editor.toolbar.m.pan') + ' (H)', <I.Hand size={21} strokeWidth={2}/>, togglePan, pan)}
    {narrow ? <><TooltipButton type="button" data-testid="canvas-view-more" aria-label={tr('editor.toolbar.groupView')} title={tr('editor.toolbar.groupView')} aria-expanded={open} onClick={() => setOpen(!open)} style={{ width: buttonWidth, height: buttonHeight, background: t.surface, color: t.text, border: '1px solid ' + t.border, borderRadius: 6 }}><I.MoreH size={20} strokeWidth={2}/></TooltipButton>{open && <div role="group" aria-label={tr('editor.toolbar.groupView')} style={{ display: 'flex', gap: 4, position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', padding: 6, background: t.surface, border: '1px solid ' + t.border, borderRadius: 8, zIndex: 50, boxShadow: t.shadowSm }}>{extras}</div>}</> : extras}
  </div>;
}
