// 미니맵 — 캔버스 우하단의 축소 전체 보기 (2026-09-21 사용자 요청).
// 하단 상태바의 미니맵 버튼 또는 Alt+H 로 켜고 끈다.
//   · 노드는 자리·색만 작은 사각형으로 (연결선·글자는 그리지 않는다)
//   · 지금 보이는 영역이 사각형으로 — 크기 = 캔버스 창 px ÷ 배율, 최소 60×45
//   · 사각형을 끌면 화면이 따라 움직이고, 빈 곳을 누르면 그 자리가 중앙
//   · 패널은 우하단 모서리로 크기를 조절한다(로컬 UI 설정). 맵이 크면 화면 주변만 보이는 창이 된다
//     (2026-09-21 "창과 표시창이 너무 작다" 보고 뒤) — 가만히 있을 땐 사각형이
//     가장자리에 닿을 때만 창이 옮겨 가고, **끄는 동안은 사각형을 가장자리로
//     미는 만큼 창이 흐른다**(2026-09-21 "끝으로 옮기면 전체 맵이 빨리 안
//     보인다" 보고). 휠은 메인 캔버스와 같다(휠=위아래, Shift=좌우, Ctrl=확대, 2026-11-26).
//   · 노드는 팔레트의 **테두리색(진한 색)** 으로 칠한다 — 채움색은 캔버스와
//     비슷해 구분이 안 됐다(2026-09-21 보고). 색이 없는 하위 노드는 textSubtle.
// 좌표 계산은 minimapMath.ts (단위 테스트), 사양은 10-canvas.md §6.8.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MinimapHelp } from './MinimapHelp';
import { loadMinimapWindow, saveMinimapWindow, minimapWindowPosition, minimapWindowSize, moveMinimapWindow, resizeMinimapWindow, nextMinimapPin, type MinimapWindowState } from './minimapWindow';
import { minimapForwardWheelInit } from './minimapWheel';
import './Minimap.css';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LaidOutNode } from '@/layout/types';
import { resolveNodeColors } from '@/editor/node-renderer/resolveNodeColors';
import { useViewportStore } from '@/stores/viewportStore';
import { useTr } from '@/i18n';
import {
  minimapGeometry, minimapPanelSize, miniToWorld, panForCenter, viewportWorldRect, worldBounds, worldToMini,
  type MinimapOriginMode,
  clampCenterToBounds,
  withOverlayMargin,
} from './minimapMath';

interface Props {
  t: ThemeTokens;
  nodes: LaidOutNode[];
  W: number;
  H: number;
  CX: number;
  CY: number;
  /** 폰 폭 — 작은 패널로 (모바일 웹, 2026-10-05) */
  compact?: boolean;
  onClose: () => void;
}

