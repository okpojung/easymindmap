// Bottom bar: current selection layout + whole-map node count + storage + a single zoom control.

import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { CanvasViewButtons } from './CanvasViewButtons';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { Collaborator } from '@/editor/__samples__/types';
import { I } from '@/components/icons';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { countMapNodes } from '@/export/mapMeta';
import { layoutStatus, LAYOUT_STATUS_LABEL } from './layoutStatus';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useLang, useTr } from '@/i18n';
import { TooltipButton } from '@/components/top-toolbar/Tooltip';
import bottomCopy from './bottom-toolbar-copy.json';
import { useCoarse, usePhoneLayout } from '@/hooks/useViewport';

interface Props {
  t: ThemeTokens;
  collabs: Collaborator[];
  zoom: number;
  onZoomChange: (v: number) => void;
  /** 확대/축소 묶음을 보일까 — 문서함에서는 뜻이 없어 숨긴다 (기본: 보임) */
  showZoom?: boolean;
  /** 폰: 왼쪽 패널 서랍을 연다 (없으면 단추를 그리지 않는다) */
  onOpenPanels?: () => void;
  /** 폰: 지금 보는 화면 — 주면 아웃라인/맵 전환 단추를 그린다 */
  mainView?: 'map' | 'outline';
  onToggleMainView?: () => void;
}

// 문서 무게(서버와 같은 규칙) — HTML 뷰어 상태줄도 같은 함수를 쓴다
import { fmtBytes, measureDocument } from '@/utils/mapWeight';

