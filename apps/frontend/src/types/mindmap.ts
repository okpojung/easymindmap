export type TextAlign = 'left' | 'center' | 'right';

export type LayoutType =
  // MVP canonical layout names
  | 'tree'
  | 'radial'
  | 'both-radial'
  | 'hierarchy'
  | 'progress-tree'
  | 'free'

  // Legacy/demo layout names currently used by existing UI/layout code
  | 'radial-bidirectional'
  | 'radial-right'
  | 'radial-left'
  | 'tree-up'
  | 'tree-down'
  | 'tree-right'
  | 'tree-left'
  | 'hierarchy-right'
  | 'hierarchy-left'
  | 'process-tree-right'
  | 'process-tree-left'
  | 'process-tree-right-a'
  | 'process-tree-right-b'
  | 'freeform'
  | 'kanban';

export type EdgeType = 'tree-line' | 'curve-line';

export interface MindmapNode {
  id: string;
  parentId: string | null;

  text: string;

  x: number;
  y: number;

  children: string[];

  textAlign: TextAlign;
  layoutType: LayoutType;
  edgeType: EdgeType;
}

export interface MindmapDocument {
  id: string;
  title: string;

  rootNodeId: string;
  nodes: Record<string, MindmapNode>;

  createdAt: string;
  updatedAt: string;
}