export function Minimap({ t, nodes, W, H, CX, CY, compact, onClose }: Props) {
  const tr = useTr();
  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);
  const setPan = useViewportStore((s) => s.setPan);

  const [windowState, setWindowState] = useState(loadMinimapWindow);
  const windowRef = useRef(windowState); windowRef.current = windowState;
  const [panelMoving, setPanelMoving] = useState(false);
  const [panelResizing, setPanelResizing] = useState(false);
  const resizeHandle = useRef<HTMLButtonElement | null>(null);
  const panelResize = useRef<{ pointerId: number; clientX: number; clientY: number; w: number; h: number; anchor: { x: number; y: number }; before: MinimapWindowState; origin: { x: number; y: number; scale: number } | null; hold: boolean } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const panelDrag = useRef<{ pointerId: number; clientX: number; clientY: number; x: number; y: number; before: MinimapWindowState } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // 끄는 중 — 포인터와 화면 사각형 중심의 간격(mini px)을 유지한다
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const nodeBounds = useMemo(() => worldBounds(nodes), [nodes]);
  const viewWorld = viewportWorldRect(W, H, CX, CY, panX, panY, zoom);
  // 직전 영역 — 창 모드에서 사각형이 가장자리에 닿기 전까지는 그대로 둔다
  const originRef = useRef<{ x: number; y: number; scale: number } | null>(null);
  // 휠로 창을 옮긴 뒤에는 표시창과 무관하게 그 창을 지킨다 (다음 클릭·끌기까지)
  const [hold, setHold] = useState(false);
  const mode: MinimapOriginMode = dragging ? 'follow' : hold ? 'hold' : 'auto';
  // 폰 폭에서는 화면의 40% × 20% 안쪽 — 데스크톱 최소 200×150 은 390px 화면의 절반을 가린다
  const full = minimapPanelSize(W, H);
  const margin = compact ? 8 : 14;
  const panelSize = minimapWindowSize(windowState, {
    w: compact ? Math.round(Math.min(160, W * 0.42)) : full.panelW,
    h: compact ? Math.round(Math.min(120, H * 0.2)) : full.panelH,
  }, W, H, margin);
  const panelW = panelSize.w, panelH = panelSize.h;
  const position = minimapWindowPosition(windowState, W, H, panelW + 10, panelH + 10, margin);
  const commitWindow = (s: MinimapWindowState) => { windowRef.current = s; setWindowState(s); saveMinimapWindow(s); };
  const movePanel = (x: number, y: number) => {
    const s = moveMinimapWindow(windowRef.current, x, y, W, H, panelW + 10, panelH + 10, margin);
    windowRef.current = s; setWindowState(s);
  };
  const startPanelDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.button !== 0 || panelResize.current || windowRef.current.pin !== 'user' || (e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    panelDrag.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, x: position.x, y: position.y, before: windowRef.current };
    e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); setPanelMoving(true);
  };
  const endPanelDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = panelDrag.current; if (!d || d.pointerId !== e.pointerId) return;
    panelDrag.current = null; setPanelMoving(false);
    if (e.type === 'pointercancel') { windowRef.current = d.before; setWindowState(d.before); }
    else saveMinimapWindow(windowRef.current);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const finishResize = (pointerId: number, commit: boolean, target: HTMLButtonElement) => {
    const d = panelResize.current; if (!d || d.pointerId !== pointerId) return;
    panelResize.current = null; setPanelResizing(false);
    if (commit) saveMinimapWindow(windowRef.current);
    else { originRef.current = d.origin; setHold(d.hold); windowRef.current = d.before; setWindowState(d.before); }
    if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
  };
  const endResize = (e: ReactPointerEvent<HTMLButtonElement>) => finishResize(e.pointerId, e.type === 'pointerup', e.currentTarget);
  const geom = minimapGeometry(nodeBounds, viewWorld, panelW, panelH, originRef.current, mode);
  originRef.current = { x: geom.bounds.x, y: geom.bounds.y, scale: geom.scale };
  const view = worldToMini(geom, viewWorld);
  // 휠 = 메인 캔버스와 똑같이 (2026-11-26 "미니맵 안에서도 휠 동작" 요청):
  //   휠 = 위아래 · Shift+휠 = 좌우 · Ctrl/Cmd+휠 = 확대/축소.
  // 캔버스의 휠 처리기에 그대로 넘기되 확대 기준점은 미니맵 뒤가 아닌 화면 가운데로.
  // 맵이 창보다 크면 자동 따라가기(auto)로 표시창을 계속 보여 준다.
  // preventDefault 가 필요해 non-passive 로 단다.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation();
      if (panelResize.current || panelDrag.current) return;
      const canvas = el.closest<HTMLElement>('[data-mm-canvas-root]');
      if (!canvas) return;
      setHold(false);
      canvas.dispatchEvent(new WheelEvent('wheel', minimapForwardWheelInit(e, canvas.getBoundingClientRect())));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const miniPoint = (e: ReactPointerEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const centerAt = (mx: number, my: number) => {
    const w0 = miniToWorld(geom, mx, my);
    // 맵 바깥의 빈 공간으로는 가지 않는다 — 화면 사각형이 노드 경계 안에 머문다 (clampCenterToBounds)
    // 위·옆·아래에 화면 여백을 더해 가둔다 — 맨 위로 올려도 중심주제가 칩·도구막대 밑에 깔리지 않게
    const w = clampCenterToBounds(w0.x, w0.y, withOverlayMargin(nodeBounds, zoom), viewWorld);
    const p = panForCenter(w.x, w.y, CX, CY, zoom);
    setPan(p.panX, p.panY);
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || panelResize.current || panelDrag.current) return;
    e.stopPropagation();
    setHold(false);
    const m = miniPoint(e);
    const inside = m.x >= view.x && m.x <= view.x + view.w && m.y >= view.y && m.y <= view.y + view.h;
    // 사각형 안에서 시작 = 그 간격을 유지하며 끌기 · 밖 = 그 자리가 중앙이 되고 이어서 끌기
    const dx = inside ? m.x - (view.x + view.w / 2) : 0;
    const dy = inside ? m.y - (view.y + view.h / 2) : 0;
    if (!inside) centerAt(m.x, m.y);
    dragRef.current = { pointerId: e.pointerId, dx, dy };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const m = miniPoint(e);
    centerAt(m.x - d.dx, m.y - d.dy);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <>
    <div
      data-testid="minimap"
      data-pin={windowState.pin}
      data-panel-moving={panelMoving}
      data-panel-resizing={panelResizing}
      data-help-open={helpOpen}
      className="mm-overlay-controls mm-minimap"
      onPointerDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
      onWheel={e => e.stopPropagation()}
      style={{
        position: 'absolute', left: position.x, top: position.y, zIndex: 6, width: panelW, boxSizing: 'content-box',
        background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8,
        boxShadow: t.shadowSm, padding: 4, userSelect: 'none',
      }}
    >
      <div className="mm-minimap-top">
        <div className="mm-minimap-bar" data-testid="minimap-titlebar" role="group" tabIndex={0}
          aria-label={tr('editor.minimap.move')} title={tr(windowState.pin === 'user' ? 'editor.minimap.move' : 'editor.minimap.pinned')}
          onPointerDown={startPanelDrag}
          onPointerMove={e => { const d = panelDrag.current; if (d?.pointerId === e.pointerId) { e.stopPropagation(); movePanel(d.x + e.clientX - d.clientX, d.y + e.clientY - d.clientY); } }}
          onPointerUp={endPanelDrag} onPointerCancel={endPanelDrag} onLostPointerCapture={endPanelDrag}
          onKeyDown={e => {
            if (e.target !== e.currentTarget) return;
            const directions: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const delta = directions[e.key];
            if (!delta) return;
            e.preventDefault(); e.stopPropagation();
            const step = e.shiftKey ? 50 : 10;
            movePanel(position.x + delta[0] * step, position.y + delta[1] * step); saveMinimapWindow(windowRef.current);
          }}>
          <button type="button" data-testid="minimap-pin" disabled={panelResizing} aria-pressed={windowState.pin !== 'user'}
            aria-label={tr('editor.minimap.pin.' + windowState.pin)} title={tr('editor.minimap.pin.' + windowState.pin)}
            onPointerDown={e => e.stopPropagation()} onClick={() => commitWindow({ ...windowRef.current, pin: nextMinimapPin(windowRef.current.pin) })}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3h8l-1 6 4 4v2H5v-2l4-4-1-6ZM12 15v7" /></svg>
          </button>
          <span className="mm-minimap-title">{tr('editor.minimap.title')}</span>
          <button type="button" data-testid="minimap-help" disabled={panelResizing} aria-haspopup="dialog" aria-label={tr('editor.minimap.help')} title={tr('editor.minimap.help')}
            onPointerDown={e => e.stopPropagation()} onClick={() => setHelpOpen(true)}>?</button>
          <button type="button" data-testid="minimap-close" aria-label={tr('editor.minimap.close')} title={tr('editor.minimap.close')}
            onPointerDown={e => e.stopPropagation()} onClick={onClose}>×</button>
        </div>
      </div>
      <svg
        ref={svgRef}
        width={geom.panelW}
        height={geom.panelH}
        data-minimap-scale={geom.scale}
        data-minimap-origin={`${geom.bounds.x},${geom.bounds.y}`}
        data-minimap-fits={geom.fits ? '1' : '0'}
        data-minimap-mode={mode}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onPointerUp}
        onClick={(e) => e.stopPropagation()}
        // touchAction none — 손가락으로 표시창을 끌 때 페이지가 스크롤되지 않게
        style={{ display: 'block', cursor: dragging ? 'grabbing' : 'grab', overflow: 'hidden', borderRadius: 5, background: t.surfaceAlt, touchAction: 'none' }}
      >
        {nodes.map((n) => {
          const c = resolveNodeColors(n, t);
          const r = worldToMini(geom, { x: n.x - n.w / 2, y: n.y - n.h / 2, w: n.w, h: n.h });
          // 창 밖 노드는 그리지 않는다 (900 노드 맵에서도 가볍게)
          if (r.x + r.w < 0 || r.y + r.h < 0 || r.x > geom.panelW || r.y > geom.panelH) return null;
          // 대비 — 색 계열이 있는 노드는 그 계열의 진한 테두리색, 없는 하위 노드는 textSubtle
          const own = n.style?.fillColor && n.style.fillColor !== 'transparent' ? n.style.fillColor : undefined;
          const fill = own ?? (c === t.nodeL2 ? t.textSubtle : c.border);
          return (
            <rect
              key={n.id}
              x={r.x} y={r.y} width={Math.max(2, r.w)} height={Math.max(1.5, r.h)} rx={1}
              fill={fill}
              fillOpacity={0.9}
            />
          );
        })}
        <rect
          data-testid="minimap-viewport"
          x={view.x} y={view.y} width={view.w} height={view.h}
          fill={`${t.primary}22`}
          stroke={t.primary}
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
      <button ref={resizeHandle} type="button" className="mm-minimap-resize" data-testid="minimap-resize"
        aria-label={tr('editor.minimap.resize')} title={tr('editor.minimap.resize')}
        style={{ color: t.textMuted }}
        onPointerDown={e => {
          e.preventDefault(); e.stopPropagation();
          if (e.button !== 0 || panelResize.current || panelDrag.current || dragRef.current) return;
          panelResize.current = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, w: panelW, h: panelH, anchor: position, before: windowRef.current, origin: originRef.current, hold };
          e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId); setPanelResizing(true);
        }}
        onPointerMove={e => {
          const d = panelResize.current; if (!d || d.pointerId !== e.pointerId) return;
          e.stopPropagation();
          const s = resizeMinimapWindow(d.before, { w: d.w + e.clientX - d.clientX, h: d.h + e.clientY - d.clientY }, d.anchor, W, H, margin);
          windowRef.current = s; setWindowState(s);
        }}
        onPointerUp={endResize} onPointerCancel={endResize} onLostPointerCapture={endResize}
        onKeyDown={e => {
          if (e.key === 'Escape' && panelResize.current) {
            e.preventDefault(); e.stopPropagation(); finishResize(panelResize.current.pointerId, false, e.currentTarget); return;
          }
          if (panelResize.current) return;
          const directions: Record<string, number[]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
          const delta = directions[e.key]; if (!delta) return;
          e.preventDefault(); e.stopPropagation(); const step = e.shiftKey ? 50 : 10;
          commitWindow(resizeMinimapWindow(windowRef.current, { w: panelW + delta[0] * step, h: panelH + delta[1] * step }, position, W, H, margin));
        }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12 12 4M8 12l4-4M12 12h.01" /></svg>
      </button>
    </div>
    {helpOpen && <MinimapHelp t={t} onClose={() => setHelpOpen(false)} />}
    </>
  );
}
