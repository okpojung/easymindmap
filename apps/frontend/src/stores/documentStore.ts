// Document Store — owns the persisted map document.
// Only this store's data is written to the DB.
//
// Implements the editor-core mutations from docs/00-project-overview/mvp-scope.md §3:
// - root auto-created, not deletable / movable / collapsible
// - add child & sibling nodes (depth ≤ 50, ltree chk_nodes_depth)
// - inline text edit, delete (subtree), drag & drop move (reparent)
// - collapse / expand
// - per-node layoutType override (15 types)
// - node style (+ inheritance from parent, depth-based default fontSize)
// - node content: tags, links, structured notes, attachments

import { create } from 'zustand';
import { SAMPLE_ROADMAP } from '@/editor/__samples__';
import type {
  ShapeType,
  SampleMap,
  SampleRoot,
  SampleBranch,
  MindNode,
  NodeColorKey,
  NodeStyle,
  NodeLink,
  NoteBlock,
  NoteBlockType,
  NodeAttachment,
  NodeImage,
  NodeInlineImage,
  LevelFontSetting,
} from '@/editor/__samples__/types';
import type { TextAlign, LayoutType, EdgeType } from '@/types/mindmap';
// 히스토리 스냅샷에 전체 레이아웃을 함께 기록/복원하기 위해서만 사용
// (editorUiStore는 documentStore를 import하지 않으므로 순환 없음).
import { useEditorUiStore } from './editorUiStore';

// ltree physical limit operating cap (chk_nodes_depth). Root is depth 0.
export const MAX_DEPTH = 50;

const BRANCH_COLOR_KEYS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

/** '맵 닫기' 후의 빈 문서 제목 — "지금 열린 문서가 없다"의 단일 기준 */
export const EMPTY_MAP_TITLE = '문서 없음';

/**
 * 새 맵의 기본 제목. 2026-08-02 규칙 3 — 새 맵을 만들 때는 제목을 묻지
 * 않고 이 이름으로 시작하고, **서버에 저장할 때** 폴더와 이름을 정한다.
 */
export const NEW_MAP_TITLE = '새 맵';

/** 지금 열린 문서가 없는 상태인가 (맵 닫기 직후 / 첫 진입) */
export function isDocumentEmpty(map: { title: string; branches: unknown[] }): boolean {
  return map.title === EMPTY_MAP_TITLE && map.branches.length === 0;
}

// Undo/redo history: max snapshots, and a guard so undo/redo themselves aren't
// recorded as new history entries.
// 각 스냅샷은 맵과 "그때의 전체 레이아웃"을 함께 담는다 — 레이아웃(칸반 등)은
// editorUiStore에 있어 맵만 되돌리면 화면이 바뀌지 않는 문제가 있었다
// (칸반 전환 → Ctrl+Z 시 이전 레이아웃으로 함께 복원).
//
// 되돌리기는 "이 편집 세션" 한정이다 (메모리 내 — 새로고침하면 사라짐).
// 99단계 = 카운터를 두 자리(-99)로 표시하기 위한 상한 (2026-07 사용자 결정).
// 세션을 닫고 저장할 때마다의 "히스토리"(저장일시별 버전)는 별개 기능으로,
// 서버 저장과 연결될 때 구현한다 — docs/03-editor-core/history 참조.
export const HISTORY_LIMIT = 99;
let applyingHistory = false;

export interface HistoryEntry {
  map: SampleMap;
  layout: LayoutType;
}

// 연속 갱신(노드 크기 핸들 드래그 등) 동안 히스토리 기록을 잠근다 —
// 첫 변경만 기록해 1회 드래그 = 1개 undo 단계가 되게 한다.
let historyPaused = false;
export function setHistoryPaused(v: boolean) {
  historyPaused = v;
}

interface DocumentState {
  map: SampleMap;

  /**
   * **이 문서가 어느 서버 맵에서 온 것인가** (2026-08-05 유실 감사).
   *
   * 자동저장은 `cloudStore.cloudMapId` 만 보고 저장한다. 그런데 문서를
   * 통째로 바꾸면서(loadMap) 서버 링크를 끊지 않은 경로가 있으면,
   * **전혀 다른 문서가 그 맵에 저장된다** — 실제로 AI 새 맵 생성
   * (AITab)이 detachFromServer 없이 loadMap 만 해서, 열어 두었던
   * 서버 맵이 AI 맵으로 덮어써지는 것을 재현했다.
   *
   * 그래서 문서 쪽에도 출처를 적어 두고, 자동저장이 **출처와 저장
   * 대상이 다르면 아예 보내지 않는다** (useCloudAutosave). 호출부를
   * 하나씩 고치는 대신 구조로 막는다 — 앞으로 새 경로가 생겨도
   * 기본값(null)이라 위험한 저장이 일어나지 않는다.
   */
  docOrigin: string | null;
  /** 서버 저장/열기 성공 시 이 문서의 출처를 그 맵으로 표시 */
  setDocOrigin: (mapId: string | null) => void;

  // Undo / redo history (in-memory — no DB required)
  past: HistoryEntry[];
  future: HistoryEntry[];
  undo: () => void;
  redo: () => void;
  /**
   * **지금 화면 상태를 "최신"으로 확정한다** — 다시 실행(future) 을 버린다.
   *
   * 되돌리기로 -5 까지 간 뒤 "이 상태가 최신이었으면 좋겠다"일 때 쓴다.
   * 원래는 **아무 편집이나 한 번** 하면 같은 일이 일어나지만(아래 구독의
   * `future: []`), 편집할 것이 없는데 확정만 하고 싶은 경우가 있어
   * 되돌리기 단계 배지 클릭으로 부를 수 있게 했다 (2026-08-06 요청).
   */
  commitCurrentAsLatest: () => void;

  // 개발 모드(:인증 꺼짐) 시안 확인용 샘플 맵 주입 — EditorPage 전용
  setSample: () => void;

  // Structure
  addChildNode: (parentId: string | null) => string;
  addChildNodesBulk: (parentId: string | null, texts: string[]) => void;
  // AI 노드 확장 — 파싱된 하위 트리(children)를 선택 노드 아래에 붙인다.
  appendChildren: (nodeId: string | null, children: MindNode[]) => void;
  addSiblingNode: (nodeId: string | null, position?: 'before' | 'after') => string;
  addParentNode: (nodeId: string | null) => string;
  deleteNode: (nodeId: string | null) => void;
  // 러버밴드 다중 선택 일괄 삭제 — 한 번의 set = undo 1단계
  deleteNodesBulk: (nodeIds: string[]) => void;
  moveNode: (nodeId: string | null, newParentId: string | null) => boolean;
  // Drag-and-drop move relative to a target node (drop zones).
  moveNodeRelative: (
    nodeId: string | null,
    targetId: string | null,
    position: 'child' | 'before' | 'after' | 'parent',
  ) => boolean;

