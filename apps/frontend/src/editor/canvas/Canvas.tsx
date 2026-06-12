// File: src/editor/canvas/Canvas.tsx
// Version: MVP-Layout-Canvas-Viewport-v2
// - Layout (incl. per-node overrides) comes from computeLayout().
// - Viewport controls:
//   · mouse wheel / trackpad pinch → zoom anchored at the cursor
//   · drag on empty canvas (or Hand mode / middle button) → pan
//   · +, - → zoom step · 0 → reset view · H → toggle Hand(pan) mode
//   · Fit button → fit the whole map into the view

import {
  useEffect,
  useMemo,
  useRef,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType, SampleMap, Collaborator } from '@/editor/__samples__/types';
import { computeLayout } from '@/layout/LayoutEngine';
import { NodeRenderer } from '@/editor/node-renderer/NodeRenderer';
import { NodeIndicators } from '@/editor/node-renderer/NodeIndicators';
import { EdgeRenderer } from '@/editor/edge-renderer/EdgeRenderer';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { useDocumentStore } from '@/stores/documentStore';
import { useViewportStore } from '@/stores/viewportStore';
import { CanvasFloatingToolbar } from './CanvasFloatingToolbar';

const LAYOUT_LABEL: Record<string, string> = {
  tree: '트리 · 오른쪽 (직각선)',
  radial: '방사형 · 오른쪽 (곡선)',
  'both-radial': '방사형 · 양쪽 (곡선)',
  hierarchy: '계층형 · 오른쪽 (직각선)',
  'progress-tree': '진행트리 · 오른쪽 (직각선)',
  free: '자유배치',
  kanban: 'Kanban 보드',
  'radial-bidirectional': '방사형 · 양쪽 (곡선)',
  'radial-right': '방사형 · 오른쪽 (곡선)',
  'radial-left': '방사형 · 왼쪽 (곡선)',
  'tree-right': '트리 · 오른쪽 (직각선)',
  'tree-down': '트리 · 아래 (직각선)',
  'hierarchy-right': '계층형 · 오른쪽 (직각선)',
  'process-tree-right': '진행트리 · 오른쪽 (직각선)',
  freeform: '자유배치',
};

interface Props {
  t: ThemeTokens;
  sample: SampleMap;
  layoutType: LayoutType;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  collabs: Collaborator[];
}

const ZOOM_MIN = 33;
const ZOOM_MAX = 400;

function clampZoom(v: number) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
}

