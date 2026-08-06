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
  useCallback,
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
import { setLevelFontConfig, setLevelShapeConfig } from '@/editor/node-renderer/sizeNodeForText';
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
import { collapseAnchor, type FallbackDir } from '@/editor/canvas/collapseAnchor';
import { CollabCursor } from '@/editor/collaboration/CollabCursor';
import { COLLAB_PRESENCE_UI } from '@/config/featureFlags';
import { useDocumentStore } from '@/stores/documentStore';
import { useViewportStore } from '@/stores/viewportStore';
import { useEditorUiStore } from '@/stores/editorUiStore';
import { useInteractionStore } from '@/stores/interactionStore';
import { CanvasFloatingToolbar } from './CanvasFloatingToolbar';
import { ChooserPopover } from './ChooserPopover';
import { extractClipboardImage } from '@/utils/clipboardImage';
import { hasForeignMapMarker, stripForeignMapMarkers } from '@/utils/foreignClipboard';
import {
  collectSubtrees, isNodeClipToken, stashNodes, takeStashed,
} from '@/utils/nodeClipboard';
import { reassignIds } from '@/utils/aiProjectContext';
import { attachFileWithProgress } from '@/utils/attachmentFile';
import { extractArticleContent, probeArticleImages } from '@/utils/articleContent';

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
  'timeline-center': '시간배치 (중앙노드)',
};

interface Props {
  t: ThemeTokens;
  sample: SampleMap;
  layoutType: LayoutType;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  collabs: Collaborator[];
}

