// File: src/editor/canvas/Canvas.tsx
// Version: MVP-Layout-Canvas-Viewport-v2
// - Layout (incl. per-node overrides) comes from computeLayout().
// - Viewport controls:
//   · mouse wheel / trackpad pinch → zoom anchored at the cursor
//   · Pan(Hand) mode or middle button drag → pan (Pan 모드 배지·테두리 표시)
//   · drag on empty canvas (normal mode) → rubber-band multi-select
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
import { normalizeLayoutType } from '@/layout/normalizeLayoutType';
import { setLevelFontConfig } from '@/editor/node-renderer/sizeNodeForText';
import { NodeRenderer } from '@/editor/node-renderer/NodeRenderer';
import { NodeIndicators } from '@/editor/node-renderer/NodeIndicators';
import {
  nodeContentIndicators,
  isNoteKind,
  notesOfKind,
  NOTE_KIND_META,
  type ContentKind,
} from '@/editor/node-renderer/nodeContent';
import { NoteViewerPopover } from './NoteViewerPopover';
import { EdgeRenderer } from '@/editor/edge-renderer/EdgeRenderer';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';
import { useViewportStore } from '@/stores/viewportStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { CanvasFloatingToolbar } from './CanvasFloatingToolbar';
import { extractClipboardImage } from '@/utils/clipboardImage';

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
  timeline: '시간배치 (타임라인)',
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
  const setNodeImage = useDocumentStore((state) => state.setNodeImage);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const setBranchSide = useDocumentStore((state) => state.setBranchSide);
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
  // 렌더 타이밍과 무관하게 항상 "마지막 move에서 계산한" 드롭존 —
  // 상태(dropZone)를 폴백으로 쓰면 렌더가 늦을 때 낡은 값이 드롭을
  // 가로채(제자리 재삽입 = 이동 안 된 것처럼 보임) 버그가 된다.
  const dropZoneRef = useRef<typeof dropZone>(null);

  // Visible ghost of the node being dragged (world coords).
  // flip: 방사형·양쪽에서 반대쪽 빈 공간 위 — 놓으면 좌/우 이동됨을 안내
  const [dragGhost, setDragGhost] = useState<{
    x: number; y: number; w: number; h: number; flip?: 'left' | 'right' | null;
  } | null>(null);

  // 러버밴드(드래그 사각형) 다중 선택 — Pan 모드가 아닐 때 빈 캔버스 드래그.
  // 사각형에 걸친 노드 전체가 multiSelectedIds가 되어 스타일 일괄 적용 대상.
  const marqueeRef = useRef<{
    pointerId: number; x0: number; y0: number; moved: boolean;
  } | null>(null);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // Pan 드래그 중 여부 — 커서 grab → grabbing 전환용
  const [panning, setPanning] = useState(false);

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
  // 편집 중인 노드 — +/− 추가 인디케이터를 숨겨 편집창·미니 툴바와
  // 겹치지 않게 한다.
  const editingNodeId = useInteractionStore((s) => s.editingNodeId);
  const multiSelectedIds = useInteractionStore((s) => s.multiSelectedIds);
  const setMultiSelectedIds = useInteractionStore((s) => s.setMultiSelectedIds);
  const multiSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

  // 단일 선택은 항상 다중 선택을 해제한다 (러버밴드만이 다중 선택을 만든다)
  const selectOne = (id: string | null) => {
    if (multiSelectedIds.length) setMultiSelectedIds([]);
    onSelect(id);
  };

  // 레이아웃 방향 — 루트 +버튼 위치와 방사형·양쪽 좌/우 이동에 사용
  const normalizedLayout = normalizeLayoutType(layoutType);
  const bothSided = normalizedLayout === 'radial-bidirectional';
  const rootChildSides: ('left' | 'right' | 'down')[] =
    bothSided ? ['right', 'left']
      : normalizedLayout === 'radial-left' ? ['left']
        : normalizedLayout === 'tree-down' ? ['down']
          : ['right'];

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
    } else if (hit.side === 'up') {
      // children grow upward (시간배치 위쪽 주제)
      if (dy < -hit.h * 0.18) position = 'child';
      else if (dy > hit.h * 0.18 && !isRoot) position = 'parent';
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
    selectOne(target.id);
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

  // side: 루트의 좌/우 +버튼(방사형·양쪽)이 누른 쪽으로 새 브랜치를 배치.
  // 키보드(Space/Tab) 등 side 없이 부르면 기존 좌우 교대 배치 그대로.
  const handleAddChild = (side?: 'left' | 'right') => {
    // 선택된 노드가 없으면 아무것도 하지 않는다 — 미선택 상태에서
    // Enter/Space/Tab이 메인 노드 밑에 노드를 만들어 버리는 것을 방지.
    if (!selectedId) return;
    const id = addChildNode(selectedId);
    if (id) {
      if (side && selectedId === 'root') setBranchSide(id, side);
      selectOne(id);
    }
  };

  const handleAddSibling = (position: 'before' | 'after' = 'after') => {
    if (!selectedId) return;
    if (selectedId === 'root') {
      // 루트의 형제는 없으므로 루트가 '선택된' 상태에서만 자식 추가로 대체
      handleAddChild();
      return;
    }
    const id = addSiblingNode(selectedId, position);
    if (id) selectOne(id);
  };

  const handleAddParent = () => {
    if (!selectedId || selectedId === 'root') return;
    const id = addParentNode(selectedId);
    if (id) selectOne(id);
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

  // 노드에 사진 붙여넣기 — 노드를 선택한 상태에서 Ctrl+V.
  // 클립보드의 이미지 파일(스크린샷·복사한 그림)은 data URL로,
  // 웹에서 복사한 이미지(text/html의 <img>)는 원본 URL로 노드에 저장한다.
  // 사진은 노드 안 텍스트 아래에 노드 폭에 맞춰 표시된다 (NodeRenderer).
  // (노드 텍스트 편집 중 붙여넣기는 NodeRenderer의 textarea onPaste가 처리)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;
      if (isEditingText) return; // 입력창 붙여넣기는 각 입력창이 처리
      if (!selectedId) return;
      // 전역 경로는 이미지 '파일'(스크린샷 등)만 — 웹 기사(text/html)까지
      // 받으면 노트 문단 등 다른 붙여넣기를 가로챈다. 기사는 노드 텍스트
      // 편집창(더블클릭) 붙여넣기로 처리.
      const kind = extractClipboardImage(
        e.clipboardData,
        (img) => setNodeImage(selectedId, img),
        { allowHtml: false },
      );
      if (kind) e.preventDefault();
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selectedId, setNodeImage]);

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
        selectOne(null);
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        selectOne(null);
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

    // Start a node drag (reparent) when pressing on a non-root node body.
    // Pan 모드여도 노드 위에서 시작한 드래그는 "노드 이동"이다 — Pan(화면
    // 이동)은 빈 캔버스 드래그/휠 클릭에서만. (Pan 모드가 노드 드래그를
    // 통째로 막아 좌/우 이동이 안 되는 것처럼 보이던 문제 수정)
    // Capture happens later, only once it actually moves, so a plain tap
    // still selects via the node's onClick.
    if (!isMiddleButton && nodeEl) {
      const id = nodeEl.getAttribute('data-node-id');
      if (e.button === 0 && id && id !== 'root') {
        dropZoneRef.current = null; // 이전 드래그의 드롭존 잔류 방지
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

    // Pan은 Pan 모드(H) 또는 휠 클릭에서만 — Pan 모드가 아닐 때 빈 캔버스
    // 드래그는 러버밴드(사각형) 다중 선택이다.
    if (!isMiddleButton && !panMode) {
      if (onEmptyCanvas) {
        e.currentTarget.setPointerCapture(e.pointerId);
        const w = clientToWorld(e.clientX, e.clientY);
        marqueeRef.current = { pointerId: e.pointerId, x0: w.x, y0: w.y, moved: false };
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    setPanning(true);

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
        const zone = findDropZone(w.x, w.y, nodeDrag.id);
        dropZoneRef.current = zone; // 동기 갱신 — 드롭 시 낡은 값 방지
        setDropZone(zone);
        const dragged = nodesRef.current.find((nd) => nd.id === nodeDrag.id);
        if (dragged) {
          // 방사형·양쪽에서 반대쪽 빈 공간 위 → "놓으면 좌/우 이동" 안내
          const rootN = nodesRef.current.find((nd) => nd.depth === 0);
          const dropSide = rootN && w.x < rootN.x ? 'left' : 'right';
          const flip =
            bothSided && !zone && rootN && dragged.side !== dropSide ? dropSide : null;
          setDragGhost({ x: w.x, y: w.y, w: dragged.w, h: dragged.h, flip });
        }
      }
      return;
    }

    // 러버밴드 갱신 — 살짝 움직인 뒤부터 사각형을 그린다
    const mq = marqueeRef.current;
    if (mq && mq.pointerId === e.pointerId) {
      const w = clientToWorld(e.clientX, e.clientY);
      if (!mq.moved && Math.abs(w.x - mq.x0) + Math.abs(w.y - mq.y0) > 4) mq.moved = true;
      if (mq.moved) setMarquee({ x0: mq.x0, y0: mq.y0, x1: w.x, y1: w.y });
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
        // 최종 위치에서 새로 계산 — 폴백은 마지막 move에서 동기 저장한 값
        // (같은 좌표이므로 사실상 동일; 좌표가 어긋난 경우만 대비)
        const zone = findDropZone(w.x, w.y, nodeDrag.id) ?? dropZoneRef.current;
        dropZoneRef.current = null;
        const rootN = nodesRef.current.find((nd) => nd.depth === 0);
        if (zone) {
          const moved = moveNodeRelative(nodeDrag.id, zone.targetId, zone.position);
          if (moved) {
            // 방사형·양쪽: 루트에 떨어뜨리면 놓은 쪽(좌/우)으로 배치
            if (bothSided && zone.targetId === 'root' && zone.position === 'child' && rootN) {
              setBranchSide(nodeDrag.id, w.x < rootN.x ? 'left' : 'right');
            }
            selectOne(nodeDrag.id);
          }
        } else if (bothSided && rootN) {
          // 반대쪽 빈 곳에 놓음 (방사형·양쪽) — 좌/우 이동.
          //   · 2레벨(depth 1) 브랜치: side만 전환 (서브트리 그대로)
          //   · 3레벨(depth 2) 이하 노드: 그쪽의 새 2레벨 브랜치가 된다
          //     (반대쪽에는 붙을 부모가 없으므로 루트 자식으로 이동)
          const dragged = nodesRef.current.find((nd) => nd.id === nodeDrag.id);
          const dropSide = w.x < rootN.x ? 'left' : 'right';
          if (dragged && dragged.side !== dropSide) {
            if (dragged.depth === 1) {
              setBranchSide(nodeDrag.id, dropSide);
              selectOne(nodeDrag.id);
            } else {
              const moved = moveNodeRelative(nodeDrag.id, 'root', 'child');
              if (moved) {
                setBranchSide(nodeDrag.id, dropSide);
                selectOne(nodeDrag.id);
              }
            }
          }
        }
        suppressClickRef.current = true;
        setDropZone(null);
        setDragGhost(null);
      }
      return;
    }

    // 러버밴드 확정 — 사각형에 걸친 노드 전체를 다중 선택
    const mq = marqueeRef.current;
    if (mq && mq.pointerId === e.pointerId) {
      marqueeRef.current = null;
      if (mq.moved) {
        const w = clientToWorld(e.clientX, e.clientY);
        const minX = Math.min(mq.x0, w.x), maxX = Math.max(mq.x0, w.x);
        const minY = Math.min(mq.y0, w.y), maxY = Math.max(mq.y0, w.y);
        const hits = nodesRef.current.filter(
          (n) =>
            n.x + n.w / 2 >= minX && n.x - n.w / 2 <= maxX &&
            n.y + n.h / 2 >= minY && n.y - n.h / 2 <= maxY,
        );
        setMultiSelectedIds(hits.map((n) => n.id));
        // 스타일 탭이 열리도록 첫 노드를 대표 선택으로 지정
        onSelect(hits[0]?.id ?? null);
        suppressClickRef.current = true;
      }
      setMarquee(null);
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    dragRef.current = null;
    setPanning(false);
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

      {/* Pan 모드 표시 — 상단 중앙 배지 + 캔버스 테두리 하이라이트.
          Pan 모드에서는 드래그가 화면 이동이고, 해제하면 드래그가
          다중 선택(러버밴드)이 된다. */}
      {panMode && (
        <>
          <div
            data-testid="pan-mode-badge"
            style={{
              position: 'absolute', top: 14, left: '50%',
              transform: 'translateX(-50%)', zIndex: 6,
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 16px', borderRadius: 20,
              background: t.primary, color: '#FFFFFF',
              fontSize: 12.5, fontWeight: 700,
              boxShadow: '0 4px 14px rgba(60,45,15,0.35)',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 15 }}>✋</span>
            Pan 모드 — 빈 곳 드래그로 화면 이동 (노드 드래그는 노드 이동) · H 키로 해제
          </div>
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 4,
              border: `2.5px solid ${t.primary}`, borderRadius: 2,
              opacity: 0.55, pointerEvents: 'none',
            }}
          />
        </>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: panMode ? (panning ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none',
          // 드래그 시 SVG 글자가 브라우저 '텍스트 선택'으로 잡혀 주황
          // 선택 배경이 그려지는 문제 방지 — 캔버스 글자는 선택 대상이
          // 아니다 (노드 편집창(textarea) 안의 선택은 그대로 동작).
          userSelect: 'none',
          WebkitUserSelect: 'none',
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
            selectOne(null);
            setPopover(null);
          }
        }}
      >
        <g
          transform={`translate(${CX + panX} ${CY + panY}) scale(${scale}) translate(${-CX} ${-CY})`}
        >
          {/* 시간배치 — 수평 시간축 화살표 (루트 → 마지막 주제 너머) */}
          {normalizedLayout === 'timeline' && !focusedId && (() => {
            const root = nodes.find((n) => n.depth === 0);
            if (!root) return null;
            const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w / 2), root.x + root.w / 2);
            const endX = maxX + 46;
            return (
              <g data-testid="timeline-axis" pointerEvents="none">
                <line x1={root.x + root.w / 2} y1={root.y} x2={endX} y2={root.y}
                      stroke={t.edge} strokeWidth={2.3} strokeLinecap="round" />
                <polygon
                  points={`${endX + 12},${root.y} ${endX - 2},${root.y - 6} ${endX - 2},${root.y + 6}`}
                  fill={t.edge}
                />
              </g>
            );
          })()}

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
                selected={n.id === selectedId || multiSet.has(n.id)}
                dropTarget={n.id === dropZone?.targetId}
                onSelect={() => selectOne(n.id)}
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
                  : tgt.side === 'up'
                    ? { x: tgt.x - tgt.w / 2, y: tgt.y - tgt.h / 2 - BAR, w: tgt.w, h: BAR }
                    : { x: cx, y: tgt.y - tgt.h / 2, w: BAR, h: tgt.h };
            }
            return (
              <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3}
                fill={t.success} opacity="0.95" pointerEvents="none" />
            );
          })()}

          {selectedNode && !dropZone && editingNodeId !== selectedNode.id &&
            multiSelectedIds.length <= 1 && (
            <g className="mm-overlay-controls">
              <NodeIndicators
                node={selectedNode}
                t={t}
                rootChildSides={rootChildSides}
                onAddChild={handleAddChild}
                onAddParent={handleAddParent}
                onAddSiblingBefore={() => handleAddSibling('before')}
                onAddSiblingAfter={() => handleAddSibling('after')}
              />
            </g>
          )}

          {/* 러버밴드(다중 선택) 사각형 */}
          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              fill={t.primary}
              opacity="0.08"
              stroke={t.primary}
              strokeWidth="1.4"
              strokeDasharray="5 3"
              pointerEvents="none"
            />
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
                        : n.side === 'up'
                          ? { x: n.x, y: n.y - n.h / 2 - 11 }
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
            <g pointerEvents="none">
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
              />
              {/* 방사형·양쪽: 반대쪽 빈 공간 — 놓으면 좌/우 이동 안내 */}
              {dragGhost.flip && (
                <g data-testid="flip-hint"
                   transform={`translate(${dragGhost.x}, ${dragGhost.y + dragGhost.h / 2 + 18})`}>
                  <rect x={-86} y={-11} width={172} height={22} rx={11}
                        fill={t.primary} opacity={0.95} />
                  <text y={4} fontSize={11.5} fontWeight={700} fill="#FFFFFF"
                        textAnchor="middle">
                    {dragGhost.flip === 'left'
                      ? '⬅ 놓으면 왼쪽으로 이동'
                      : '놓으면 오른쪽으로 이동 ➡'}
                  </text>
                </g>
              )}
            </g>
          )}

          {/* Multi-item chooser popover (link/file/media) — TOP overlay so it's
              never covered by other nodes. (노트는 아래 NoteViewerPopover) */}
          {popover && !isNoteKind(popover.kind) && (() => {
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

      {/* 노트 뷰어 팝업 — 클릭한 인디케이터의 노트 종류(문단/코드/표/체크)만
          읽기 전용으로 표시 (HTML 오버레이, 내보내기 뷰어와 동일 렌더링).
          제목 드래그로 이동, 우하단 모서리 드래그로 크기 조절. */}
      {popover && isNoteKind(popover.kind) && (() => {
        const node = nodes.find((n) => n.id === popover.nodeId);
        if (!node) return null;
        const filtered = notesOfKind(node.notes, popover.kind);
        if (filtered.length === 0) return null;
        return (
          <NoteViewerPopover
            key={`${popover.nodeId}:${popover.kind}`}
            t={t}
            title={node.text}
            heading={NOTE_KIND_META[popover.kind].label}
            accent={NOTE_KIND_META[popover.kind].color}
            notes={filtered}
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