export function Canvas({
  t,
  sample,
  layoutType,
  selectedId,
  onSelect,
  collabs,
}: Props) {
  const W = 1400;
  const H = 760;
  const CX = W / 2;
  const CY = H / 2;

  const addChildNode = useDocumentStore((state) => state.addChildNode);
  const deleteNode = useDocumentStore((state) => state.deleteNode);

  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);
  const panMode = useViewportStore((s) => s.panMode);
  const fitRequestId = useViewportStore((s) => s.fitRequestId);
  const setZoom = useViewportStore((s) => s.setZoom);
  const setPan = useViewportStore((s) => s.setPan);
  const zoomIn = useViewportStore((s) => s.zoomIn);
  const zoomOut = useViewportStore((s) => s.zoomOut);
  const togglePanMode = useViewportStore((s) => s.togglePanMode);
  const requestFit = useViewportStore((s) => s.requestFit);
  const resetView = useViewportStore((s) => s.reset);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX0: number;
    panY0: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const nodes = useMemo(
    () => computeLayout(sample, layoutType, CX, CY),
    [sample, layoutType, CX, CY],
  );

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const selectedNode = nodes.find((n) => n.id === selectedId);
  const scale = (zoom || 100) / 100;
  const editingCollab = collabs.find((c) => c.editing === 'b2-1');

  // viewBox units per client pixel (preserveAspectRatio="xMidYMid meet")
  const getViewScale = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return 1;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return 1;
    return Math.min(rect.width / W, rect.height / H);
  };

  const clientToViewBox = (clientX: number, clientY: number) => {
    const svgEl = svgRef.current;
    if (!svgEl) return { x: CX, y: CY };
    const rect = svgEl.getBoundingClientRect();
    const k = Math.min(rect.width / W, rect.height / H) || 1;
    return {
      x: (clientX - rect.left - (rect.width - W * k) / 2) / k,
      y: (clientY - rect.top - (rect.height - H * k) / 2) / k,
    };
  };

  // Wheel zoom anchored at the cursor. Attached manually with passive:false
  // so preventDefault() blocks the browser page zoom/scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const state = useViewportStore.getState();
      const cursor = clientToViewBox(e.clientX, e.clientY);

      const s1 = state.zoom / 100;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const zoomNext = clampZoom(Math.round(state.zoom * factor));
      const s2 = zoomNext / 100;

      if (zoomNext === state.zoom) return;

      // Keep the world point under the cursor fixed:
      // screen = (p - C) * s + C + pan  ⇒  pan' = cursor - C - (cursor - C - pan) * s2/s1
      const panXNext = cursor.x - CX - ((cursor.x - CX - state.panX) / s1) * s2;
      const panYNext = cursor.y - CY - ((cursor.y - CY - state.panY) / s1) * s2;

      state.setZoom(zoomNext);
      state.setPan(panXNext, panYNext);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit the whole map into view when requested (toolbar / status bar).
  useEffect(() => {
    if (!fitRequestId) return;

    const laidNodes = nodesRef.current;
    if (!laidNodes.length) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of laidNodes) {
      minX = Math.min(minX, n.x - n.w / 2);
      maxX = Math.max(maxX, n.x + n.w / 2);
      minY = Math.min(minY, n.y - n.h / 2);
      maxY = Math.max(maxY, n.y + n.h / 2);
    }

    const margin = 70;
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);

    const fitScale = Math.min((W - margin * 2) / bw, (H - margin * 2) / bh, 2);
    const zoomNext = clampZoom(Math.round(fitScale * 100));
    const s2 = zoomNext / 100;

    const bcx = (minX + maxX) / 2;
    const bcy = (minY + maxY) / 2;

    setZoom(zoomNext);
    setPan(-(bcx - CX) * s2, -(bcy - CY) * s2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequestId]);

  // Center the selected node at the current zoom (Focus button / Alt+F).
  const focusSelected = () => {
    const node = nodesRef.current.find((n) => n.id === selectedId);
    if (!node) return;

    const s = useViewportStore.getState().zoom / 100;
    setPan(-(node.x - CX) * s, -(node.y - CY) * s);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      const isEditingText =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;

      if (isEditingText) return;

      if (e.code === 'Space') {
        e.preventDefault();

        const newNodeId = addChildNode(selectedId || 'root');
        onSelect(newNodeId);
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();

        if (!selectedId || selectedId === 'root') return;

        deleteNode(selectedId);
        onSelect(null);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onSelect(null);
        return;
      }

      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomIn();
        return;
      }

      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomOut();
        return;
      }

      if (e.key === '0' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        resetView();
        return;
      }

      if (e.key === 'h' || e.key === 'H' || e.key === 'ㅗ') {
        e.preventDefault();
        togglePanMode();
        return;
      }

      if (e.key === 'f' && e.altKey) {
        e.preventDefault();
        focusSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  });

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const isMiddleButton = e.button === 1;
    const onEmptyCanvas = (e.target as Element).tagName === 'svg';

    if (e.button !== 0 && !isMiddleButton) return;
    if (!isMiddleButton && !panMode && !onEmptyCanvas) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX0: panX,
      panY0: panY,
      moved: false,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const k = getViewScale() || 1;
    const dx = (e.clientX - drag.startX) / k;
    const dy = (e.clientY - drag.startY) / k;

    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;

    setPan(drag.panX0 + dx, drag.panY0 + dy);
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    dragRef.current = null;
    if (drag.moved) suppressClickRef.current = true;
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: `${t.canvas} radial-gradient(circle at center, ${t.border}aa 1px, transparent 1px) ${panX}px ${panY}px / ${
          24 * scale
        }px ${24 * scale}px repeat`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 14,
          left: 14,
          zIndex: 5,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          borderRadius: 20,
          background: t.surface,
          border: `1px solid ${t.border}`,
          boxShadow: t.shadowSm,
          fontSize: 11,
          color: t.textMuted,
          fontWeight: 500,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: t.primary,
          }}
        />
        {LAYOUT_LABEL[layoutType] || '마인드맵'} · 자동 배치 · {nodes.length} 노드 ·{' '}
        {Math.round(zoom || 100)}%
        {panMode && (
          <span style={{ color: t.primary, fontWeight: 600 }}>· Pan 모드 (H)</span>
        )}
      </div>

      <CanvasFloatingToolbar
        t={t}
        hasSelection={!!selectedNode}
        onFitView={requestFit}
        onFocusSelected={focusSelected}
      />

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: panMode ? 'grab' : 'default',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={(e: MouseEvent<SVGSVGElement>) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if ((e.target as Element).tagName === 'svg') onSelect(null);
        }}
      >
        <g
          transform={`translate(${CX + panX} ${CY + panY}) scale(${scale}) translate(${-CX} ${-CY})`}
        >
          <g>
            {nodes
              .filter((n) => n.parent)
              .map((n) => {
                const p = nodes.find((x) => x.id === n.parent);
                if (!p) return null;

                return (
                  <EdgeRenderer
                    key={n.id}
                    from={p}
                    to={n}
                    t={t}
                    layoutType={layoutType}
                  />
                );
              })}
          </g>

          <g>
            {nodes.map((n) => (
              <NodeRenderer
                key={n.id}
                n={n}
                t={t}
                selected={n.id === selectedId}
                onSelect={() => onSelect(n.id)}
                collabs={collabs}
              />
            ))}
          </g>

          {selectedNode && <NodeIndicators node={selectedNode} t={t} />}
        </g>
      </svg>

      <CollabCursor
        t={t}
        collab={editingCollab}
        W={W}
        H={H}
        nodes={nodes}
        scale={scale}
        CX={CX}
        CY={CY}
        panX={panX}
        panY={panY}
      />
    </div>
  );
}
