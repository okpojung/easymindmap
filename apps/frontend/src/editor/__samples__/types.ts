// Types used across the demo samples.
// These are intentionally lightweight — production code will use the canonical
// NodeObject / Map types from `domain-models.md` once the API is wired up.

import type { LayoutType } from '@/types/mindmap';
export type { LayoutType } from '@/types/mindmap';

export type NodeColorKey =
  | 'root'
  | 'l1A'
  | 'l1B'
  | 'l1C'
  | 'l1D'
  | 'l1E'
  | 'l2';

export type TextAlign = 'left' | 'center' | 'right';

export interface MindNode {
  id: string;
  text: string;

  textAlign?: TextAlign;
  layoutType?: LayoutType;

  colorKey?: NodeColorKey;
  side?: 'left' | 'right' | 'center';

  icon?: string;

  tag?: string;
  tags?: string[];

  note?: boolean;
  locked?: boolean;

  children?: MindNode[];
}

export interface SampleLeaf extends MindNode {}

export interface SampleBranch extends MindNode {
  colorKey: NodeColorKey;
  side: 'left' | 'right';
  icon?: string;
  children?: MindNode[];
}

export interface SampleMap {
  title: string;
  root: {
    id: 'root';
    text: string;
    colorKey: 'root';
    side?: 'center';

    textAlign?: TextAlign;
    layoutType?: LayoutType;
  };
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