export function BottomStatusBar({
  t, collabs, zoom, onZoomChange, showZoom = true, onOpenPanels, mainView, onToggleMainView,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [barWidth, setBarWidth] = useState(1000);
  useLayoutEffect(() => { const el = barRef.current; if (!el) return; const observer = new ResizeObserver(() => setBarWidth(el.clientWidth)); observer.observe(el); setBarWidth(el.clientWidth); return () => observer.disconnect(); }, []);
  const tr = useTr();
  const activeCount = collabs.filter((c) => c.active).length;
  const map = useDocumentStore((s) => s.map);
  const m = useMemo(() => measureDocument(map), [map]);
  const layoutType = useEditorUiStore((s) => s.layoutType);
  const themeName = useEditorUiStore((s) => s.themeName);
  const setThemeName = useEditorUiStore((s) => s.setThemeName);
  const selectedId = useInteractionStore((s) => s.selectedId);
  const multi = useInteractionStore((s) => s.multiSelectedIds);
  const layout = useMemo(() => layoutStatus(map, layoutType, selectedId, multi), [map, layoutType, selectedId, multi]);
  const nodeCount = useMemo(() => countMapNodes(map), [map]);
  const scope = tr(layout.count > 1 ? 'shell.status.layoutSelection' : layout.count === 1 ? 'shell.status.layoutNode' : 'shell.status.layoutMap', { n: layout.count });
  const layoutText = scope + ': ' + (layout.mixed ? tr('shell.status.layoutMixed') : tr(LAYOUT_STATUS_LABEL[layout.layout] ?? 'editor.canvas.mindmap'));
  const countText = tr('shell.status.nodesAll', { n: nodeCount });
  // 폰 — 엄지가 닿는 자리라 패널 서랍·아웃라인 전환 문을 여기 둔다.
  // 손가락 입력이면 막대를 44px 로 키우고, 아래 홈 표시줄(safe-area)만큼 띄운다.
  const phone = usePhoneLayout();
  const coarse = useCoarse();
  const touchSize = coarse || phone;
  const tight = barWidth < 420;
  const minimapInMenu = barWidth < 350 && mainView !== 'outline';
  const barH = touchSize ? 48 : 42;
  const sideBtn = (testId: string, title: string, icon: React.ReactNode, onClick: () => void, active = false) => (
    <button
      data-testid={testId}
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: tight ? 32 : touchSize ? 40 : 34, height: touchSize ? 40 : 34, flexShrink: 0, borderRadius: 7,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? t.primarySoft : t.surface,
        color: active ? t.primary : t.text,
        border: `1px solid ${active ? t.primaryBorder + '66' : t.border}`, cursor: 'pointer',
      }}
    >{icon}</button>
  );

  return (
    <div
      ref={barRef}
      data-testid="bottom-status-bar"
      style={{
        height: `calc(${barH}px + env(safe-area-inset-bottom, 0px))`, flexShrink: 0,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: `max(${phone ? 8 : 12}px, env(safe-area-inset-left, 0px))`,
        paddingRight: `max(${phone ? 8 : 12}px, env(safe-area-inset-right, 0px))`,
        background: t.surfaceAlt,
        borderTop: `1px solid ${t.border}`,
        display: 'flex', alignItems: 'center',
        gap: barWidth < 480 ? 3 : phone ? 6 : 14,
        fontSize: 11, color: t.textMuted, fontWeight: 500,
        minWidth: 0,
      }}
    >
      {onOpenPanels && sideBtn('m-open-panels', tr('shell.m.panels'), <I.Sidebar size={20} strokeWidth={2} />, onOpenPanels)}
      {mainView && onToggleMainView && sideBtn(
        'm-mainview-toggle',
        mainView === 'outline' ? tr('shell.m.mapView') : tr('shell.m.outlineView'),
        mainView === 'outline' ? <I.MindMap size={20} strokeWidth={2} /> : <I.Outline size={20} strokeWidth={2} />,
        onToggleMainView,
        mainView === 'outline',
      )}
      {mainView && sideBtn('m-theme-toggle',
        tr(themeName === 'dark' ? 'shell.toolbar.toLight' : 'shell.toolbar.toDark'),
        themeName === 'dark' ? <I.Sun size={20} /> : <I.Moon size={20} />,
        () => setThemeName(themeName === 'dark' ? 'light' : 'dark'),
      )}

      <span
        data-testid="status-map-weight"
        title={
          layoutText + '\n' + countText + '\n' + tr('shell.status.weightTip')
          + (m.unknown
            ? `\n${tr('shell.status.weightUnknown', { n: m.unknown })}`
            : '')
        }
        style={{
          display: barWidth < 480 ? 'none' : 'flex', alignItems: 'center', gap: 5,
          // 좁으면 글자만 줄인다 — 확대/축소 단추를 밀어내지 않게
          minWidth: 0, overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap', scrollbarWidth: 'none',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.primary, flexShrink: 0 }} />
        <span style={{ flexShrink: 0 }}>
          <span data-testid="status-layout">{layoutText}</span>
          {' · '}<span data-testid="status-node-count">{countText}</span>{' · '}
          <span data-testid="status-storage">
          {/* 폰은 짧게 — "115B · 📎2" (전문은 데스크톱과 같은 툴팁에) */}
          {phone
            ? `${fmtBytes(m.docBytes)}${m.attachCount > 0 ? ` · 📎${m.attachCount}` : ''}`
            : tr('shell.status.weight', { doc: fmtBytes(m.docBytes), n: m.attachCount })}
          {!phone && m.attachCount > 0 && ` · ${fmtBytes(m.attachBytes)}${m.unknown ? '+' : ''}`}
          </span>
        </span>
      </span>

      <div style={{ flex: 1 }} />

      {/* [협업 UI 숨김 — MVP] "협업자 N명 · 실시간 연결됨" 안내.
          협업 기능(V2) 개발 시 featureFlags.ts의 COLLAB_PRESENCE_UI를 true로
          바꾸면 다시 표시된다. 코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <I.Users size={12} />
            {tr('shell.status.collabCount', { n: activeCount })}{' '}
            <span style={{ color: t.success, fontWeight: 600 }}>{tr('shell.status.live')}</span>
          </span>

          <span style={{ width: 1, height: 14, background: t.divider }} />
        </>
      )}

      {showZoom && <ZoomControl t={t} zoom={zoom} onZoomChange={onZoomChange} tight={tight} touchSize={touchSize} showMinimap={!minimapInMenu} />}
      {showZoom && <CanvasViewButtons t={t} narrow={barWidth < 760} compact={tight} minimapInMenu={minimapInMenu} />}
    </div>
  );
}

/** The percentage is the reset action; no duplicate 1:1 button or hidden phone controls. */
function ZoomControl({ t, zoom, onZoomChange, tight, touchSize, showMinimap }: {
  t: ThemeTokens; zoom: number; onZoomChange: (v: number) => void; tight: boolean; touchSize: boolean; showMinimap: boolean;
}) {
  const tr = useTr();
  const lang = useLang();
  const copy = bottomCopy[lang] ?? bottomCopy.en;
  const bw = tight ? 32 : touchSize ? 40 : 34;
  const bh = touchSize ? 40 : 34;
  const minimapOpen = useEditorUiStore((s) => s.minimapOpen);
  const toggleMinimap = useEditorUiStore((s) => s.toggleMinimap);
  const stepBtn = (testId: string, children: React.ReactNode, onClick: () => void, title: string) => (
    <TooltipButton type="button" data-testid={testId} onClick={onClick} title={title} aria-label={title} style={{
      width: bw, height: bh, flexShrink: 0, background: t.surface, border: '1px solid ' + t.border,
      color: t.text, cursor: 'pointer', borderRadius: 7,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</TooltipButton>
  );
  return (
    <div data-testid="zoom-controls" onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 'auto' }}>
      {stepBtn('zoom-out', <I.Minus size={21} strokeWidth={2.2} />, () => onZoomChange(Math.max(2, zoom - 5)), tr('shell.status.zoomOut'))}
      <TooltipButton type="button" data-testid="zoom-reset" onClick={() => onZoomChange(100)}
        title={copy.zoomReset} aria-label={Math.round(zoom) + '% · ' + copy.zoomReset}
        style={{ width: tight ? 48 : 54, height: bh, padding: '0 3px', flexShrink: 0,
          background: t.surface, border: '1px solid ' + t.border, borderRadius: 7,
          color: t.text, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          fontFamily: 'ui-monospace, monospace' }}>{Math.round(zoom)}%</TooltipButton>
      {stepBtn('zoom-in', <I.Plus size={21} strokeWidth={2.2} />, () => onZoomChange(Math.min(400, zoom + 5)), tr('shell.status.zoomIn'))}
      {showMinimap && <TooltipButton type="button" data-testid="minimap-toggle" onClick={toggleMinimap}
        title={copy.minimapToggle} aria-label={copy.minimapToggle} aria-pressed={minimapOpen}
        style={{ width: bw, height: bh, flexShrink: 0, border: '1px solid ' + (minimapOpen ? t.primaryBorder : t.border),
          borderRadius: 7, cursor: 'pointer', background: minimapOpen ? t.primarySoft : t.surface,
          color: minimapOpen ? t.primary : t.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      ><I.Minimap size={21} strokeWidth={2} /></TooltipButton>}
    </div>
  );
}
