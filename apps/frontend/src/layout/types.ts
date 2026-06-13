// Layout engine output types — shared across canvas, edge renderer, node renderer

import type { TextAlign, LayoutType, EdgeType } from '@/types/mindmap';
import type {
  NodeColorKey,
  SampleMap,
  NodeStyle,
  NodeLink,
  NoteBlock,
  NodeAttachment,
} from '@/editor/__samples__/types';

export interface LaidOutNode {
  id: string;
  text: string;

  x: number;
  y: number;

  w: number;
  h: number;

  depth: number;
  parent: string | null;

  side?: 'left' | 'right' | 'down' | 'center';

  colorKey?: NodeColorKey;
  parentColorKey?: NodeColorKey;

  icon?: string;

  tag?: string;
  tags?: string[];

  note?: boolean;
  locked?: boolean;

  collapsed?: boolean;
  style?: NodeStyle;
  links?: NodeLink[];
  notes?: NoteBlock[];
  attachments?: NodeAttachment[];

  // Layout-internal: original child count (children may be hidden when collapsed)
  _childCount?: number;

  textAlign?: TextAlign;
  layoutType?: LayoutType;
  edgeType?: EdgeType;

  _lines?: string[];
  _fontSize?: number;
  _fontWeight?: number;
  _lineHeight?: number;
}

export interface MindNode {
  id: string;
  text: string;

  colorKey?: NodeColorKey;
  side?: 'left' | 'right' | 'center';

  icon?: string;

  tag?: string;
  tags?: string[];

  note?: boolean;
  locked?: boolean;

  textAlign?: TextAlign;
  layoutType?: LayoutType;
  edgeType?: EdgeType;

  children?: MindNode[];
}

export interface SampleLeaf extends MindNode {}

export interface SampleBranch extends MindNode {
  colorKey: NodeColorKey;
  side: 'left' | 'right';
  icon?: string;
  children?: MindNode[];
}

export type ComputeLayoutFn = (
  sample: SampleMap,
  layoutType: LayoutType,
  CX: number,
  CY: number,
) => LaidOutNode[];