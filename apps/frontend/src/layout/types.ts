// Layout engine output types — shared across canvas, edge renderer, node renderer
import type { LayoutType, NodeColorKey, SampleMap } from '@/editor/__samples__/types';

export interface LaidOutNode {
  id: string;
  text: string;
  x: number; y: number;
  w: number; h: number;
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
  // pre-computed text metrics from sizeNodeForText
  _lines?: string[];
  _fontSize?: number;
  _fontWeight?: number;
  _lineHeight?: number;
}

export type ComputeLayoutFn = (
  sample: SampleMap,
  layoutType: LayoutType,
  CX: number,
  CY: number,
) => LaidOutNode[];
