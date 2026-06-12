// Document Store — owns the persisted map document.
// Only this store's data is written to the DB.

import { create } from 'zustand';
import { SAMPLE_ROADMAP, SAMPLE_META, SAMPLE_KANBAN } from '@/editor/__samples__';
import type {
  SampleMap,
  SampleBranch,
  MindNode,
  KanbanBoardData,
} from '@/editor/__samples__/types';
import type { TextAlign, LayoutType, EdgeType } from '@/types/mindmap';

type SampleKey = 'roadmap' | 'meta';

interface DocumentState {
  map: SampleMap;
  kanban: KanbanBoardData;

  setSample: (key: SampleKey) => void;

  addChildNode: (parentId: string | null) => string;
  deleteNode: (nodeId: string | null) => void;

  updateNodeText: (nodeId: string | null, text: string) => void;
  updateNodeTextAlign: (nodeId: string | null, textAlign: TextAlign) => void;
  updateNodeLayoutType: (nodeId: string | null, layoutType: LayoutType) => void;
}

function createNodeId() {
  return `node-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function resolveEdgeType(layoutType: LayoutType): EdgeType {
  if (layoutType === 'radial' || layoutType === 'both-radial') {
    return 'curve-line';
  }

  return 'tree-line';
}

function createNewNode(layoutType: LayoutType): MindNode {
  return {
    id: createNodeId(),
    text: '새 노드',
    textAlign: 'left',
    layoutType,
    edgeType: resolveEdgeType(layoutType),
    children: [],
  } as MindNode;
}

function normalizeNode<T extends MindNode>(node: T): T {
  const layoutType = node.layoutType ?? 'radial';
  const nodeWithOptionalEdgeType = node as T & {
    edgeType?: EdgeType;
  };

  return {
    ...node,
    textAlign: node.textAlign ?? 'left',
    layoutType,
    edgeType: nodeWithOptionalEdgeType.edgeType ?? resolveEdgeType(layoutType),
    children: node.children
      ? node.children.map((child) => normalizeNode(child))
      : [],
  } as T;
}

function cloneNode<T extends MindNode>(node: T): T {
  return normalizeNode(node);
}

function cloneMap(map: SampleMap): SampleMap {
  return {
    ...map,
    root: {
      ...map.root,
      textAlign: map.root.textAlign ?? 'left',
      layoutType: map.root.layoutType ?? 'radial',
    },
    branches: map.branches.map((branch) => cloneNode(branch)),
  };
}

function findNode(nodes: MindNode[], nodeId: string): MindNode | null {
  for (const node of nodes) {
    if (node.id === nodeId) return node;

    const found = findNode(node.children ?? [], nodeId);
    if (found) return found;
  }

  return null;
}

function updateNodeTextRecursive(
  nodes: MindNode[],
  nodeId: string,
  text: string,
): MindNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        text,
      };
    }

    return {
      ...node,
      children: updateNodeTextRecursive(node.children ?? [], nodeId, text),
    };
  });
}

function updateNodeTextAlignRecursive(
  nodes: MindNode[],
  nodeId: string,
  textAlign: TextAlign,
): MindNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        textAlign,
      };
    }

    return {
      ...node,
      children: updateNodeTextAlignRecursive(node.children ?? [], nodeId, textAlign),
    };
  });
}

function updateNodeLayoutTypeRecursive(
  nodes: MindNode[],
  nodeId: string,
  layoutType: LayoutType,
): MindNode[] {
  return nodes.map((node) => {
    if (node.id === nodeId) {
      return {
        ...node,
        layoutType,
        edgeType: resolveEdgeType(layoutType),
      } as MindNode;
    }

    return {
      ...node,
      children: updateNodeLayoutTypeRecursive(node.children ?? [], nodeId, layoutType),
    };
  });
}

function deleteNodeRecursive(nodes: MindNode[], nodeId: string): MindNode[] {
  return nodes
    .filter((node) => node.id !== nodeId)
    .map((node) => ({
      ...node,
      children: deleteNodeRecursive(node.children ?? [], nodeId),
    }));
}

export const useDocumentStore = create<DocumentState>((set) => ({
  map: cloneMap(SAMPLE_ROADMAP),
  kanban: SAMPLE_KANBAN,

  setSample: (key) =>
    set({
      map: cloneMap(key === 'meta' ? SAMPLE_META : SAMPLE_ROADMAP),
    }),

  addChildNode: (parentId) => {
    let newNodeId = '';

    set((state) => {
      const nextMap = cloneMap(state.map);

      if (!parentId || parentId === 'root') {
        const rootLayoutType = nextMap.root.layoutType ?? 'radial';
        const newNode = createNewNode(rootLayoutType);

        const newBranch: SampleBranch = {
          ...newNode,
          colorKey: 'l1A',
          side: nextMap.branches.length % 2 === 0 ? 'right' : 'left',
          icon: '•',
          children: [],
        };

        newNodeId = newNode.id;
        nextMap.branches.push(newBranch);

        return { map: nextMap };
      }

      const parentNode = findNode(nextMap.branches, parentId);

      if (parentNode) {
        const parentLayoutType = parentNode.layoutType ?? 'radial';
        const newNode = createNewNode(parentLayoutType);

        newNodeId = newNode.id;
        parentNode.children = parentNode.children ?? [];
        parentNode.children.push(newNode);
      }

      return { map: nextMap };
    });

    return newNodeId;
  },

  deleteNode: (nodeId) => {
    if (!nodeId || nodeId === 'root') return;

    set((state) => {
      const nextMap = cloneMap(state.map);
      nextMap.branches = deleteNodeRecursive(nextMap.branches, nodeId) as SampleBranch[];
      return { map: nextMap };
    });
  },

  updateNodeText: (nodeId, text) => {
    const nextText = text.trim();
    if (!nodeId || !nextText) return;

    set((state) => {
      const nextMap = cloneMap(state.map);

      if (nodeId === 'root') {
        nextMap.root = {
          ...nextMap.root,
          text: nextText,
        };
        return { map: nextMap };
      }

      nextMap.branches = updateNodeTextRecursive(
        nextMap.branches,
        nodeId,
        nextText,
      ) as SampleBranch[];

      return { map: nextMap };
    });
  },

  updateNodeTextAlign: (nodeId, textAlign) => {
    if (!nodeId) return;

    set((state) => {
      const nextMap = cloneMap(state.map);

      if (nodeId === 'root') {
        nextMap.root = {
          ...nextMap.root,
          textAlign,
        };
        return { map: nextMap };
      }

      nextMap.branches = updateNodeTextAlignRecursive(
        nextMap.branches,
        nodeId,
        textAlign,
      ) as SampleBranch[];

      return { map: nextMap };
    });
  },

  updateNodeLayoutType: (nodeId, layoutType) => {
    if (!nodeId) return;

    set((state) => {
      const nextMap = cloneMap(state.map);

      if (nodeId === 'root') {
        nextMap.root = {
          ...nextMap.root,
          layoutType,
        };

        return { map: nextMap };
      }

      nextMap.branches = updateNodeLayoutTypeRecursive(
        nextMap.branches,
        nodeId,
        layoutType,
      ) as SampleBranch[];

      return { map: nextMap };
    });
  },
}));