  // View state
  toggleCollapse: (nodeId: string | null) => void;
  setCollapsed: (nodeId: string | null, collapsed: boolean) => void;
  // 모두 접기/펼치기 — 자식이 있는 모든 노드(2레벨 이하 전부)를 일괄
  // 접거나 편다 (HTML 뷰어의 +/− 아이콘과 동일 동작)
  collapseAll: () => void;
  expandAll: () => void;
  expandAncestors: (nodeId: string) => void;

  // Text / align / layout
  updateNodeText: (nodeId: string | null, text: string) => void;
  updateNodeTextAlign: (nodeId: string | null, textAlign: TextAlign) => void;
  updateNodeLayoutType: (nodeId: string | null, layoutType: LayoutType) => void;

  // 맵 전체 설정 — 레벨(깊이)별 기본 폰트 (좌측 '맵 설정' 메뉴)
  // level: 0=Root, 1~3=Level1~3, 4=Level4+ / patch에 size·family 부분 갱신
  updateLevelFont: (level: number, patch: LevelFontSetting) => void;
  resetLevelFonts: () => void;
  // 레벨별 레이아웃 — 해당 레벨(1~3, 4=Level4+)의 모든 노드에 서브트리
  // 레이아웃을 일괄 적용 (null = 해제하고 상위 레이아웃 따름)
  setLevelLayout: (level: number, layoutType: LayoutType | null) => void;
  // 레벨별 기본 도형 — index 0=1레벨(중심) … 4=5레벨+ (null = 기본)
  setLevelShape: (level: number, shape: ShapeType | null) => void;
  // 노트 글꼴·크기 (맵 설정 — 기본 13pt)
  setNoteFont: (patch: { size?: number; family?: string }) => void;

  // 현재 맵 전체 교체 (템플릿 적용 등 — undo 히스토리에 기록됨).
  // opts.resetHistory: **다른 문서를 여는 경우**(서버 맵 열기·파일
  // 불러오기)는 반드시 true — 되돌리기가 "열기 이전 문서"까지 거슬러
  // 가면 안 된다 (2026-08-05 유실 재현: 열자마자 Ctrl+Z 를 몇 번 밀면
  // 이전 문서의 '문서 없음' 자리표시가 현재 문서가 되고, 그 상태로
  // ☁ 저장하면 서버 맵이 통째로 비워졌다).
  //  · serverMapId: 이 문서가 그 서버 맵에서 온 것이면 id (openMapHere)
  //  · keepOrigin : 같은 문서를 바꾸는 것이라 출처를 유지 (템플릿 적용)
  //  기본값은 **출처 없음** — 서버 맵과 무관한 새 문서로 본다(안전 쪽).
  loadMap: (
    map: SampleMap,
    opts?: { resetHistory?: boolean; serverMapId?: string; keepOrigin?: boolean },
  ) => void;
  // 문서 제목만 교체 (서버 저장 이름과 맞추기 — 중심 주제는 건드리지 않는다)
  setMapTitle: (title: string) => void;
  // 새 맵 시작 — 루트만 있는 기본 맵 ('새 맵' 메뉴)
  newMap: (title?: string) => void;
  // 맵 닫기 — 중심 주제만 남은 빈 문서로 되돌린다 (B7 '맵 닫기').
  // 서버 저장·클라우드 링크 해제는 호출부(mapSession.saveAndCloseMap)가 담당한다.
  closeMap: () => void;
  // undo/redo 히스토리 비우기 — 로그인/로그아웃 전환에서만 쓴다.
  // 계정이 바뀌는 경계에서 이전 세션의 문서가 Ctrl+Z 로 되살아나면 안 된다.
  clearHistory: () => void;

  // 노드 박스 수동 크기 (우하단 핸들 드래그, null = 자동 크기로 복귀)
  updateNodeSize: (nodeId: string | null, size: { w?: number; h?: number } | null) => void;
  // 노드 안 사진 (붙여넣기, undefined = 제거)
  setNodeImage: (nodeId: string | null, image: NodeImage | undefined) => void;
  // 노드 텍스트 중간 인라인 사진들 (기사 붙여넣기 — 원문 위치 보존)
  setNodeImages: (
    nodeId: string | null,
    images: NodeInlineImage[] | undefined,
  ) => void;

  // Style / icon
  updateNodeStyle: (nodeId: string | null, style: Partial<NodeStyle>) => void;
  // 여러 노드에 일괄 적용 (러버밴드 다중 선택) — 한 번의 undo 단계
  updateNodesStyle: (nodeIds: string[], style: Partial<NodeStyle>) => void;
  updateNodesTextAlign: (nodeIds: string[], textAlign: TextAlign) => void;
  setNodeIcon: (nodeId: string | null, icon: string | undefined) => void;
  setNodeIconSide: (nodeId: string | null, iconSide: 'left' | 'right') => void;

  // 방사형·양쪽 레이아웃에서 2레벨(depth 1) 브랜치의 좌/우 배치 — 드래그로 반대쪽
  // 이동, 루트 +버튼의 좌/우 추가에 사용 (다른 레이아웃에서는 무시됨)
  setBranchSide: (branchId: string | null, side: 'left' | 'right') => void;

  // Tags
  addNodeTag: (nodeId: string | null, tag: string) => void;
  removeNodeTag: (nodeId: string | null, tag: string) => void;

  // Links
  addNodeLink: (nodeId: string | null, url: string, label?: string) => void;
  removeNodeLink: (nodeId: string | null, linkId: string) => void;

  // Notes (structured blocks) — extra: 리치 붙여넣기(html) 등 초기 필드
  // afterBlockId: 그 블록 "바로 뒤"에 삽입 (체크리스트 Enter로 다음 항목 추가).
  // 생략하면 맨 뒤에 추가한다.
  addNoteBlock: (
    nodeId: string | null,
    type: NoteBlockType,
    text?: string,
    extra?: Partial<NoteBlock>,
    afterBlockId?: string,
  ) => void;
  updateNoteBlock: (nodeId: string | null, blockId: string, patch: Partial<NoteBlock>) => void;
  removeNoteBlock: (nodeId: string | null, blockId: string) => void;

  // Attachments
  addNodeAttachment: (
    nodeId: string | null,
    attachment: Omit<NodeAttachment, 'id'>,
  ) => void;
  removeNodeAttachment: (nodeId: string | null, attachmentId: string) => void;
}

// ---------------------------------------------------------------------------
// id helpers
// ---------------------------------------------------------------------------

