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
import { SAMPLE_ROADMAP, SAMPLE_META, SAMPLE_KANBAN } from '@/editor/__samples__';
import type {
  SampleMap,
  SampleRoot,
  SampleBranch,
  MindNode,
  KanbanBoardData,
  NodeColorKey,
  NodeStyle,
  NodeLink,
  NoteBlock,
  NoteBlockType,
  NodeAttachment,
  LevelFontSetting,
} from '@/editor/__samples__/types';
import type { TextAlign, LayoutType, EdgeType } from '@/types/mindmap';

type SampleKey = 'roadmap' | 'meta';

// ltree physical limit operating cap (chk_nodes_depth). Root is depth 0.
export const MAX_DEPTH = 50;

const BRANCH_COLOR_KEYS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

// Undo/redo history: max snapshots, and a guard so undo/redo themselves aren't
// recorded as new history entries.
const HISTORY_LIMIT = 100;
let applyingHistory = false;

interface DocumentState {
  map: SampleMap;
  kanban: KanbanBoardData;

  // Undo / redo history (in-memory — no DB required)
  past: SampleMap[];
  future: SampleMap[];
  undo: () => void;
  redo: () => void;

  setSample: (key: SampleKey) => void;

  // Structure
  addChildNode: (parentId: string | null) => string;
  addChildNodesBulk: (parentId: string | null, texts: string[]) => void;
  addSiblingNode: (nodeId: string | null, position?: 'before' | 'after') => string;
  addParentNode: (nodeId: string | null) => string;
  deleteNode: (nodeId: string | null) => void;
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

  // 현재 맵 전체 교체 (템플릿 적용 등 — undo 히스토리에 기록됨)
  loadMap: (map: SampleMap) => void;

  // Style / icon
  updateNodeStyle: (nodeId: string | null, style: Partial<NodeStyle>) => void;
  setNodeIcon: (nodeId: string | null, icon: string | undefined) => void;
  setNodeIconSide: (nodeId: string | null, iconSide: 'left' | 'right') => void;

  // Tags
  addNodeTag: (nodeId: string | null, tag: string) => void;
  removeNodeTag: (nodeId: string | null, tag: string) => void;

  // Links
  addNodeLink: (nodeId: string | null, url: string, label?: string) => void;
  removeNodeLink: (nodeId: string | null, linkId: string) => void;

  // Notes (structured blocks)
  addNoteBlock: (nodeId: string | null, type: NoteBlockType, text?: string) => void;
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
    textAlign: node.textAlign ?? 'left',
    edgeType: withEdge.edgeType ?? resolveEdgeType(node.layoutType ?? 'radial'),
    children: node.children ? node.children.map((child) => normalizeNode(child)) : [],
  } as T;
}

function cloneMap(map: SampleMap): SampleMap {
  return {
    ...map,
    root: {
      ...map.root,
      textAlign: map.root.textAlign ?? 'left',
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

export const useDocumentStore = create<DocumentState>((set, get) => ({
  map: cloneMap(SAMPLE_ROADMAP),
  kanban: SAMPLE_KANBAN,
  past: [],
  future: [],

  undo: () => {
    const { past, map, future } = get();
    if (past.length === 0) return;
    applyingHistory = true;
    set({
      map: past[past.length - 1],
      past: past.slice(0, -1),
      future: [map, ...future].slice(0, HISTORY_LIMIT),
    });
    applyingHistory = false;
  },

  redo: () => {
    const { future, map, past } = get();
    if (future.length === 0) return;
    applyingHistory = true;
    set({
      map: future[0],
      future: future.slice(1),
      past: [...past, map].slice(-HISTORY_LIMIT),
    });
    applyingHistory = false;
  },

  setSample: (key) =>
    set({ map: cloneMap(key === 'meta' ? SAMPLE_META : SAMPLE_ROADMAP) }),

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
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({ ...n, collapsed: !n.collapsed })),
    }));
  },

  setCollapsed: (nodeId, collapsed) => {
    if (!nodeId || nodeId === 'root') return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({ ...n, collapsed })),
    }));
  },

  updateNodeText: (nodeId, text) => {
    const nextText = text.trim();
    if (!nodeId || !nextText) return;
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

  loadMap: (map) => {
    set({ map: cloneMap(map) });
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

  addNoteBlock: (nodeId, type, text = '') => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        note: true,
        notes: [
          ...(n.notes ?? []),
          {
            id: createSubId('note'),
            type,
            text,
            ...(type === 'checklist' ? { checked: false } : {}),
          },
        ],
      })),
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
  if (applyingHistory) return;
  if (state.map !== prev.map) {
    useDocumentStore.setState((s) => ({
      past: [...s.past, prev.map].slice(-HISTORY_LIMIT),
      future: [],
    }));
  }
});
