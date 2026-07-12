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
  type ReactNode,
  type MouseEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ThemeTokens } from '@/components/design-tokens/theme';
import type { LayoutType, SampleMap, Collaborator } from '@/editor/__samples__/types';
import { computeLayout } from '@/layout/LayoutEngine';
import { setLevelFontConfig } from '@/editor/node-renderer/sizeNodeForText';
import { NodeRenderer } from '@/editor/node-renderer/NodeRenderer';
import { NodeIndicators } from '@/editor/node-renderer/NodeIndicators';
import { nodeContentIndicators, type ContentKind } from '@/editor/node-renderer/nodeContent';
import { NoteViewerPopover } from './NoteViewerPopover';
import { EdgeRenderer } from '@/editor/edge-renderer/EdgeRenderer';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';
import { useViewportStore } from '@/stores/viewportStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
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
  const addNodeLink = useDocumentStore((state) => state.addNodeLink);
  const addNodeAttachment = useDocumentStore((state) => state.addNodeAttachment);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const setMultiAddOpen = useEditorUiStore((state) => state.setMultiAddOpen);

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

  // Multi-item content chooser popover (link/file/media), rendered on the TOP
  // overlay so other nodes never cover it.
  const [popover, setPopover] = useState<{ nodeId: string; kind: ContentKind } | null>(null);

  // "Focus selected" mode — when set, the viewport is zoomed to a node's subtree.
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Node currently hovered — reveals the collapse affordance (● dot) on the
  // node's children-connector start.
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);

  const spacingX = useEditorUiStore((s) => s.spacingX);
  const spacingY = useEditorUiStore((s) => s.spacingY);

  const nodes = useMemo(() => {
    // 맵 설정(레벨별 폰트)을 측정기에 주입 — 모든 레이아웃 전략의
    // sizeNodeForText()와 NodeRenderer가 같은 크기·글꼴을 쓴다.
    // sample(map)이 의존성이므로 설정 변경 시 레이아웃도 다시 계산된다.
    setLevelFontConfig(sample.settings?.levelFonts);
    return computeLayout(sample, layoutType, CX, CY, { x: spacingX, y: spacingY });
  }, [sample, layoutType, CX, CY, spacingX, spacingY]);

  // In focus mode, render only the focused node and its descendants — keeping
  // their existing layout positions (the layout is NOT recomputed/re-rooted).
  const subtreeOf = (rootId: string, list: typeof nodes) => {
    const byId = new Map(list.map((x) => [x.id, x]));
    return list.filter((n) => {
      let cur: (typeof list)[number] | undefined = n;
      while (cur) {
        if (cur.id === rootId) return true;
        cur = cur.parent ? byId.get(cur.parent) : undefined;
      }
      return false;
    });
  };
  const visibleNodes = focusedId ? subtreeOf(focusedId, nodes) : nodes;

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

  // Node whose box contains a world point (topmost match).
  const nodeAt = (wx: number, wy: number) => {
    const ns = nodesRef.current;
    let hit: (typeof ns)[number] | null = null;
    for (const node of ns) {
      if (Math.abs(wx - node.x) <= node.w / 2 && Math.abs(wy - node.y) <= node.h / 2) hit = node;
    }
    return hit;
  };

  // Drop a link (URL) or file(s) from outside the app directly onto a node.
  const handleExternalDrop = (e: ReactDragEvent) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    const files = Array.from(dt.files ?? []);
    const uri = dt.getData('text/uri-list') || dt.getData('text/plain');
    const url = uri
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => /^https?:\/\//i.test(s));

    if (files.length === 0 && !url) return;

    e.preventDefault();
    const w = clientToWorld(e.clientX, e.clientY);
    const target = nodeAt(w.x, w.y);
    if (!target) return;

    if (files.length) {
      files.forEach((f) => {
        const kind = f.type.startsWith('audio') ? 'audio' : f.type.startsWith('video') ? 'video' : 'file';
        addNodeAttachment(target.id, { name: f.name, kind, url: URL.createObjectURL(f) });
      });
    } else if (url) {
      addNodeLink(target.id, url);
    }
    onSelect(target.id);
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

  // Zoom + pan so the given laid-out nodes all fit in the viewport.
  const fitToNodes = (list: typeof nodes, margin = 70) => {
    if (!list.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of list) {
      minX = Math.min(minX, n.x - n.w / 2);
      maxX = Math.max(maxX, n.x + n.w / 2);
      minY = Math.min(minY, n.y - n.h / 2);
      maxY = Math.max(maxY, n.y + n.h / 2);
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const fitScale = Math.min((W - margin * 2) / bw, (H - margin * 2) / bh, 2);
    const zoomNext = clampZoom(Math.round(fitScale * 100));
    const s2 = zoomNext / 100;
    const bcx = (minX + maxX) / 2;
    const bcy = (minY + maxY) / 2;
    setZoom(zoomNext);
    setPan(-(bcx - CX) * s2, -(bcy - CY) * s2);
  };

  // Fit the currently-laid-out nodes when requested. In focus mode the laid-out
  // set is already just the focused subtree, so this fits the subtree; otherwise
  // it fits the whole map. (toolbar / status bar / focus toggle)
  useEffect(() => {
    if (!fitRequestId) return;
    const list = focusedId ? subtreeOf(focusedId, nodesRef.current) : nodesRef.current;
    fitToNodes(list, focusedId ? 90 : 70);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequestId]);

  const handleAddChild = () => {
    // 선택된 노드가 없으면 아무것도 하지 않는다 — 미선택 상태에서
    // Enter/Space/Tab이 메인 노드 밑에 노드를 만들어 버리는 것을 방지.
    if (!selectedId) return;
    const id = addChildNode(selectedId);
    if (id) onSelect(id);
  };

  const handleAddSibling = (position: 'before' | 'after' = 'after') => {
    if (!selectedId) return;
    if (selectedId === 'root') {
      // 루트의 형제는 없으므로 루트가 '선택된' 상태에서만 자식 추가로 대체
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

  // Focus selected (toggle): re-root the view at the selected node so ONLY that
  // node (as the main node) and its descendants are shown — the parent, siblings
  // and everything else are hidden. Clicking again returns to the whole map.
  // (Focus button / Alt+F)
  const focusSelected = () => {
    if (focusedId) {
      setFocusedId(null);
      requestFit();
      return;
    }
    if (!selectedId || selectedId === 'root') return;
    setFocusedId(selectedId);
    requestFit();
  };

  // "맵 전체 맞추기" — always exit focus and fit the whole map.
  const handleFitWhole = () => {
    setFocusedId(null);
    requestFit();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      const isEditingText =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;

      if (isEditingText) return;

      const mod = e.ctrlKey || e.metaKey;

      // Undo / redo (in-memory, no DB)
      if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (mod && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      // ── Node-add direction shortcuts (spec NODE-13) ──
      // ⬅ 형제 이전: Shift + Ctrl + Space
      if (e.code === 'Space' && e.shiftKey && mod) {
        e.preventDefault();
        handleAddSibling('before');
        return;
      }
      // Ctrl + Space → 다중 노드 추가
      if (e.code === 'Space' && mod) {
        e.preventDefault();
        setMultiAddOpen(true);
        return;
      }
      // ➡ 형제 다음: Shift + Space
      if (e.code === 'Space' && e.shiftKey) {
        e.preventDefault();
        handleAddSibling('after');
        return;
      }
      // ⬇ 자식: Space
      if (e.code === 'Space') {
        e.preventDefault();
        handleAddChild();
        return;
      }
      // ⬆ 부모: Ctrl + ←
      if (e.key === 'ArrowLeft' && mod) {
        e.preventDefault();
        handleAddParent();
        return;
      }

      // Tab → add child, Enter → add sibling (next) — convenience
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
        setPopover(null);
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
      onDragOver={(e) => {
        // allow dropping external links / files onto a node
        if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault();
        }
      }}
      onDrop={handleExternalDrop}
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
        focusActive={!!focusedId}
        onFitView={handleFitWhole}
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
          if ((e.target as Element).tagName === 'svg') {
            onSelect(null);
            setPopover(null);
          }
        }}
      >
        <g
          transform={`translate(${CX + panX} ${CY + panY}) scale(${scale}) translate(${-CX} ${-CY})`}
        >
          <g>
            {visibleNodes
              .filter((n) => n.parent)
              .map((n) => {
                const p = visibleNodes.find((x) => x.id === n.parent);
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
            {visibleNodes.map((n) => (
              <NodeRenderer
                key={n.id}
                n={n}
                t={t}
                selected={n.id === selectedId}
                dropTarget={n.id === dropZone?.targetId}
                onSelect={() => onSelect(n.id)}
                onHover={setHoverNodeId}
                onOpenPopover={(nodeId, kind) =>
                  setPopover((p) => (p && p.nodeId === nodeId && p.kind === kind ? null : { nodeId, kind }))
                }
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
            <g className="mm-overlay-controls">
              <NodeIndicators
                node={selectedNode}
                t={t}
                onAddChild={handleAddChild}
                onAddParent={handleAddParent}
                onAddSiblingBefore={() => handleAddSibling('before')}
                onAddSiblingAfter={() => handleAddSibling('after')}
              />
            </g>
          )}

          {/* Collapse / expand toggle (top overlay, always clickable). Shown
              only for nodes that have children, and only when the display
              toggle is on. Hidden in print / image export (mm-overlay-controls).
              The add-child "+" is NOT persistent — it appears only on the
              selected node via NodeIndicators (spec NODE-13). */}
          {!dragGhost && (
            <g className="mm-overlay-controls">
              {visibleNodes
                .filter((n) => n.depth > 0 && (n._childCount ?? 0) > 0)
                // Hide on the selected node and its parent so it doesn't overlap
                // the selected node's +/- add indicators.
                .filter((n) => n.id !== selectedId && n.id !== (selectedNode?.parent ?? ''))
                .map((n) => {
                  const pos =
                    n.side === 'left'
                      ? { x: n.x - n.w / 2 - 11, y: n.y }
                      : n.side === 'down'
                        ? { x: n.x, y: n.y + n.h / 2 + 11 }
                        : { x: n.x + n.w / 2 + 11, y: n.y };
                  return (
                    <CollapseControl
                      key={`toggle-${n.id}`}
                      t={t}
                      x={pos.x}
                      y={pos.y}
                      collapsed={!!n.collapsed}
                      nodeHovered={hoverNodeId === n.id}
                      onToggle={() => toggleCollapse(n.id)}
                    />
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

          {/* Multi-item chooser popover (link/file/media) — TOP overlay so it's
              never covered by other nodes. (📝 노트는 아래 NoteViewerPopover) */}
          {popover && popover.kind !== 'note' && (() => {
            const node = nodes.find((n) => n.id === popover.nodeId);
            if (!node) return null;
            const ind = nodeContentIndicators(node).find((c) => c.kind === popover.kind);
            if (!ind || ind.items.length === 0) return null;
            const width = Math.max(200, node.w);
            const height = Math.min(190, 10 + ind.items.length * 26);
            return (
              <foreignObject
                x={node.x - node.w / 2}
                y={node.y + node.h / 2 + 6}
                width={width}
                height={height}
              >
                <div
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: t.surface,
                    border: `1px solid ${t.border}`,
                    borderRadius: 6,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
                    padding: 4,
                    fontFamily: 'inherit',
                    maxHeight: height,
                    overflow: 'auto',
                  }}
                >
                  {ind.items.map((it, i) => (
                    <button
                      key={i}
                      title={it.url || it.label}
                      onClick={() => {
                        if (it.url) window.open(it.url, '_blank', 'noopener');
                        setPopover(null);
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '5px 8px', border: 'none', background: 'transparent',
                        color: t.text, fontSize: 11.5, cursor: 'pointer', borderRadius: 4,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {ind.icon} {it.label}
                    </button>
                  ))}
                </div>
              </foreignObject>
            );
          })()}
        </g>
      </svg>

      {/* 📝 노트 뷰어 팝업 — 노드의 노트를 읽기 전용으로 표시 (HTML 오버레이,
          내보내기 뷰어의 상세 패널과 동일한 문단/코드/표/체크 렌더링). */}
      {popover?.kind === 'note' && (() => {
        const node = nodes.find((n) => n.id === popover.nodeId);
        if (!node || !node.notes?.length) return null;
        return (
          <NoteViewerPopover
            t={t}
            title={node.text}
            notes={node.notes}
            onClose={() => setPopover(null)}
          />
        );
      })()}

      {/* [협업 UI 숨김 — MVP] 캔버스 위 협업자 커서/이름 말풍선("박민호" 화살표).
          협업자의 수정위치 표시는 협업 기능(V2) 개발 시 적용 예정.
          featureFlags.ts의 COLLAB_PRESENCE_UI를 true로 바꾸면 다시 표시된다.
          코드는 삭제하지 않고 보존. */}
      {COLLAB_PRESENCE_UI && (
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
      )}
    </div>
  );
}

// Collapse / expand affordance shown at a node's children-connector start.
// - collapsed   → persistent "+" expand button (so the hidden subtree is visible)
// - expanded    → nothing by default; on NODE hover a small ● dot appears, and
//                 hovering the dot reveals the collapse (−) icon. Clicking it
//                 collapses. This keeps the map clean (no icon on every node).
function CollapseControl({
  t, x, y, collapsed, nodeHovered, onToggle,
}: {
  t: ThemeTokens;
  x: number;
  y: number;
  collapsed: boolean;
  nodeHovered: boolean;
  onToggle: () => void;
}) {
  const [h, setH] = useState(false);

  const wrap = (children: ReactNode, title: string) => (
    <g
      transform={`translate(${x}, ${y})`}
      style={{ cursor: 'pointer' }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      <title>{title}</title>
      {/* larger transparent hit area */}
      <circle r="11" fill="transparent" />
      {children}
    </g>
  );

  if (collapsed) {
    return wrap(
      <>
        <circle r="8.5" fill={t.primary} stroke={t.primary} strokeWidth="1.4" />
        <line x1={-4} y1={0} x2={4} y2={0} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
        <line x1={0} y1={-4} x2={0} y2={4} stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
      </>,
      '펼치기',
    );
  }

  // expanded: hidden until the node (or this control) is hovered
  if (!nodeHovered && !h) return null;

  if (h) {
    // collapse icon — a clean "fold" glyph (circle + minus), not a swirl
    return wrap(
      <>
        <circle r="8.5" fill={t.surface} stroke={t.primary} strokeWidth="1.4" />
        <line x1={-4} y1={0} x2={4} y2={0} stroke={t.primary} strokeWidth="1.6" strokeLinecap="round" />
      </>,
      '접기',
    );
  }

  // node hovered → small dot at the connector start
  return wrap(<circle r="4.5" fill={t.primary} />, '접기');
}
