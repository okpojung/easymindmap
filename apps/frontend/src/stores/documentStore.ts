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
} from '@/editor/__samples__/types';
import type { TextAlign, LayoutType, EdgeType } from '@/types/mindmap';

type SampleKey = 'roadmap' | 'meta';

// ltree physical limit operating cap (chk_nodes_depth). Root is depth 0.
export const MAX_DEPTH = 50;

const BRANCH_COLOR_KEYS: NodeColorKey[] = ['l1A', 'l1B', 'l1C', 'l1D', 'l1E'];

interface DocumentState {
  map: SampleMap;
  kanban: KanbanBoardData;

  setSample: (key: SampleKey) => void;

  // Structure
  addChildNode: (parentId: string | null) => string;
  addSiblingNode: (nodeId: string | null) => string;
  deleteNode: (nodeId: string | null) => void;
  moveNode: (nodeId: string | null, newParentId: string | null) => boolean;

  // View state
  toggleCollapse: (nodeId: string | null) => void;
  setCollapsed: (nodeId: string | null, collapsed: boolean) => void;

  // Text / align / layout
  updateNodeText: (nodeId: string | null, text: string) => void;
  updateNodeTextAlign: (nodeId: string | null, textAlign: TextAlign) => void;
  updateNodeLayoutType: (nodeId: string | null, layoutType: LayoutType) => void;

  // Style
  updateNodeStyle: (nodeId: string | null, style: Partial<NodeStyle>) => void;

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

function insertSiblingAfter(
  nodes: MindNode[],
  siblingId: string,
  newNode: MindNode,
): MindNode[] {
  // top-level (branch) siblings
  const idx = nodes.findIndex((n) => n.id === siblingId);
  if (idx !== -1) {
    const next = [...nodes];
    next.splice(idx + 1, 0, newNode);
    return next;
  }
  return nodes.map((node) => {
    const children = node.children ?? [];
    if (children.length === 0) return node;
    return { ...node, children: insertSiblingAfter(children, siblingId, newNode) };
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

export const useDocumentStore = create<DocumentState>((set) => ({
  map: cloneMap(SAMPLE_ROADMAP),
  kanban: SAMPLE_KANBAN,

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
        style: inheritStyle(parent.style, parentDepth + 1),
      };
      newNodeId = newNode.id;

      return {
        map: { ...map, branches: appendChild(map.branches, parentId, newNode) as SampleBranch[] },
      };
    });

    return newNodeId;
  },

  addSiblingNode: (nodeId) => {
    let newNodeId = '';

    set((state) => {
      const map = state.map;
      if (!nodeId || nodeId === 'root') return {};

      const parentId = findParentId(map, nodeId);
      if (!parentId) return {};

      const depth = getNodeDepth(map, nodeId);
      if (depth > MAX_DEPTH) return {};

      // Sibling of a branch → another branch.
      if (parentId === 'root') {
        const newNode = createNewNode();
        newNodeId = newNode.id;
        const branch = makeBranch(
          { ...newNode, style: inheritStyle(map.root.style, 1) },
          map.branches.length,
        );
        return {
          map: { ...map, branches: insertSiblingAfter(map.branches, nodeId, branch) as SampleBranch[] },
        };
      }

      const parent = findNode(map.branches, parentId);
      const newNode: MindNode = {
        ...createNewNode(),
        style: inheritStyle(parent?.style, depth),
      };
      newNodeId = newNode.id;

      return {
        map: { ...map, branches: insertSiblingAfter(map.branches, nodeId, newNode) as SampleBranch[] },
      };
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
            // Whole-map layout change resets every per-node override.
            branches: clearLayoutTypeRecursive(map.branches) as SampleBranch[],
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

  updateNodeStyle: (nodeId, style) => {
    if (!nodeId) return;
    set((state) => ({
      map: mutateNode(state.map, nodeId, (n) => ({
        ...n,
        style: { ...n.style, ...style },
      })),
    }));
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
