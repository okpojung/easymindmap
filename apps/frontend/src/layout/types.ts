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
  NodeInlineImage,
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

  side?: 'left' | 'right' | 'down' | 'up' | 'center';

  /**
   * 시간배치에서 이 노드가 맡은 자리 (2026-08-07).
   *   · `'axis'`  — **시간축 위에 놓인 노드** (축의 시작점 바로 다음 단계).
   *                 부모에서 축을 따라 이어지고, 하위는 위/아래로 뻗는다.
   *   · `'stack'` — 그 아래로 세로로 쌓이는 노드 (아웃라인과 같은 모양).
   *
   * **왜 depth 로 안 되나**: 맵 전체에 걸면 축 노드는 depth 1 이지만,
   * **서브트리에 걸면** 고른 노드의 depth+1 이다. depth 로 판정하던
   * 엣지·＋버튼·축 화살표가 서브트리에서 전부 어긋났다(2026-08-07 보고
   * 1~5번). 배치가 정한 역할을 그대로 들고 다니게 한다.
   */
  _timelineRole?: 'axis' | 'stack';

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
  images?: NodeInlineImage[]; // 텍스트 중간 인라인 사진 (원문 위치)
  sizeW?: number; // 수동 박스 크기 (우하단 핸들)
  sizeH?: number;

  // Layout-internal: original child count (children may be hidden when collapsed)
  _childCount?: number;

  textAlign?: TextAlign;
  layoutType?: LayoutType;
  edgeType?: EdgeType;

  _lines?: string[];
  // 수동 줄바꿈 세그먼트 시작 인덱스 — 인라인 마커 상태 이월 리셋 지점
  _manualStarts?: number[];
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