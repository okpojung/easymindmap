// Layout engine output types — shared across canvas, edge renderer, node renderer

import type { TextAlign, LayoutType, EdgeType } from '@/types/mindmap';
import type {
  NodeColorKey,
  SampleMap,
  NodeStyle,
  NodeLink,
  NoteBlock,
  NodeAttachment,
  NodeImage,
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
  iconSide?: 'left' | 'right';

  tag?: string;
  tags?: string[];

  note?: boolean;
  locked?: boolean;

  collapsed?: boolean;
  style?: NodeStyle;
  links?: NodeLink[];
  notes?: NoteBlock[];
  attachments?: NodeAttachment[];
  image?: NodeImage; // 노드 안 사진 (텍스트 아래 표시)
  sizeW?: number; // 수동 박스 크기 (우하단 핸들)
  sizeH?: number;

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