// 큰 맵(수백 노드)도 '맵 전체 맞추기'가 전부 담을 수 있게 최소 2%
// (viewportStore의 하한과 반드시 같아야 한다 — 다르면 fit이 잘린다)
const ZOOM_MIN = 2;
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
  // 캔버스 viewBox를 "실제 컨테이너 픽셀 크기"로 맞춘다 — 예전 고정
  // 1400×760 viewBox는 화면 폭에 맞춰 통째로 축소되어, 줌 100%인데도
  // 글자가 실제 px보다 작게 보였다 (HTML 뷰어와 크기가 달라 보이던 원인).
  // 이제 100% = 1 world unit = 1 CSS px — 뷰어와 동일 배율.
  const [vpSize, setVpSize] = useState({ w: 1400, h: 760 });
  const W = vpSize.w;
  const H = vpSize.h;
  const CX = W / 2;
  const CY = H / 2;

  const addChildNode = useDocumentStore((state) => state.addChildNode);
  const appendChildren = useDocumentStore((state) => state.appendChildren);
  const addSiblingNode = useDocumentStore((state) => state.addSiblingNode);
  const addParentNode = useDocumentStore((state) => state.addParentNode);
  const deleteNode = useDocumentStore((state) => state.deleteNode);
  const deleteNodesBulk = useDocumentStore((state) => state.deleteNodesBulk);
  const moveNodeRelative = useDocumentStore((state) => state.moveNodeRelative);
  const toggleCollapse = useDocumentStore((state) => state.toggleCollapse);
  const addNodeLink = useDocumentStore((state) => state.addNodeLink);
  const addNodeAttachment = useDocumentStore((state) => state.addNodeAttachment);
  const setNodeImage = useDocumentStore((state) => state.setNodeImage);
  const setNodeImages = useDocumentStore((state) => state.setNodeImages);
  const updateNodeText = useDocumentStore((state) => state.updateNodeText);
  const undo = useDocumentStore((state) => state.undo);
  const redo = useDocumentStore((state) => state.redo);
  const setBranchSide = useDocumentStore((state) => state.setBranchSide);
  const setMultiAddOpen = useEditorUiStore((state) => state.setMultiAddOpen);

  const zoom = useViewportStore((s) => s.zoom);
  const panX = useViewportStore((s) => s.panX);
  const panY = useViewportStore((s) => s.panY);
  const panMode = useViewportStore((s) => s.panMode);
  const fitRequestId = useViewportStore((s) => s.fitRequestId);
  const centerRequest = useViewportStore((s) => s.centerRequest);
  const setZoom = useViewportStore((s) => s.setZoom);
  const setPan = useViewportStore((s) => s.setPan);
  const zoomIn = useViewportStore((s) => s.zoomIn);
  const zoomOut = useViewportStore((s) => s.zoomOut);
  const togglePanMode = useViewportStore((s) => s.togglePanMode);
  const requestFit = useViewportStore((s) => s.requestFit);
  const resetView = useViewportStore((s) => s.reset);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) {
        setVpSize({ w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  // 붙여넣기 안내 — 붙일 것이 없거나(다른 앱의 자리표시 텍스트) 이 탭에
  // 원본이 없을 때 "아무 반응 없음"으로 보이지 않게 한 줄 띄운다.
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);
  const notifyPaste = useCallback((msg: string) => {
    setPasteNotice(msg);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setPasteNotice(null), 7000);
  }, []);

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
  const searchHitId = useInteractionStore((s) => s.searchHitId);
  const setSearchHitId = useInteractionStore((s) => s.setSearchHitId);
  const setMultiSelectedIds = useInteractionStore((s) => s.setMultiSelectedIds);
  const multiSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

  // 단일 선택은 항상 다중 선택을 해제한다 (러버밴드만이 다중 선택을 만든다)
  const selectOne = (id: string | null) => {
    if (multiSelectedIds.length) setMultiSelectedIds([]);
    // 캔버스에서 직접 조작하면 검색 강조는 해제
    if (searchHitId && id !== searchHitId) setSearchHitId(null);
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
    setLevelShapeConfig(sample.settings?.levelShapes);
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

  // 노드별 "자식 배치에 쓰이는 실효 레이아웃" — 접기 토글 위치를
  // 레이아웃 종류로 결정하기 위해 오버라이드 체인을 한 번 걸어 둔다.
  // (레벨별 레이아웃 정책은 setLevelLayout이 노드 layoutType에 직접
  // 기록하므로 노드 체인만 보면 된다)
  const effByNode = useMemo(() => {
    const m = new Map<string, string>();
    const base = normalizeLayoutType(
      sample.root.layoutType ?? layoutType,
    ) as string;
    m.set('root', base);
    const walk = (list: { id: string; layoutType?: LayoutType; children?: unknown[] }[], inherited: string) => {
      for (const n of list) {
        const eff = n.layoutType
          ? (normalizeLayoutType(n.layoutType) as string)
          : inherited;
        m.set(n.id, eff);
        walk((n.children ?? []) as typeof list, eff);
      }
    };
    walk(sample.branches, base);
    return m;
  }, [sample, layoutType]);

  // 드롭존·드롭 인디케이터용 — 노드의 "자식이 자라는 방향"을 실효
  // 레이아웃으로 판정한다. 진행트리·트리 아래는 자식이 아래로(형제는
  // 좌우 배열), 시간배치는 side(위/아래), 그 외는 side 좌/우. 형제
  // 배열 축은 "부모의 자식 방향"에 수직이다 — side 만 보던 이전
  // 판정은 진행트리에서 하위/형제 표시가 실제 이동과 반대로 읽혔다
  // (2026-08-04 실사용 보고).
  const childDirOf = (n: { id: string; side?: string }): 'left' | 'right' | 'down' | 'up' => {
    const eff = effByNode.get(n.id) ?? '';
    if (eff.startsWith('process-tree') || eff === 'tree-down') return 'down';
    if (eff === 'timeline' || eff === 'timeline-center') return n.side === 'up' ? 'up' : 'down';
    return n.side === 'left' ? 'left' : 'right';
  };

  // 노드별 전체 자손 수 — 접힌 노드의 +N 칩에 "숨은 노드 수"를 표시
  // (HTML 뷰어 countDescendants와 동일 의미)
  const descCount = useMemo(() => {
    const m = new Map<string, number>();
    const walk = (n: { id: string; children?: unknown[] }): number => {
      let c = 0;
      for (const ch of (n.children ?? []) as { id: string; children?: unknown[] }[]) {
        c += 1 + walk(ch);
      }
      m.set(n.id, c);
      return c;
    };
    sample.branches.forEach(walk);
    return m;
  }, [sample]);

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

    // 자식·부모 존은 hit 의 자식 성장 축으로, 형제 존(before/after)은
    // "부모의 자식 방향"에 수직인 축으로 판정한다. 진행트리처럼 자식이
    // 아래로 자라는 레이아웃에서는 형제가 좌우로 배열되므로, 좌우가
    // 이전/다음 형제 존이 된다.
    const dirC = childDirOf(hit);
    const parentNode = hit.parent ? byId.get(hit.parent) : undefined;
    const sibDir = parentNode ? childDirOf(parentNode) : dirC;
    const vertC = dirC === 'down' || dirC === 'up';
    const along = vertC
      ? dy * (dirC === 'down' ? 1 : -1)
      : dx * (dirC === 'left' ? -1 : 1);
    const halfAlong = vertC ? hit.h / 2 : hit.w / 2;

    // ── 노드 **안쪽 = 항상 '하위'** (2026-08-05 실사용 보고) ──────────
    // 이전에는 하위/상위 판정을 오직 "그 노드의 자식 성장 축"으로만
    // 했다. 그래서 자식이 가로로 자라는 노드(tree-*)에서는 **아래로
    // 끌어도 영영 하위가 되지 않고** 좌우 형제 표시만 떴다 — 사용자가
    // 겪은 "왼쪽·오른쪽만 보이고 하위에 못 넣는다"가 이것이다. 존이
    // 2개만 보이던 것도 같은 이유(축이 노드마다 달라 나머지 2개에
    // 닿지 못함)다.
    //
    // 이제 판정은 **위치가 아니라 영역**으로 한다:
    //   · 노드 박스 **안** → 'child'  (레이아웃과 무관, 늘 같다)
    //   · 박스 **바깥 마진** → 자식 축 쪽이면 'child', 반대쪽이면
    //     'parent', 그 수직 축이면 'before'/'after'
    // 어느 레이아웃에서든 "노드 위에 올리면 하위"가 성립하고, 네 존을
    // 모두 만날 수 있다.
    const insideBox =
      Math.abs(dx) <= hit.w / 2 && Math.abs(dy) <= hit.h / 2;

    let position: DropPosition;
    if (insideBox) {
      position = 'child';
    } else if (along > halfAlong) {
      position = 'child';
    } else if (along < -halfAlong && !isRoot) {
      position = 'parent';
    } else if (sibDir === 'down' || sibDir === 'up') {
      // 부모가 세로 성장 → 형제는 가로 배열: 왼쪽 = 이전, 오른쪽 = 다음
      position = dx < 0 ? 'before' : 'after';
    } else {
      position = dy < 0 ? 'before' : 'after';
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
      void (async () => {
        for (const f of files) {
          const kind = f.type.startsWith('audio') ? 'audio' : f.type.startsWith('video') ? 'video' : 'file';
          try {
            // ≤2MB 는 data URL 내장, 초과는 서버 업로드 — 저장 후에도 유지.
            // 8MB 초과는 **청크 업로드**로 가고 진행률 줄이 뜬다 (§12).
            addNodeAttachment(target.id, {
              // 크기도 함께 (하단 상태바의 첨부 용량 집계용, 2026-08-07)
              name: f.name, kind, size: f.size,
              url: await attachFileWithProgress(f),
            });
          } catch (err) {
            // 사용자가 [취소]를 누른 것은 오류가 아니다 — 조용히 넘어간다.
            if ((err as Error)?.name === 'UploadAborted') continue;
            // **실패를 삼키지 않는다** (2026-08-06 보고).
            //
            // 예전에는 빈 catch 로 조용히 건너뛰었다 — "상세 안내는 첨부
            // 탭에서 표시된다"고 적어 두었지만, **노드에 끌어다 놓은
            // 사용자는 그 탭을 열지 않는다.** 20MB 를 넘는 파일을 노드에
            // 드롭하면 서버가 거절하는데도 화면에는 아무 일도 일어나지
            // 않아, 사용자에게는 "무반응"으로 보였다.
            const why = err instanceof Error ? err.message : '알 수 없는 오류';
            notifyPaste(`⚠ '${f.name}' 첨부 실패 — ${why}`);
          }
        }
      })();
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
  //
  // handledFitRef: 마운트 시점의 요청 번호로 초기화 — 아웃라인 전체 모드나
  // 칸반에 다녀와 Canvas가 다시 마운트될 때, "과거의" 맞추기 요청이 다시
  // 실행되어 사용자가 그 뒤에 맞춰 둔 줌/이동(예: 100% 보기)을 잃는 것을
  // 막는다. 뷰포트는 viewportStore에 있으므로 아무것도 안 하면 그대로다.
  const handledFitRef = useRef(fitRequestId);
  useEffect(() => {
    if (fitRequestId === handledFitRef.current) return;
    handledFitRef.current = fitRequestId;
    const list = focusedId ? subtreeOf(focusedId, nodesRef.current) : nodesRef.current;
    fitToNodes(list, focusedId ? 90 : 70);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitRequestId]);

  // 특정 노드를 화면 중앙 + 지정 배율로 보기 (검색 결과 클릭 —
  // requestCenterNode). 접힌 조상 때문에 아직 배치에 없으면 무시.
  // handledCenterRef: 위 handledFitRef와 같은 재마운트 가드.
  const handledCenterRef = useRef(centerRequest?.seq ?? 0);
  useEffect(() => {
    if (!centerRequest || centerRequest.seq === handledCenterRef.current) return;
    handledCenterRef.current = centerRequest.seq;
    const node = nodesRef.current.find((n) => n.id === centerRequest.id);
    if (!node) return;
    const s2 = clampZoom(centerRequest.zoom) / 100;
    setZoom(centerRequest.zoom);
    setPan(-(node.x - CX) * s2, -(node.y - CY) * s2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerRequest?.seq]);

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

  // ThinkWise식 붙여넣기 — 노드를 '선택만' 한 상태(편집 아님)에서 Ctrl+V
  // 하면 선택 노드의 "하위 노드"를 만들고 클립보드 내용을 **모두 그 노드에
  // 직접** 넣는다 (노트로 나누지 않는다 — 2026-07 사용자 피드백).
  //   · 텍스트(한 줄/여러 줄) → 하위 노드 텍스트에 줄바꿈 포함 전체 저장
  //   · 웹 기사 등 text/html → 텍스트 전체 = 노드 텍스트, 사진들은
  //     **원문 위치 그대로 텍스트 중간에**(인라인 이미지, afterLine 앵커)
  //   · 이미지 파일(스크린샷·복사한 그림) → "이미지" 하위 노드 + 사진
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
      const dt = e.clipboardData;
      if (!dt) return;

      // 노드 복사(Ctrl+C, 아래 keydown) 붙여넣기 — 내부 클립보드의
      // 서브트리들을 **선택 노드의 하위로** 붙인다 (2026-08-04 보고:
      // 멀티선택 복사가 텍스트 경로로 빠져 이상한 내용이 붙던 버그).
      const plainRaw = dt.getData('text/plain') ?? '';
      const maybeToken = plainRaw.trim();
      if (isNodeClipToken(maybeToken)) {
        e.preventDefault();
        const copied = takeStashed(maybeToken);
        if (copied?.length) {
          appendChildren(selectedId, reassignIds(copied as never) as never);
          selectOne(selectedId);
          return;
        }
        // 토큰만 오고 내용이 없다 — 다른 탭에서 복사했는데 그 서브트리가
        // 너무 커서 클립보드에 싣지 못했거나, 복사한 탭을 새로고침한 뒤다.
        notifyPaste('복사한 노드를 찾지 못했습니다 — 복사한 창에서 다시 Ctrl+C 한 뒤 붙여넣어 주세요.');
        return;
      }

      // 다른 마인드맵 앱의 **자기 앱 표시**를 걷어낸다. ThinkWise 는
      // 노드를 복사하면 text/plain 첫머리에 '[--iThinkWise--]' 를 넣어,
      // 그대로 붙이면 그 글자가 노드 본문에 남는다 (2026-08-05 보고 —
      // 하위 노드가 있으면 맨 윗줄에, 없으면 텍스트 앞에).
      const foreign = hasForeignMapMarker(maybeToken);
      if (foreign) {
        const stripped = stripForeignMapMarkers(maybeToken);
        if (!stripped) {
          // 표시만 왔다 = 그림을 복사한 경우. ThinkWise 는 클립보드에
          // 표준 이미지를 넣지 않아 브라우저가 그림을 읽을 수 없다.
          e.preventDefault();
          notifyPaste(
            'ThinkWise가 클립보드에 그림을 넣지 않았습니다 (자기 형식만 넣습니다). '
            + '그림은 ThinkWise에서 이미지 파일로 저장하거나 화면을 캡처해 붙여넣어 주세요.',
          );
          return;
        }
      }

      const hasImgFile = Array.from(dt.files ?? []).some((f) =>
        f.type.startsWith('image/'),
      );
      const rawHtmlAll = dt.getData('text/html') ?? '';
      // **표가 있으면 그림보다 표를 우선한다** (2026-08-06 보고).
      //
      // 엑셀·스프레드시트는 표를 복사할 때 클립보드에 **표를 찍은 비트맵**
      // 도 함께 넣는다. 그림 파일이 있다는 이유만으로 HTML 을 통째로
      // 버리면(예전 `hasImgFile ? '' : ...`), 편집할 수 있는 표 대신
      // **노드 텍스트는 탭 구분 문자열 + 표 그림**이 붙는다. 사용자에게는
      // "표가 보이는데 더블클릭해도 아무 내용이 없고 지울 수도 없는"
      // 상태로 보인다 — 실제로는 표가 아니라 사진이었다.
      // (MD 내보내기에서 `![거래일시\t적요 …](files/img-1.png)` 로 확인)
      const htmlHasTable = /<table[\s>]/i.test(rawHtmlAll);
      const rawHtml = (hasImgFile && !htmlHasTable) ? '' : rawHtmlAll;
      // 기사(html)는 텍스트와 사진 위치를 "같은 줄 규칙"으로 함께 뽑는다 —
      // text/plain과 줄을 맞추면 사진 앵커가 어긋나기 쉽다
      const art = rawHtml
        ? extractArticleContent(rawHtml)
        : { text: '', images: [] };
      const plain = stripForeignMapMarkers(
        (dt.getData('text/plain') ?? '').replace(/\r\n?/g, '\n'),
      );
      // 표로 변환됐다면 클립보드의 비트맵 사본은 붙이지 않는다 (중복)
      const usedTable = htmlHasTable && /^\|/m.test(art.text);
      const text = art.text || plain;
      if (!hasImgFile && !text && art.images.length === 0) return; // 붙일 내용 없음

      e.preventDefault();
      const childId = addChildNode(selectedId);
      if (!childId) return;

      // 텍스트 전체(줄바꿈 포함)를 노드에 그대로 — 없으면 "이미지"
      updateNodeText(childId, text || '이미지');
      if (art.images.length) {
        // 사진들을 원문 위치(afterLine)째 노드 텍스트 중간에 — 우선 기본
        // 크기로 배치하고, 실측이 끝나면 실제 비율로 갱신한다
        const initial = probeArticleImages(art.images, (resolved) =>
          setNodeImages(childId, resolved),
        );
        setNodeImages(childId, initial);
      } else if (!usedTable) {
        // 이미지 파일(스크린샷 등) → 노드 사진.
        // **표를 붙인 경우는 건너뛴다** — 그 그림은 방금 붙인 표의 사본이다.
        extractClipboardImage(dt, (img) => setNodeImage(childId, img), {
          allowHtml: false,
        });
      }
      // 만든 하위 노드를 바로 선택
      selectOne(childId);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, setNodeImage, setNodeImages, addChildNode, updateNodeText, notifyPaste]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      const isEditingText =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;

      if (isEditingText) return;

      const mod = e.ctrlKey || e.metaKey;

      // ── 노드 복사 (Ctrl+C) — 러버밴드 다중 선택/단일 선택의 서브트리를
      // 내부 클립보드에 담고, 시스템 클립보드에는 토큰만 쓴다. 붙여넣기
      // (Ctrl+V)는 위 handlePaste 가 토큰을 알아보고 선택 노드의 하위로
      // 붙인다 (2026-08-04 보고 수정).
      if (mod && (e.key === 'c' || e.key === 'C')) {
        const ids = multiSelectedIds.length > 1
          ? multiSelectedIds
          : selectedId && selectedId !== 'root' ? [selectedId] : [];
        if (!ids.length) return; // 복사할 노드 없음 — 브라우저 기본 동작
        // 캔버스에서 텍스트를 드래그 선택한 상태면 텍스트 복사를 우선
        if ((window.getSelection()?.toString() ?? '').trim()) return;
        e.preventDefault();
        const subtrees = collectSubtrees(useDocumentStore.getState().map, ids);
        if (!subtrees.length) return;
        const token = stashNodes(subtrees);
        void navigator.clipboard?.writeText?.(token).catch(() => { /* http 등 */ });
        return;
      }

      // ── 노드 잘라내기 (Ctrl+X) — 복사와 같은 방식으로 담고 원본을
      // 지운다. 붙여넣기(Ctrl+V)는 복사와 동일 경로 (2026-08-05 보고:
      // 복사·붙여넣기는 되는데 잘라내기가 없었다). 중심 주제는 지울 수
      // 없으므로 복사와 마찬가지로 대상에서 빠진다.
      if (mod && (e.key === 'x' || e.key === 'X')) {
        const ids = multiSelectedIds.length > 1
          ? multiSelectedIds
          : selectedId && selectedId !== 'root' ? [selectedId] : [];
        if (!ids.length) return;
        if ((window.getSelection()?.toString() ?? '').trim()) return;
        e.preventDefault();
        const subtrees = collectSubtrees(useDocumentStore.getState().map, ids);
        if (!subtrees.length) return;
        const token = stashNodes(subtrees);
        void navigator.clipboard?.writeText?.(token).catch(() => { /* http 등 */ });
        // 담은 뒤 원본 삭제 — Ctrl+Z 한 번으로 되돌아온다
        if (ids.length > 1) deleteNodesBulk(ids);
        else deleteNode(ids[0]);
        return;
      }

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

        // 러버밴드 다중 선택 = 일괄 삭제 (한 번의 undo 단계)
        if (multiSelectedIds.length > 1) {
          deleteNodesBulk(multiSelectedIds);
          selectOne(null);
          return;
        }
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
    // 휠 클릭 + 우클릭 드래그 = 임시 Pan (Pan 모드를 켜지 않고도 화면 이동,
    // 버튼을 떼면 자동 해제). 우클릭 컨텍스트 메뉴는 svg에서 차단.
    const isMiddleButton = e.button === 1 || e.button === 2;
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

      {/* 붙여넣기 안내 — 붙일 것이 없을 때 "아무 반응 없음"으로 보이지
          않게 캔버스 위쪽에 잠깐 띄운다 (2026-08-05) */}
      {pasteNotice && (
        <div
          data-testid="canvas-notice"
          style={{
            position: 'absolute', top: 14, left: '50%',
            transform: 'translateX(-50%)', zIndex: 20,
            maxWidth: 620, padding: '9px 14px', borderRadius: 8,
            background: t.surface, color: t.text,
            border: `1px solid ${t.warning}`,
            borderLeft: `4px solid ${t.warning}`,
            boxShadow: '0 6px 20px rgba(60,45,15,0.22)',
            fontSize: 12, lineHeight: 1.5,
          }}
        >
          {pasteNotice}
        </div>
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
        // 노드 안 사진(SVG image)은 브라우저가 기본 드래그 대상으로 취급해
        // 노드를 끌면 반투명 스냅샷(주황빛 창)이 네이티브 드래그 고스트로
        // 뜬다 — 캔버스 안에서 시작되는 네이티브 드래그를 전부 차단한다.
        // (노드 이동은 포인터 이벤트 기반이라 영향 없고, 외부 파일을
        // 캔버스로 끌어오는 드롭은 밖에서 시작되므로 그대로 동작한다)
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
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
          {/* 시간배치 — 수평 시간축 화살표.
              · 타임라인: 루트 오른쪽 변 → 마지막 주제 너머
              · 중앙노드: 첫 주제 앞 → 마지막 주제 너머, 루트를 관통하되
                루트 상자 안은 비워 둔다(선이 글자를 가로지르지 않게). */}
          {(normalizedLayout === 'timeline' || normalizedLayout === 'timeline-center')
            && !focusedId && (() => {
            const root = nodes.find((n) => n.depth === 0);
            if (!root) return null;
            const centered = normalizedLayout === 'timeline-center';
            const maxX = nodes.reduce((m, n) => Math.max(m, n.x + n.w / 2), root.x + root.w / 2);
            const endX = maxX + 46;
            const minX = nodes.reduce((m, n) => Math.min(m, n.x - n.w / 2), root.x - root.w / 2);
            const startX = centered ? minX - 46 : root.x + root.w / 2;
            return (
              <g data-testid="timeline-axis" pointerEvents="none">
                {centered && (
                  <line x1={startX} y1={root.y} x2={root.x - root.w / 2} y2={root.y}
                        stroke={t.edge} strokeWidth={2.3} strokeLinecap="round" />
                )}
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
                searchHit={n.id === searchHitId}
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
            // findDropZone 과 같은 축 규칙: 자식/부모 바 = 자식 성장
            // 방향의 앞/뒤 변, 형제 바 = 부모의 자식 방향에 수직인 변
            // (진행트리 = 좌우 세로 바, 가로 레이아웃 = 상하 가로 바)
            const dirC = childDirOf(tgt);
            const parentNode = nodes.find((n) => n.id === tgt.parent);
            const sibDir = parentNode ? childDirOf(parentNode) : dirC;
            const sibHorizontal = sibDir === 'down' || sibDir === 'up';
            const topBar = { x: tgt.x - tgt.w / 2, y: tgt.y - tgt.h / 2 - BAR, w: tgt.w, h: BAR };
            const bottomBar = { x: tgt.x - tgt.w / 2, y: tgt.y + tgt.h / 2, w: tgt.w, h: BAR };
            const leftBar = { x: tgt.x - tgt.w / 2 - BAR, y: tgt.y - tgt.h / 2, w: BAR, h: tgt.h };
            const rightBar = { x: tgt.x + tgt.w / 2, y: tgt.y - tgt.h / 2, w: BAR, h: tgt.h };
            const edgeBar = (dir: 'left' | 'right' | 'down' | 'up') =>
              dir === 'down' ? bottomBar : dir === 'up' ? topBar
                : dir === 'left' ? leftBar : rightBar;
            const opposite = (dir: 'left' | 'right' | 'down' | 'up') =>
              dir === 'down' ? 'up' as const : dir === 'up' ? 'down' as const
                : dir === 'left' ? 'right' as const : 'left' as const;
            let bar: { x: number; y: number; w: number; h: number };
            if (dropZone.position === 'before') {
              bar = sibHorizontal ? leftBar : topBar;
            } else if (dropZone.position === 'after') {
              bar = sibHorizontal ? rightBar : bottomBar;
            } else if (dropZone.position === 'parent') {
              bar = edgeBar(opposite(dirC));
            } else {
              bar = edgeBar(dirC); // child — 자식이 자라는 변
            }
            // 'child' 는 **노드 전체를 초록 테두리로 감싸** "이 노드
            // 안에 넣는다"를 분명히 한다 (2026-08-05) — 변에 붙은 얇은
            // 바만으로는 형제 바와 혼동됐다. 자식이 자라는 변의 바도
            // 함께 그려 어느 쪽에 붙을지 같이 보여 준다.
            const isChild = dropZone.position === 'child';
            return (
              <g pointerEvents="none">
                {isChild && (
                  <rect
                    x={tgt.x - tgt.w / 2 - 3} y={tgt.y - tgt.h / 2 - 3}
                    width={tgt.w + 6} height={tgt.h + 6} rx={10}
                    fill={t.success} fillOpacity="0.12"
                    stroke={t.success} strokeWidth={2} />
                )}
                <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={3}
                  fill={t.success} opacity="0.95" />
              </g>
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
                  // 접기 토글 위치 — 레이아웃 종류로 "결정론적으로" 정한다.
                  // 예전의 자식 좌표 평균 방향 방식은 같은 레이아웃에서도
                  // 자식 수·높이에 따라 노드마다 하단/오른쪽이 뒤섞였다
                  // (2026-07). 방사형·양쪽/타임라인처럼 방향이 데이터에
                  // 달린 레이아웃만 자식 좌표 평균으로 판단한다.
                  // (HTML 뷰어 drawNode와 동일 규칙)
                  const eff = effByNode.get(n.id) ?? '';
                  // 자식 좌표 평균 방향 — collapseAnchor 가 레이아웃으로
                  // 방향을 못 정할 때만 쓰는 폴백
                  let sd: FallbackDir = (n.side === 'left' ? 'left' : 'right');
                  if (!n.collapsed) {
                    let adx = 0; let ady = 0; let acnt = 0;
                    for (const c of visibleNodes) {
                      if (c.parent !== n.id) continue;
                      adx += c.x - n.x; ady += c.y - n.y; acnt++;
                    }
                    if (acnt) {
                      sd = Math.abs(ady) > Math.abs(adx)
                        ? (ady > 0 ? 'down' : 'up')
                        : (adx > 0 ? 'right' : 'left');
                    }
                  }
                  // **연결선이 노드를 떠나는 지점**에 아이콘을 놓는다
                  // (2026-08-05 — 트리·진행트리는 변 한가운데가 아니라
                  //  왼쪽 스파인에서 선이 시작한다. collapseAnchor.ts)
                  // 칩 크기(접힘 +N 은 자릿수만큼 커진다)를 함께 넘겨
                  // 노드 테두리를 파고들지 않게 한다 (CollapseControl 과 같은 식)
                  const cnt = descCount.get(n.id) ?? n._childCount ?? 0;
                  const chipR = !n.collapsed ? 8.5
                    : String(cnt).length >= 3 ? 13
                      : String(cnt).length === 2 ? 10.5 : 8.5;
                  const pos = collapseAnchor(n, eff, sd, chipR);
                  return (
                    <CollapseControl
                      key={`toggle-${n.id}`}
                      t={t}
                      x={pos.x}
                      y={pos.y}
                      nodeId={n.id}
                      collapsed={!!n.collapsed}
                      count={descCount.get(n.id) ?? n._childCount ?? 0}
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
              never covered by other nodes. (노트는 아래 NoteViewerPopover)
              노드 오른쪽 배치 + 호버 강조 + 첨부 새 탭/다운로드 정책은
              ChooserPopover.tsx / openAttachment.ts 참조. */}
          {popover && !isNoteKind(popover.kind) && (() => {
            const node = nodes.find((n) => n.id === popover.nodeId);
            if (!node) return null;
            const ind = nodeContentIndicators(node).find((c) => c.kind === popover.kind);
            if (!ind || ind.items.length === 0) return null;
            return (
              <ChooserPopover
                t={t}
                node={node}
                ind={ind}
                onClose={() => setPopover(null)}
              />
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
// - expanded    → nothing by default; hovering the NODE (or this spot) shows
//                 the collapse (−) icon right away — click collapses.
//                 (예전의 "점 → 호버 시 아이콘" 2단계는 클릭까지 두 번
//                 조준해야 해서 제거 — 2026-07. 맵은 여전히 깨끗하다:
//                 호버 전에는 아무것도 그리지 않는다.)
function CollapseControl({
  t, x, y, collapsed, count, nodeHovered, onToggle, nodeId,
}: {
  t: ThemeTokens;
  x: number;
  y: number;
  collapsed: boolean;
  count: number; // 접힘 시 표시할 숨은 노드(전체 자손) 수
  nodeHovered: boolean;
  onToggle: () => void;
  nodeId: string; // 검증용 — 어느 노드의 토글인지 (e2e106 위치 실측)
}) {
  const [h, setH] = useState(false);

  const wrap = (children: ReactNode, title: string) => (
    <g
      data-testid="collapse-toggle"
      data-node-id={nodeId}
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
      <circle r="13" fill="transparent" />
      {children}
    </g>
  );

  if (collapsed) {
    // 숨은 노드 수를 칩 안에 표시 (HTML 뷰어 +N 칩과 동일) —
    // 자릿수에 맞춰 칩 크기 확대
    const label = String(count);
    const r = label.length >= 3 ? 13 : label.length === 2 ? 10.5 : 8.5;
    return wrap(
      <>
        <circle r={r} fill={t.primary} stroke={t.primary} strokeWidth="1.4" />
        <text
          y={3.4}
          textAnchor="middle"
          fontSize="9.5"
          fontWeight={700}
          fill="#fff"
        >{label}</text>
      </>,
      `펼치기 — 숨은 노드 ${count}개`,
    );
  }

  // expanded: hidden until the node (or this control) is hovered —
  // 호버 즉시 접기(−) 아이콘을 보여주고 한 번의 클릭으로 접는다
  if (!nodeHovered && !h) return null;

  return wrap(
    <>
      <circle r="8.5" fill={t.surface} stroke={t.primary} strokeWidth="1.4" />
      <line x1={-4} y1={0} x2={4} y2={0} stroke={t.primary} strokeWidth="1.6" strokeLinecap="round" />
    </>,
    '접기',
  );
}
