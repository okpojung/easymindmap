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
  useState,
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
  const addSiblingNode = useDocumentStore((state) => state.addSiblingNode);
  const addParentNode = useDocumentStore((state) => state.addParentNode);
  const deleteNode = useDocumentStore((state) => state.deleteNode);
  const moveNodeRelative = useDocumentStore((state) => state.moveNodeRelative);
  const toggleCollapse = useDocumentStore((state) => state.toggleCollapse);

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

  // Node drag-and-drop (reparent) state
  const nodeDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    id: string;
    dragging: boolean;
  } | null>(null);
  type DropPosition = 'child' | 'parent' | 'before' | 'after';
  const [dropZone, setDropZone] = useState<{ targetId: string; position: DropPosition } | null>(null);
  const dropZoneRef = useRef<typeof dropZone>(null);
  dropZoneRef.current = dropZone;

  // Visible ghost of the node being dragged (world coords).
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

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

  // Client pixel → layout (world) coordinate, undoing the inner <g> transform.
  const clientToWorld = (clientX: number, clientY: number) => {
    const v = clientToViewBox(clientX, clientY);
    const vp = useViewportStore.getState();
    const s = (vp.zoom || 100) / 100;
    return {
      x: (v.x - CX - vp.panX) / s + CX,
      y: (v.y - CY - vp.panY) / s + CY,
    };
  };

  // Finds the drop target (within an expanded hit box) and which of the four
  // drop zones the cursor is in, excluding the dragged node and its subtree.
  const findDropZone = (
    wx: number,
    wy: number,
    draggingId: string,
  ): { targetId: string; position: DropPosition } | null => {
    const ns = nodesRef.current;
    const M = 30; // expanded margin so child/parent zones reach outside the box

    let hit: (typeof ns)[number] | null = null;
    let bestDist = Infinity;
    for (const node of ns) {
      if (node.id === draggingId) continue;
      const insideX = Math.abs(wx - node.x) <= node.w / 2 + M;
      const insideY = Math.abs(wy - node.y) <= node.h / 2 + M;
      if (insideX && insideY) {
        const d = Math.abs(wx - node.x) + Math.abs(wy - node.y);
        if (d < bestDist) {
          bestDist = d;
          hit = node;
        }
      }
    }
    if (!hit) return null;

    // exclude the dragged node's own subtree
    const byId = new Map(ns.map((x) => [x.id, x]));
    let cur: (typeof ns)[number] | undefined = hit;
    while (cur) {
      if (cur.id === draggingId) return null;
      cur = cur.parent ? byId.get(cur.parent) : undefined;
    }

    const dx = wx - hit.x;
    const dy = wy - hit.y;
    const isRoot = hit.depth === 0;

    let position: DropPosition;
    if (hit.side === 'down') {
      // children grow downward
      if (dy > hit.h * 0.18) position = 'child';
      else if (dy < -hit.h * 0.18 && !isRoot) position = 'parent';
      else position = dx < 0 ? 'before' : 'after';
    } else {
      // children grow left/right
      const childSign = hit.side === 'left' ? -1 : 1; // right by default
      const along = dx * childSign;
      if (along > hit.w * 0.18) position = 'child';
      else if (along < -hit.w * 0.18 && !isRoot) position = 'parent';
      else position = dy < 0 ? 'before' : 'after';
    }

    // Root can only accept children; siblings/parent make no sense on root.
    if (isRoot) position = 'child';

    return { targetId: hit.id, position };
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

  const handleAddChild = () => {
    const id = addChildNode(selectedId || 'root');
    if (id) onSelect(id);
  };

  const addChildTo = (parentId: string) => {
    const id = addChildNode(parentId);
    if (id) onSelect(id);
  };

  const handleAddSibling = (position: 'before' | 'after' = 'after') => {
    if (!selectedId || selectedId === 'root') {
      handleAddChild();
      return;
    }
    const id = addSiblingNode(selectedId, position);
    if (id) onSelect(id);
  };

  const handleAddParent = () => {
    if (!selectedId || selectedId === 'root') return;
    const id = addParentNode(selectedId);
    if (id) onSelect(id);
  };

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
        handleAddChild();
        return;
      }

      // Tab → add child, Enter → add sibling (mindmap conventions)
      if (e.key === 'Tab') {
        e.preventDefault();
        handleAddChild();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleAddSibling();
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
    const nodeEl = (e.target as Element).closest('[data-node-id]');
    const onEmptyCanvas = (e.target as Element).tagName === 'svg';

    // Start a node drag (reparent) when pressing on a non-root node body and
    // not in pan mode. Capture happens later, only once it actually moves, so a
    // plain tap still selects via the node's onClick.
    if (!isMiddleButton && !panMode && nodeEl) {
      const id = nodeEl.getAttribute('data-node-id');
      if (e.button === 0 && id && id !== 'root') {
        nodeDragRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          id,
          dragging: false,
        };
        return;
      }
    }

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
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag && nodeDrag.pointerId === e.pointerId) {
      const dx = e.clientX - nodeDrag.startX;
      const dy = e.clientY - nodeDrag.startY;

      if (!nodeDrag.dragging && Math.abs(dx) + Math.abs(dy) > 4) {
        nodeDrag.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }

      if (nodeDrag.dragging) {
        const w = clientToWorld(e.clientX, e.clientY);
        setDropZone(findDropZone(w.x, w.y, nodeDrag.id));
        const dragged = nodesRef.current.find((nd) => nd.id === nodeDrag.id);
        if (dragged) setDragGhost({ x: w.x, y: w.y, w: dragged.w, h: dragged.h });
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const k = getViewScale() || 1;
    const dx = (e.clientX - drag.startX) / k;
    const dy = (e.clientY - drag.startY) / k;

    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;

    setPan(drag.panX0 + dx, drag.panY0 + dy);
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const nodeDrag = nodeDragRef.current;
    if (nodeDrag && nodeDrag.pointerId === e.pointerId) {
      nodeDragRef.current = null;

      if (nodeDrag.dragging) {
        // Compute the drop zone from the final pointer position directly so we
        // don't depend on render timing of state.
        const w = clientToWorld(e.clientX, e.clientY);
        const zone = findDropZone(w.x, w.y, nodeDrag.id) ?? dropZoneRef.current;
        if (zone) {
          const moved = moveNodeRelative(nodeDrag.id, zone.targetId, zone.position);
          if (moved) onSelect(nodeDrag.id);
        }
        suppressClickRef.current = true;
        setDropZone(null);
        setDragGhost(null);
      }
      return;
    }

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
                dropTarget={n.id === dropZone?.targetId}
                onSelect={() => onSelect(n.id)}
                collabs={collabs}
              />
            ))}
          </g>

          {/* Drop-zone indicator while dragging (green bar at the target side) */}
          {dropZone && (() => {
            const tgt = nodes.find((n) => n.id === dropZone.targetId);
            if (!tgt) return null;
            const BAR = 6;
            const childSign = tgt.side === 'left' ? -1 : 1;
            let bar: { x: number; y: number; w: number; h: number };
            if (dropZone.position === 'before') {
              bar = { x: tgt.x - tgt.w / 2, y: tgt.y - tgt.h / 2 - BAR, w: tgt.w, h: BAR };
            } else if (dropZone.position === 'after') {
              bar = { x: tgt.x - tgt.w / 2, y: tgt.y + tgt.h / 2, w: tgt.w, h: BAR };
            } else if (dropZone.position === 'parent') {
              const onLeft = childSign < 0 ? false : true; // parent is opposite child side
              const px = onLeft ? tgt.x - tgt.w / 2 - BAR : tgt.x + tgt.w / 2;
              bar = { x: px, y: tgt.y - tgt.h / 2, w: BAR, h: tgt.h };
            } else {
              // child — bar on the children side
              const cx = childSign < 0 ? tgt.x - tgt.w / 2 - BAR : tgt.x + tgt.w / 2;
              bar =
                tgt.side === 'down'
                  ? { x: tgt.x - tgt.w / 2, y: tgt.y + tgt.h / 2, w: tgt.w, h: BAR }
                  : { x: cx, y: tgt.y - tgt.h / 2, w: BAR, h: tgt.h };
            }
            return (
              <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3}
                fill={t.success} opacity="0.95" pointerEvents="none" />
            );
          })()}

          {selectedNode && !dropZone && (
            <NodeIndicators
              node={selectedNode}
              t={t}
              onAddChild={handleAddChild}
              onAddParent={handleAddParent}
              onAddSiblingBefore={() => handleAddSibling('before')}
              onAddSiblingAfter={() => handleAddSibling('after')}
            />
          )}

          {/* Per-node controls (top overlay, always clickable): collapse/expand
              toggle (when the node has children) + a persistent add-child button,
              placed on the side children grow toward. */}
          {!dragGhost && (
            <g>
              {nodes
                .filter((n) => n.depth > 0)
                .map((n) => {
                  const hasKids = (n._childCount ?? 0) > 0;
                  // edge point on the children side
                  const edge =
                    n.side === 'left'
                      ? { x: n.x - n.w / 2 - 11, y: n.y, vertical: false }
                      : n.side === 'down'
                        ? { x: n.x, y: n.y + n.h / 2 + 11, vertical: true }
                        : { x: n.x + n.w / 2 + 11, y: n.y, vertical: false };

                  // When both controls show, offset them so they don't overlap.
                  const togglePos = hasKids
                    ? edge.vertical
                      ? { x: edge.x - 11, y: edge.y }
                      : { x: edge.x, y: edge.y - 11 }
                    : null;
                  const addPos = hasKids
                    ? edge.vertical
                      ? { x: edge.x + 11, y: edge.y }
                      : { x: edge.x, y: edge.y + 11 }
                    : { x: edge.x, y: edge.y };

                  return (
                    <g key={`ctrl-${n.id}`}>
                      {togglePos && (
                        <g
                          transform={`translate(${togglePos.x}, ${togglePos.y})`}
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); toggleCollapse(n.id); }}
                          onDoubleClick={(e) => e.stopPropagation()}
                        >
                          <title>{n.collapsed ? '펼치기' : '접기'}</title>
                          <circle r="8.5" fill={t.surface} stroke={t.primary} strokeWidth="1.4" />
                          <line x1={-4} y1={0} x2={4} y2={0} stroke={t.primary} strokeWidth="1.5" strokeLinecap="round" />
                          {n.collapsed && (
                            <line x1={0} y1={-4} x2={0} y2={4} stroke={t.primary} strokeWidth="1.5" strokeLinecap="round" />
                          )}
                        </g>
                      )}
                      <g
                        transform={`translate(${addPos.x}, ${addPos.y})`}
                        style={{ cursor: 'pointer' }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); addChildTo(n.id); }}
                        onDoubleClick={(e) => e.stopPropagation()}
                      >
                        <title>하위 노드 추가</title>
                        <circle r="8.5" fill={t.primary} stroke={t.primary} strokeWidth="1.4" />
                        <line x1={-4} y1={0} x2={4} y2={0} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                        <line x1={0} y1={-4} x2={0} y2={4} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
                      </g>
                    </g>
                  );
                })}
            </g>
          )}

          {/* Drag ghost while reparenting */}
          {dragGhost && (
            <rect
              x={dragGhost.x - dragGhost.w / 2}
              y={dragGhost.y - dragGhost.h / 2}
              width={dragGhost.w}
              height={dragGhost.h}
              rx={10}
              fill={t.primary}
              opacity="0.22"
              stroke={t.primary}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              pointerEvents="none"
            />
          )}
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
