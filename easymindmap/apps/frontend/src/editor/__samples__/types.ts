// Types used across the demo samples.
// These are intentionally lightweight — production code will use the canonical
// NodeObject / Map types from `domain-models.md` once the API is wired up.

export type NodeColorKey =
  | 'root'
  | 'l1A' | 'l1B' | 'l1C' | 'l1D' | 'l1E'
  | 'l2';

export type LayoutType =
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

export interface SampleLeaf {
  id: string;
  text: string;
  tag?: string;
  tags?: string[];
  note?: boolean;
  locked?: boolean;
}

export interface SampleBranch {
  id: string;
  text: string;
  colorKey: NodeColorKey;
  side: 'left' | 'right';
  icon?: string;
  children?: SampleLeaf[];
}

export interface SampleMap {
  title: string;
  root: { id: 'root'; text: string; colorKey: 'root'; side?: 'center' };
  branches: SampleBranch[];
}

export interface KanbanCard {
  id: string;
  title: string;
  tag: string;
  active?: boolean;
}

export interface KanbanColumn {
  id: string;
  title: string;
  count: number;
  color: string;
  cards: KanbanCard[];
}

export interface KanbanBoardData {
  title: string;
  columns: KanbanColumn[];
}

export interface OutlineNode {
  id: string;
  text: string;
  depth: number;
  expanded?: boolean;
  selected?: boolean;
  children?: OutlineNode[];
}

export type CollabColorKey = 'user1' | 'user2' | 'user3' | 'user4' | 'user5';

export interface Collaborator {
  id: string;
  name: string;
  initial: string;
  colorKey: CollabColorKey;
  role: 'owner' | 'editor' | 'viewer';
  active: boolean;
  editing: string | null;
}