function createNodeId() {
  return `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function createSubId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function resolveEdgeType(layoutType: LayoutType): EdgeType {
  if (layoutType === 'radial' || layoutType === 'both-radial') {
    return 'curve-line';
  }
  return 'tree-line';
}

// depth 0 = root, 1 = branch, 2+ = deeper
function defaultFontSizeForDepth(depth: number): number {
  return depth === 0 ? 18 : depth === 1 ? 14 : 13;
}

// New nodes intentionally have no layoutType: they inherit the layout of
// their parent / the map until the user explicitly overrides them.
function createNewNode(): MindNode {
  return {
    id: createNodeId(),
    text: '새 노드',
    textAlign: 'left',
    children: [],
  };
}

// Style inheritance (mvp-scope §3): copy the parent's style, but reset the
// fontSize to the depth default so deeper nodes shrink automatically.
function inheritStyle(
  parentStyle: NodeStyle | undefined,
  childDepth: number,
): NodeStyle | undefined {
  if (!parentStyle) return undefined;
  return { ...parentStyle, fontSize: defaultFontSizeForDepth(childDepth) };
}

// Inherit the reference node's colour family so a new node keeps the SAME fill
// (and border/text) as the node it was created from — the default fill comes
// from colorKey, not style, so it must be inherited explicitly. Root's 'root'
// key is not inheritable (new branches cycle their own colour).
function inheritColorKey(ref: { colorKey?: NodeColorKey } | null | undefined): NodeColorKey | undefined {
  const key = ref?.colorKey;
  if (!key || key === 'root') return undefined;
  return key;
}

// ---------------------------------------------------------------------------
// normalization / cloning
// ---------------------------------------------------------------------------

function normalizeNode<T extends MindNode>(node: T): T {
  const withEdge = node as T & { edgeType?: EdgeType };

  return {
    ...node,
    // 정렬은 저장값 그대로 — 미지정이면 렌더 시 '레벨 기본 맞춤(맵 설정)
    // → 중앙' 순으로 적용된다 (여기서 center를 강제하면 레벨 맞춤이
    // 영원히 적용되지 못한다)
    textAlign: node.textAlign,
    edgeType: withEdge.edgeType ?? resolveEdgeType(node.layoutType ?? 'radial'),
    children: node.children ? node.children.map((child) => normalizeNode(child)) : [],
  } as T;
}

// 클라우드 스냅샷도 이 정규형으로 저장한다 (2026-08-03) — 새 맵/불러오기
// 직후의 맵은 edgeType·children 기본값이 빠져 있어, 그대로 저장하면
// "다시 열기(정규화) → 닫기" 때 내용이 같은데도 문서가 달라 보여
// 히스토리 버전이 하나 더 생겼다. 저장·로드가 같은 형태면 서버의
// jsonb 등가 비교가 조회-닫기를 무변경으로 판정할 수 있다.
export function normalizeMapForSnapshot(map: SampleMap): SampleMap {
  return cloneMap(map);
}

function cloneMap(map: SampleMap): SampleMap {
  return {
    ...map,
    root: {
      ...map.root,
      textAlign: map.root.textAlign,
    },
    branches: map.branches.map((branch) => normalizeNode(branch)),
  };
}

// ---------------------------------------------------------------------------
// tree queries
// ---------------------------------------------------------------------------

export function findNodeInMap(map: SampleMap, nodeId: string | null): MindNode | SampleRoot | null {
  if (!nodeId) return null;
  if (nodeId === 'root') return map.root;
  return findNode(map.branches, nodeId);
}

function findNode(nodes: MindNode[], nodeId: string): MindNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNode(node.children ?? [], nodeId);
    if (found) return found;
  }
  return null;
}

export function getNodeDepth(map: SampleMap, nodeId: string | null): number {
  if (!nodeId || nodeId === 'root') return 0;

  let depth = -1;
  const walk = (nodes: MindNode[], d: number) => {
    for (const node of nodes) {
      if (depth !== -1) return;
      if (node.id === nodeId) {
        depth = d;
        return;
      }
      walk(node.children ?? [], d + 1);
    }
  };
  walk(map.branches, 1);
  return depth;
}

export function findParentId(map: SampleMap, nodeId: string | null): string | null {
  if (!nodeId || nodeId === 'root') return null;
  if (map.branches.some((b) => b.id === nodeId)) return 'root';

  let parentId: string | null = null;
  const walk = (nodes: MindNode[]) => {
    for (const node of nodes) {
      if (parentId) return;
      if ((node.children ?? []).some((c) => c.id === nodeId)) {
        parentId = node.id;
        return;
      }
      walk(node.children ?? []);
    }
  };
  walk(map.branches);
  return parentId;
}

function subtreeHeight(node: MindNode): number {
  const children = node.children ?? [];
  if (children.length === 0) return 0;
  return 1 + Math.max(...children.map(subtreeHeight));
}

function isSelfOrDescendant(node: MindNode, targetId: string): boolean {
  if (node.id === targetId) return true;
  return (node.children ?? []).some((c) => isSelfOrDescendant(c, targetId));
}

// ---------------------------------------------------------------------------
// immutable updaters
// ---------------------------------------------------------------------------

function updateNodeById(
  nodes: MindNode[],
  nodeId: string,
  updater: (node: MindNode) => MindNode,
): MindNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) return updater(node);
    const children = node.children ?? [];
    if (children.length === 0) return node;
    return { ...node, children: updateNodeById(children, nodeId, updater) };
  });
}

// Applies `updater` to the matching node anywhere in the map, including root.
function mutateNode(
  map: SampleMap,
  nodeId: string,
  updater: (node: MindNode) => MindNode,
): SampleMap {
  if (nodeId === 'root') {
    const updated = updater(map.root as unknown as MindNode);
    return {
      ...map,
      root: { ...(updated as unknown as SampleRoot), id: 'root', colorKey: 'root' },
    };
  }
  return {
    ...map,
    branches: updateNodeById(map.branches, nodeId, updater) as SampleBranch[],
  };
}

function clearLayoutTypeRecursive(nodes: MindNode[]): MindNode[] {
  return nodes.map((node) => ({
    ...node,
    layoutType: undefined,
    children: clearLayoutTypeRecursive(node.children ?? []),
  }));
}

function deleteNodeRecursive(nodes: MindNode[], nodeId: string): MindNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: deleteNodeRecursive(node.children ?? [], nodeId),
    }));
}

// Removes `nodeId` from the tree and returns the removed node (for moveNode).
function extractNode(
  nodes: MindNode[],
  nodeId: string,
): { nodes: MindNode[]; removed: MindNode | null } {
  let removed: MindNode | null = null;
  const next: MindNode[] = [];

  for (const node of nodes) {
    if (node.id === nodeId) {
      removed = node;
      continue;
    }
    const res = extractNode(node.children ?? [], nodeId);
    if (res.removed) {
      removed = res.removed;
      next.push({ ...node, children: res.nodes });
    } else {
      next.push(node);
    }
  }

  return { nodes: next, removed };
}

function appendChild(nodes: MindNode[], parentId: string, child: MindNode): MindNode[] {
  return updateNodeById(nodes, parentId, (node) => ({
    ...node,
    children: [...(node.children ?? []), child],
  }));
}

function insertSibling(
  nodes: MindNode[],
  siblingId: string,
  newNode: MindNode,
  position: 'before' | 'after',
): MindNode[] {
  const idx = nodes.findIndex((n) => n.id === siblingId);
  if (idx !== -1) {
    const next = [...nodes];
    next.splice(position === 'before' ? idx : idx + 1, 0, newNode);
    return next;
  }
  return nodes.map((node) => {
    const children = node.children ?? [];
    if (children.length === 0) return node;
    return { ...node, children: insertSibling(children, siblingId, newNode, position) };
  });
}

function makeBranch(node: MindNode, indexForColor: number): SampleBranch {
  return {
    ...node,
    colorKey: (node.colorKey as NodeColorKey) ?? BRANCH_COLOR_KEYS[indexForColor % BRANCH_COLOR_KEYS.length],
    side: node.side === 'left' || node.side === 'right' ? node.side : indexForColor % 2 === 0 ? 'right' : 'left',
    icon: node.icon ?? '•',
    children: node.children ?? [],
  };
}

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

/**
 * **보기 전용 변경** — 접기/펴기처럼 *내용은 그대로인데 화면만 달라지는*
 * 변경 (2026-08-06 사용자 결정).
 *
 * 이런 변경은
 *   · 되돌리기(Ctrl+Z) 에 쌓이지 않는다 — 99단계가 접기/펴기로 채워져
 *     정작 되돌리고 싶은 편집이 밀려나던 문제
 *   · "미저장 편집" 으로 세지 않는다 — 접기/펴기만으로 서버 저장이
 *     일어나지 않는다
 *
 * 기준 한 줄: **"다시 만들어야 하는 것"은 포함, "다시 보면 되는 것"은 제외.**
 * (좌우 이동 `side` 는 사용자가 정한 배치라 **내용 쪽**이다 — 제외 아님)
 */
let viewOnlyChange = false;
export function isViewOnlyChange(): boolean {
  return viewOnlyChange;
}
/** 안의 set() 이 일으키는 구독은 보기 전용으로 표시된다 (동기 실행 전제) */
function asViewOnly(run: () => void): void {
  viewOnlyChange = true;
  try { run(); } finally { viewOnlyChange = false; }
}

/**
 * **문서 교체 — 되돌리기는 문서 경계를 넘지 않는다** (2026-08-06 보고).
 *
 * 맵 닫기·새 맵·샘플·열기처럼 문서를 **통째로 바꾸는** 전환에서는
 * 되돌리기 스택을 끊는다. 안 끊으면 이런 일이 난다 (실사용 재현):
 *
 * ```
 * 서버 맵 열기 → 편집 → 맵 닫기 → 새 맵 → 편집 3회
 *   → Ctrl+Z ×3 (여기까지 새 맵)
 *   → Ctrl+Z 더  →  **이전 맵이 튀어나온다**      ← 정체불명의 맵
 * ```
 *
 * 두 가지를 함께 해야 한다 —
 *   ① 전환 그 자체를 되돌리기에 **쌓지 않는다**(아래 구독의 `swapping`)
 *   ② 전환 뒤 스택을 **비운다**
 * ①이 없으면 비운 직후 구독이 이전 문서를 도로 밀어 넣는다(zustand
 * 구독은 set() 안에서 동기 실행된다).
 *
 * 개별 액션마다 `set({past:[],future:[]})` 를 흩뿌리는 대신 여기로 모은다 —
 * 새 전환 경로가 생겨도 이 헬퍼만 쓰면 규칙이 자동으로 지켜진다
 * (docOrigin 을 구조로 막은 것과 같은 방식, 14-save.md §7.5).
 */
let swappingDocument = false;
function asDocumentSwap(run: () => void): void {
  swappingDocument = true;
  try { run(); } finally { swappingDocument = false; }
  useDocumentStore.setState({ past: [], future: [] });
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  map: cloneMap(SAMPLE_ROADMAP),
  docOrigin: null,
  setDocOrigin: (docOrigin) => set({ docOrigin }),
  past: [],
  future: [],

  undo: () => {
    const { past, map, future } = get();
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    const curLayout = useEditorUiStore.getState().layoutType;
    applyingHistory = true;
    set({
      map: entry.map,
      past: past.slice(0, -1),
      future: [{ map, layout: curLayout }, ...future].slice(0, HISTORY_LIMIT),
    });
    // 스냅샷의 레이아웃도 함께 복원 (칸반 ↔ 트리 등 전체 레이아웃 전환)
    if (entry.layout !== curLayout) {
      useEditorUiStore.getState().setLayoutType(entry.layout);
    }
    applyingHistory = false;
  },

  commitCurrentAsLatest: () => set({ future: [] }),

  redo: () => {
    const { future, map, past } = get();
    if (future.length === 0) return;
    const entry = future[0];
    const curLayout = useEditorUiStore.getState().layoutType;
    applyingHistory = true;
    set({
      map: entry.map,
      future: future.slice(1),
      past: [...past, { map, layout: curLayout }].slice(-HISTORY_LIMIT),
    });
    if (entry.layout !== curLayout) {
      useEditorUiStore.getState().setLayoutType(entry.layout);
    }
    applyingHistory = false;
  },

  setSample: () => asDocumentSwap(
    () => set({ map: cloneMap(SAMPLE_ROADMAP), docOrigin: null })),

  addChildNode: (parentId) => {
    let newNodeId = '';

    set((state) => {
      const map = state.map;

      // Add a top-level branch.
      if (!parentId || parentId === 'root') {
        const newNode = createNewNode();
        newNodeId = newNode.id;
        const branch = makeBranch(
          { ...newNode, style: inheritStyle(map.root.style, 1) },
          map.branches.length,
        );
        return { map: { ...map, branches: [...map.branches, branch] } };
      }

      const parent = findNode(map.branches, parentId);
      if (!parent) return {};

      const parentDepth = getNodeDepth(map, parentId);
      if (parentDepth + 1 > MAX_DEPTH) return {}; // depth guard

      const newNode: MindNode = {
        ...createNewNode(),
        colorKey: inheritColorKey(parent),
        style: inheritStyle(parent.style, parentDepth + 1),
      };
      newNodeId = newNode.id;

      return {
        map: { ...map, branches: appendChild(map.branches, parentId, newNode) as SampleBranch[] },
      };
    });

    return newNodeId;
  },

  addChildNodesBulk: (parentId, texts) => {
    const clean = texts.map((s) => s.trim()).filter(Boolean);
    if (clean.length === 0) return;

    set((state) => {
      const map = state.map;
      const pid = !parentId || parentId === 'root' ? 'root' : parentId;

      // Add under root → each becomes a branch.
      if (pid === 'root') {
        let branches = map.branches;
        clean.forEach((text) => {
          const branch = makeBranch(
            { ...createNewNode(), text, style: inheritStyle(map.root.style, 1) },
            branches.length,
          );
          branches = [...branches, branch];
        });
        return { map: { ...map, branches: branches as SampleBranch[] } };
      }

      const parent = findNode(map.branches, pid);
      if (!parent) return {};
      const parentDepth = getNodeDepth(map, pid);
      if (parentDepth + 1 > MAX_DEPTH) return {};

      const newChildren = clean.map((text) => ({
        ...createNewNode(),
        text,
        colorKey: inheritColorKey(parent),
        style: inheritStyle(parent.style, parentDepth + 1),
      }));

      const branches = updateNodeById(map.branches, pid, (p) => ({
        ...p,
        children: [...(p.children ?? []), ...newChildren],
      })) as SampleBranch[];

      return { map: { ...map, branches } };
    });
  },

  appendChildren: (nodeId, children) => {
    if (!children.length) return;
    set((state) => {
      const map = state.map;
      const pid = !nodeId || nodeId === 'root' ? 'root' : nodeId;

      // 루트 아래 → 각 최상위 노드를 브랜치로 (색 순환)
      if (pid === 'root') {
        let branches = map.branches as MindNode[];
        children.forEach((c) => {
          branches = [
            ...branches,
            makeBranch({ ...c, style: c.style ?? inheritStyle(map.root.style, 1) }, branches.length),
          ];
        });
        return { map: { ...map, branches: branches as SampleBranch[] } };
      }

      const parent = findNode(map.branches, pid);
      if (!parent) return {};
      const parentDepth = getNodeDepth(map, pid);
      // 삽입되는 최상위 자식은 부모 색/스타일을 상속(하위는 파싱값 유지)
      const prepared = children.map((c) => ({
        ...c,
        colorKey: c.colorKey ?? inheritColorKey(parent),
        style: c.style ?? inheritStyle(parent.style, parentDepth + 1),
      }));
      const branches = updateNodeById(map.branches, pid, (p) => ({
        ...p,
        collapsed: undefined, // 새 자식이 보이도록 펼침
        children: [...(p.children ?? []), ...prepared],
      })) as SampleBranch[];
      return { map: { ...map, branches } };
    });
  },

  addSiblingNode: (nodeId, position = 'after') => {
    let newNodeId = '';

    set((state) => {
      const map = state.map;
      if (!nodeId || nodeId === 'root') return {};

      const parentId = findParentId(map, nodeId);
      if (!parentId) return {};

      const depth = getNodeDepth(map, nodeId);
      if (depth > MAX_DEPTH) return {};

      // Sibling of a branch → another branch (inherit the reference branch's style).
      if (parentId === 'root') {
        const refBranch = findNode(map.branches, nodeId);
        const newNode = createNewNode();
        newNodeId = newNode.id;
        const branch = makeBranch(
          { ...newNode, colorKey: inheritColorKey(refBranch), style: inheritStyle(refBranch?.style, 1) },
          map.branches.length,
        );
        return {
          map: { ...map, branches: insertSibling(map.branches, nodeId, branch, position) as SampleBranch[] },
        };
      }

      // Inherit the SELECTED (reference) node's style, not the parent's, so a
      // new sibling looks like the node it was created from (minus level font).
      const reference = findNode(map.branches, nodeId);
      const newNode: MindNode = {
        ...createNewNode(),
        colorKey: inheritColorKey(reference),
        style: inheritStyle(reference?.style, depth),
      };
      newNodeId = newNode.id;

      return {
        map: { ...map, branches: insertSibling(map.branches, nodeId, newNode, position) as SampleBranch[] },
      };
    });

    return newNodeId;
  },

  // Inserts a new node BETWEEN nodeId and its current parent: nodeId becomes a
  // child of the new node, which takes nodeId's old slot. ("상위 노드 추가")
  addParentNode: (nodeId) => {
    let newNodeId = '';

    set((state) => {
      const map = state.map;
      if (!nodeId || nodeId === 'root') return {};

      const target = findNode(map.branches, nodeId);
      if (!target) return {};

      const depth = getNodeDepth(map, nodeId);
      // wrapping pushes target's whole subtree one level deeper
      if (depth + 1 + subtreeHeight(target) > MAX_DEPTH) return {};

      const parentId = findParentId(map, nodeId);
      const newNode: MindNode = {
        ...createNewNode(),
        colorKey: inheritColorKey(target),
        style: inheritStyle(target.style, depth),
      };
      newNodeId = newNode.id;

      // Wrapping a top-level branch: the new node becomes the branch.
      if (parentId === 'root') {
        const idx = map.branches.findIndex((b) => b.id === nodeId);
        const wrapped = makeBranch({ ...newNode, children: [target] }, idx);
        wrapped.side = target.side === 'left' || target.side === 'right' ? target.side : wrapped.side;
        wrapped.colorKey = (target.colorKey as NodeColorKey) ?? wrapped.colorKey;
        return {
          map: {
            ...map,
            branches: map.branches.map((b) => (b.id === nodeId ? wrapped : b)) as SampleBranch[],
          },
        };
      }

      const branches = updateNodeById(map.branches, parentId!, (p) => ({
        ...p,
        children: (p.children ?? []).map((c) =>
          c.id === nodeId ? { ...newNode, children: [c] } : c,
        ),
      })) as SampleBranch[];

      return { map: { ...map, branches } };
    });

    return newNodeId;
  },

  deleteNode: (nodeId) => {
    if (!nodeId || nodeId === 'root') return; // root is protected
    set((state) => ({
      map: {
        ...state.map,
        branches: deleteNodeRecursive(state.map.branches, nodeId) as SampleBranch[],
      },
    }));
  },

  deleteNodesBulk: (nodeIds) => {
    const ids = (nodeIds ?? []).filter((id) => id && id !== 'root');
    if (!ids.length) return;
    set((state) => {
      let branches = state.map.branches;
      for (const id of ids) {
        branches = deleteNodeRecursive(branches, id) as SampleBranch[];
      }
      return { map: { ...state.map, branches } };
    });
  },

  moveNode: (nodeId, newParentId) => {
    let ok = false;

    set((state) => {
      const map = state.map;
      if (!nodeId || nodeId === 'root') return {}; // root can't move
      if (!newParentId) return {};
      if (nodeId === newParentId) return {};

      const moving = findNode(map.branches, nodeId);
      if (!moving) return {};

      // Can't drop a node into itself or one of its own descendants.
      if (isSelfOrDescendant(moving, newParentId)) return {};

      // No-op if already a direct child of the target.
      if (findParentId(map, nodeId) === newParentId) return {};

      // Depth guard for the whole moved subtree.
      const newParentDepth = getNodeDepth(map, newParentId);
      if (newParentDepth + 1 + subtreeHeight(moving) > MAX_DEPTH) return {};

      const { nodes: pruned, removed } = extractNode(map.branches, nodeId);
      if (!removed) return {};

      if (newParentId === 'root') {
        const branch = makeBranch(removed, pruned.length);
        ok = true;
        return { map: { ...map, branches: [...(pruned as SampleBranch[]), branch] } };
      }

      ok = true;
      return {
        map: { ...map, branches: appendChild(pruned, newParentId, removed) as SampleBranch[] },
      };
    });

    return ok;
  },

  moveNodeRelative: (nodeId, targetId, position) => {
    let ok = false;

    set((state) => {
      const map = state.map;
      if (!nodeId || nodeId === 'root' || !targetId) return {};
      if (nodeId === targetId) return {};

      const moving = findNode(map.branches, nodeId);
      if (!moving) return {};
      if (isSelfOrDescendant(moving, targetId)) return {}; // can't drop into own subtree

      const hMoving = subtreeHeight(moving);

      // --- become a CHILD of target ---
      if (position === 'child') {
        if (targetId !== 'root') {
          const tDepth = getNodeDepth(map, targetId);
          if (tDepth < 0 || tDepth + 1 + hMoving > MAX_DEPTH) return {};
        }
        const { nodes: pruned, removed } = extractNode(map.branches, nodeId);
        if (!removed) return {};
        if (targetId === 'root') {
          ok = true;
          return { map: { ...map, branches: [...(pruned as SampleBranch[]), makeBranch(removed, pruned.length)] } };
        }
        ok = true;
        return { map: { ...map, branches: appendChild(pruned, targetId, removed) as SampleBranch[] } };
      }

      // --- become a SIBLING before/after target ---
      if (position === 'before' || position === 'after') {
        if (targetId === 'root') return {};
        const tParent = findParentId(map, targetId);
        if (!tParent) return {};
        const tDepth = getNodeDepth(map, targetId);
        if (tDepth + hMoving > MAX_DEPTH) return {};

        const { nodes: pruned, removed } = extractNode(map.branches, nodeId);
        if (!removed) return {};

        if (tParent === 'root') {
          const branch = makeBranch(removed, pruned.length);
          // 형제로 붙는 대상 브랜치의 side를 따라간다 — 방사형·양쪽에서
          // 왼쪽 브랜치의 상/하 드롭존에 놓으면 왼쪽으로 이동해야 한다.
          // (side를 그대로 두면 배열 순서만 바뀌고 반대쪽에 그려져
          // "이동이 안 된 것"처럼 보인다)
          const tgt = map.branches.find((b) => b.id === targetId);
          if (tgt && (tgt.side === 'left' || tgt.side === 'right')) {
            branch.side = tgt.side;
          }
          ok = true;
          return { map: { ...map, branches: insertSibling(pruned, targetId, branch, position) as SampleBranch[] } };
        }
        ok = true;
        return { map: { ...map, branches: insertSibling(pruned, targetId, removed, position) as SampleBranch[] } };
      }

      // --- become the PARENT of target (target moves under moving) ---
      if (position === 'parent') {
        if (targetId === 'root') return {};
        const target = findNode(map.branches, targetId);
        if (!target) return {};
        const tParent = findParentId(map, targetId);
        if (!tParent) return {};
        const tDepth = getNodeDepth(map, targetId);
        const hT = subtreeHeight(target);
        if (tDepth + 1 + Math.max(hMoving, hT) > MAX_DEPTH) return {};

        // Remove the moving node, then the target, then nest target under moving.
        const ex1 = extractNode(map.branches, nodeId);
        if (!ex1.removed) return {};
        const ex2 = extractNode(ex1.nodes, targetId);
        if (!ex2.removed) return {};

        const newParent: MindNode = {
          ...ex1.removed,
          children: [...(ex1.removed.children ?? []), ex2.removed],
        };

        if (tParent === 'root') {
          const branch = makeBranch(newParent, ex2.nodes.length);
          branch.side = target.side === 'left' || target.side === 'right' ? target.side : branch.side;
          branch.colorKey = (target.colorKey as NodeColorKey) ?? branch.colorKey;
          ok = true;
          return { map: { ...map, branches: [...(ex2.nodes as SampleBranch[]), branch] } };
        }
        ok = true;
        return { map: { ...map, branches: appendChild(ex2.nodes, tParent, newParent) as SampleBranch[] } };
      }

      return {};
    });

    return ok;
  },

  toggleCollapse: (nodeId) => {
    if (!nodeId || nodeId === 'root') return; // root can't collapse
    asViewOnly(() => set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({ ...n, collapsed: !n.collapsed })),
    })));
  },

  setCollapsed: (nodeId, collapsed) => {
    if (!nodeId || nodeId === 'root') return;
    asViewOnly(() => set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({ ...n, collapsed })),
    })));
  },

  collapseAll: () => {
    const walk = (nodes: MindNode[]): MindNode[] =>
      nodes.map((n) => ({
        ...n,
        collapsed: (n.children?.length ?? 0) > 0 ? true : n.collapsed,
        children: walk(n.children ?? []),
      }));
    asViewOnly(() => set((state) => ({
      map: { ...state.map, branches: walk(state.map.branches) as SampleBranch[] },
    })));
  },

  expandAll: () => {
    const walk = (nodes: MindNode[]): MindNode[] =>
      nodes.map((n) => ({
        ...n,
        collapsed: undefined,
        children: walk(n.children ?? []),
      }));
    asViewOnly(() => set((state) => ({
      map: { ...state.map, branches: walk(state.map.branches) as SampleBranch[] },
    })));
  },

  // 해당 노드가 화면에 보이도록 접힌 조상들만 펼친다 (검색 결과 이동 —
  // 뷰어 expandTo와 동일 동작). 노드 자체의 접힘 상태는 건드리지 않는다.
  expandAncestors: (nodeId) => {
    if (!nodeId || nodeId === 'root') return;
    const walk = (nodes: MindNode[]): [MindNode[], boolean] => {
      let found = false;
      const next = nodes.map((n) => {
        if (n.id === nodeId) { found = true; return n; }
        const [kids, hit] = walk(n.children ?? []);
        if (!hit) return n;
        found = true;
        return { ...n, collapsed: undefined, children: kids };
      });
      return [next, found];
    };
    asViewOnly(() => set((state) => ({
      map: { ...state.map, branches: walk(state.map.branches)[0] as SampleBranch[] },
    })));
  },

  updateNodeText: (nodeId, text) => {
    // **빈 텍스트도 반영한다.** 예전에는 빈 문자열이면 통째로 무시했다 —
    // 노드 글자를 전부 선택해 Del/Ctrl+X 로 지우고 Enter 를 쳐도 지운
    // 글자가 되살아나, 사용자에게는 "지워지지 않는다"로 보였다
    // (2026-08-05 보고. 편집창 쪽 같은 가드와 한 쌍이었다).
    // 노드를 없애는 것이 아니라 **내용을 비우는** 조작이다 — 노드 자체는
    // 선택 상태에서 Del 로 지운다.
    const nextText = text.trim();
    if (!nodeId) return;
    set((state) => ({ map: mutateNode(state.map, nodeId, (n) => ({ ...n, text: nextText })) }));
  },

  updateNodeTextAlign: (nodeId, textAlign) => {
    if (!nodeId) return;
    set((state) => ({ map: mutateNode(state.map, nodeId, (n) => ({ ...n, textAlign })) }));
  },

  updateNodeLayoutType: (nodeId, layoutType) => {
    if (!nodeId) return;

    set((state) => {
      const map = state.map;

      if (nodeId === 'root') {
        return {
          map: {
            ...map,
            root: { ...map.root, layoutType },
            // Whole-map layout change resets every per-node override —
            // 맵 설정의 레벨별 레이아웃 선택도 함께 초기화한다.
            branches: clearLayoutTypeRecursive(map.branches) as SampleBranch[],
            settings: map.settings
              ? { ...map.settings, levelLayouts: undefined }
              : map.settings,
          },
        };
      }

      return {
        map: mutateNode(map, nodeId, (n) => ({
          ...n,
          layoutType,
          edgeType: resolveEdgeType(layoutType),
          children: clearLayoutTypeRecursive(n.children ?? []),
        })),
      };
    });
  },

  setLevelShape: (level, shape) => {
    if (level < 0 || level > 4) return;
    set((state) => {
      const prev = state.map.settings?.levelShapes ?? [];
      const next = [...prev];
      for (let i = 0; i < 5; i++) if (next[i] === undefined) next[i] = null;
      next[level] = shape;
      return {
        map: {
          ...state.map,
          settings: { ...state.map.settings, levelShapes: next },
        },
      };
    });
  },

  setNoteFont: (patch) => {
    set((state) => ({
      map: {
        ...state.map,
        settings: {
          ...state.map.settings,
          noteFont: { ...state.map.settings?.noteFont, ...patch },
        },
      },
    }));
  },

  updateLevelFont: (level, patch) => {
    if (level < 0 || level > 4) return;
    set((state) => {
      const prev = state.map.settings?.levelFonts ?? [];
      const next: LevelFontSetting[] = [];
      for (let i = 0; i < 5; i++) next[i] = { ...prev[i] };
      next[level] = { ...next[level], ...patch };
      return {
        map: {
          ...state.map,
          settings: { ...state.map.settings, levelFonts: next },
        },
      };
    });
  },

  resetLevelFonts: () => {
    set((state) => ({
      map: {
        ...state.map,
        settings: { ...state.map.settings, levelFonts: undefined },
      },
    }));
  },

  setLevelLayout: (level, layoutType) => {
    if (level < 1 || level > 4) return; // 0=Root는 맵 전체 레이아웃(레이아웃 탭)
    set((state) => {
      // 해당 레벨(4는 depth 4 이상 전부)의 모든 노드에 일괄 적용/해제.
      // 개별 노드의 기존 서브트리 오버라이드는 이 레벨에 한해 덮어쓴다.
      const applyAtDepth = (nodes: MindNode[], depth: number): MindNode[] =>
        nodes.map((n) => {
          const match = level === 4 ? depth >= 4 : depth === level;
          const next: MindNode = {
            ...n,
            children: applyAtDepth(n.children ?? [], depth + 1),
          };
          if (match) {
            next.layoutType = layoutType ?? undefined;
            next.edgeType = layoutType ? resolveEdgeType(layoutType) : undefined;
          }
          return next;
        });

      const prev = state.map.settings?.levelLayouts ?? [];
      const nextLayouts: (LayoutType | null | undefined)[] = [...prev];
      while (nextLayouts.length < 5) nextLayouts.push(undefined);
      nextLayouts[level] = layoutType ?? undefined;

      return {
        map: {
          ...state.map,
          branches: applyAtDepth(state.map.branches, 1) as SampleBranch[],
          settings: { ...state.map.settings, levelLayouts: nextLayouts },
        },
      };
    });
  },

  loadMap: (map, opts) => {
    // 문서 경계를 넘는 되돌리기 금지 — 열기/불러오기는 여기서 끊는다.
    // (템플릿 적용처럼 "같은 문서를 바꾸는" 경우는 그대로 되돌아간다)
    const apply = () => {
      set({ map: cloneMap(map) });
      // 출처 갱신 — 기본은 '출처 없음'(서버 맵과 무관한 새 문서)
      if (!opts?.keepOrigin) set({ docOrigin: opts?.serverMapId ?? null });
    };
    if (opts?.resetHistory) asDocumentSwap(apply);
    else apply();
  },

  // 서버에 저장한 맵 이름과 문서 제목을 맞춘다 (2026-08-02 문서함).
  // 내용 변경이 아니므로 undo 히스토리에는 남기지 않는다.
  setMapTitle: (title) => {
    set((state) => (state.map.title === title
      ? state
      : { map: { ...state.map, title } }));
  },

  // 맵 닫기 (B7) — 문서를 비운 상태. 골격(주제 1~3)을 만드는 newMap 과
  // 달리 중심 주제 하나만 남겨, "지금 열린 문서가 없다"를 화면으로도
  // 드러낸다. **되돌리기로는 되살아나지 않는다** (2026-08-06) — 문서
  // 경계를 넘는 되돌리기가 "정체불명의 맵"을 불러왔기 때문. 닫기 전에
  // 저장되므로 문서함에서 다시 열면 된다.
  clearHistory: () => {
    set({ past: [], future: [] });
  },

  closeMap: () => asDocumentSwap(() => {
    set({
      docOrigin: null,
      map: {
        title: EMPTY_MAP_TITLE,
        root: { id: 'root', text: EMPTY_MAP_TITLE, colorKey: 'root', side: 'center' },
        branches: [],
      },
    });
  }),

  newMap: (title = NEW_MAP_TITLE) => {
    // 새 문서 = 서버 맵 출처 없음 (자동저장이 이전 맵을 덮어쓰지 못한다)
    // 기본 맵 골격 = '트리-진행트리맵' 기본 템플릿.
    // 2026-08-04 축소(사용자 지정 이미지 기준, 11노드): 주제 1·2 =
    // 하위 주제 1개 + 내용 2개, 주제 3 = 하위 주제 1개 — 골격이 너무
    // 커서 지우는 일부터 하게 되던 문제.
    // 레벨별 레이아웃: 1레벨 트리·오른쪽(맵 전체 = NewMapPanel에서 설정) →
    // 2레벨 진행트리·오른쪽 → 3레벨 트리·오른쪽 → 4레벨 진행트리·오른쪽
    // (노드의 layoutType = 그 노드의 "자식" 배치 방식)
    const colorKeys: NodeColorKey[] = ['l1A', 'l1B', 'l1C'];
    const now = Date.now();
    const branches: SampleBranch[] = [0, 1, 2].map((i) => ({
      id: `n-${now}-${i}`,
      text: `주제 ${i + 1}`,
      colorKey: colorKeys[i],
      side: 'right' as const,
      layoutType: 'process-tree-right' as const,
      children: [{
        id: `n-${now}-${i}-0`,
        text: '하위 주제',
        layoutType: 'tree-right' as const,
        // 주제 3은 하위 주제까지만 (이미지 기준)
        children: i === 2 ? undefined : [0, 1].map((k) => ({
          id: `n-${now}-${i}-0-${k}`,
          text: '내용',
          layoutType: 'process-tree-right' as const,
        })),
      }],
    }));
    asDocumentSwap(() => set({
      docOrigin: null,
      map: {
        title,
        root: { id: 'root', text: '중심 주제', colorKey: 'root', side: 'center' },
        branches,
      },
    }));
  },

  updateNodeSize: (nodeId, size) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        sizeW: size?.w ? Math.max(90, Math.min(900, Math.round(size.w))) : undefined,
        sizeH: size?.h ? Math.max(36, Math.min(1200, Math.round(size.h))) : undefined,
      })),
    }));
  },

  setNodeImage: (nodeId, image) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({ ...n, image })),
    }));
  },

  setNodeImages: (nodeId, images) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        images: images && images.length ? images : undefined,
      })),
    }));
  },

  updateNodeStyle: (nodeId, style) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        style: { ...n.style, ...style },
      })),
    }));
  },

  updateNodesStyle: (nodeIds, style) => {
    if (!nodeIds.length) return;
    // set() 한 번 = undo 한 단계 (노드마다 히스토리가 쌓이지 않게)
    set((state) => ({
      map: nodeIds.reduce(
        (m, id) => mutateNode(m, id, (n) => ({ ...n, style: { ...n.style, ...style } })),
        state.map,
      ),
    }));
  },

  updateNodesTextAlign: (nodeIds, textAlign) => {
    if (!nodeIds.length) return;
    set((state) => ({
      map: nodeIds.reduce((m, id) => mutateNode(m, id, (n) => ({ ...n, textAlign })), state.map),
    }));
  },

  setBranchSide: (branchId, side) => {
    if (!branchId) return;
    set((state) => {
      const map = state.map;
      if (!map.branches.some((b) => b.id === branchId)) return {}; // 루트 직계만
      return {
        map: {
          ...map,
          branches: map.branches.map((b) => (b.id === branchId ? { ...b, side } : b)),
        },
      };
    });
  },

  setNodeIcon: (nodeId, icon) => {
    if (!nodeId) return;
    set((state) => ({ map: mutateNode(state.map, nodeId, (n) => ({ ...n, icon })) }));
  },

  setNodeIconSide: (nodeId, iconSide) => {
    if (!nodeId) return;
    set((state) => ({ map: mutateNode(state.map, nodeId, (n) => ({ ...n, iconSide })) }));
  },

  addNodeTag: (nodeId, tag) => {
    const clean = tag.trim();
    if (!nodeId || !clean) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => {
        const tags = n.tags ?? (n.tag ? [n.tag] : []);
        if (tags.includes(clean)) return n;
        return { ...n, tag: undefined, tags: [...tags, clean] };
      }),
    }));
  },

  removeNodeTag: (nodeId, tag) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => {
        const tags = (n.tags ?? (n.tag ? [n.tag] : [])).filter((x) => x !== tag);
        return { ...n, tag: undefined, tags };
      }),
    }));
  },

  addNodeLink: (nodeId, url, label) => {
    const clean = url.trim();
    if (!nodeId || !clean) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        links: [...(n.links ?? []), { id: createSubId('link'), url: clean, label }],
      })),
    }));
  },

  removeNodeLink: (nodeId, linkId) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        links: (n.links ?? []).filter((l) => l.id !== linkId),
      })),
    }));
  },

  addNoteBlock: (nodeId, type, text = '', extra, afterBlockId) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => {
        const prev = n.notes ?? [];
        const block: NoteBlock = {
          id: createSubId('note'),
          type,
          text,
          ...(type === 'checklist' ? { checked: false } : {}),
          ...(extra ?? {}),
        };
        // afterBlockId가 있으면 그 바로 뒤에 삽입 — 없으면(또는 못 찾으면) 맨 뒤
        const at = afterBlockId ? prev.findIndex((b) => b.id === afterBlockId) : -1;
        const notes = at >= 0
          ? [...prev.slice(0, at + 1), block, ...prev.slice(at + 1)]
          : [...prev, block];
        return { ...n, note: true, notes };
      }),
    }));
  },

  updateNoteBlock: (nodeId, blockId, patch) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        notes: (n.notes ?? []).map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
      })),
    }));
  },

  removeNoteBlock: (nodeId, blockId) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => {
        const notes = (n.notes ?? []).filter((b) => b.id !== blockId);
        return { ...n, notes, note: notes.length > 0 ? n.note : false };
      }),
    }));
  },

  addNodeAttachment: (nodeId, attachment) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        attachments: [...(n.attachments ?? []), { id: createSubId('att'), ...attachment }],
      })),
    }));
  },

  removeNodeAttachment: (nodeId, attachmentId) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        attachments: (n.attachments ?? []).filter((a) => a.id !== attachmentId),
      })),
    }));
  },
}));

// Record every `map` mutation (that isn't an undo/redo) into the history so the
// toolbar / Ctrl+Z / Ctrl+Y can step through document states. In-memory only.
useDocumentStore.subscribe((state, prev) => {
  if (applyingHistory || historyPaused) return;
  // 접기/펴기 같은 **보기 전용** 변경은 되돌리기에 쌓지 않는다 (2026-08-06)
  if (viewOnlyChange) return;
  // 문서를 통째로 바꾸는 전환도 쌓지 않는다 — 되돌리기는 문서 경계를
  // 넘지 않는다 (asDocumentSwap)
  if (swappingDocument) return;
  if (state.map !== prev.map) {
    // 스냅샷의 레이아웃 = "prev.map이 화면에 있던 동안"의 레이아웃.
    // 맵과 레이아웃을 한 동작에서 함께 바꾸는 곳(레이아웃 탭·맵 설정)은
    // 반드시 맵을 먼저 바꾼 뒤 setLayoutType을 불러야 한다.
    const layout = useEditorUiStore.getState().layoutType;
    useDocumentStore.setState((s) => ({
      past: [...s.past, { map: prev.map, layout }].slice(-HISTORY_LIMIT),
      future: [],
    }));
  }
});
