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

// --- Node style (spec NODE_STYLE / NS-01..NS-05) ---------------------------
export type ShapeType =
  | 'rounded'
  | 'rectangle'
  | 'pill'
  | 'ellipse'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram';

export type NodeFontWeight = 'normal' | 'bold';
export type NodeFontStyle = 'normal' | 'italic';
export type NodeBorderStyle = 'solid' | 'dashed' | 'dotted';

export interface NodeStyle {
  fillColor?: string;
  borderColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: NodeFontWeight;
  fontStyle?: NodeFontStyle;
  borderWidth?: number;
  borderStyle?: NodeBorderStyle;
  shapeType?: ShapeType;
}

// --- Node content (links / notes / attachments) ----------------------------
export interface NodeLink {
  id: string;
  url: string;
  label?: string;
}

export type NoteBlockType =
  | 'paragraph'
  | 'code_block'
  | 'warning'
  | 'tip'
  | 'checklist';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  text: string;
  checked?: boolean; // checklist items only
}

export type AttachmentKind = 'file' | 'audio' | 'video';

export interface NodeAttachment {
  id: string;
  name: string;
  url?: string;
  kind: AttachmentKind;
}

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

  // Editor-core node metadata
  collapsed?: boolean;
  style?: NodeStyle;
  links?: NodeLink[];
  notes?: NoteBlock[];
  attachments?: NodeAttachment[];

  // Layout-internal: original child count, kept on the pruned node so the
  // canvas can show a collapse/expand toggle even when children are hidden.
  _childCount?: number;

  children?: MindNode[];
}

export interface SampleLeaf extends MindNode {}

export interface SampleBranch extends MindNode {
  colorKey: NodeColorKey;
  side: 'left' | 'right';
  icon?: string;
  children?: MindNode[];
}

export interface SampleRoot {
  id: 'root';
  text: string;
  colorKey: 'root';
  side?: 'center';

  textAlign?: TextAlign;
  layoutType?: LayoutType;

  // Root may carry the same content metadata as any node (it can't be moved,
  // deleted or collapsed, but it can have style / tags / notes / links).
  icon?: string;
  tag?: string;
  tags?: string[];
  note?: boolean;
  style?: NodeStyle;
  links?: NodeLink[];
  notes?: NoteBlock[];
  attachments?: NodeAttachment[];
  _childCount?: number;
}

export interface SampleMap {
  title: string;
  root: SampleRoot;
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