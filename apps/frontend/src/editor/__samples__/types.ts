// Types used across the demo samples.
// These are intentionally lightweight — production code will use the canonical
// NodeObject / Map types from `domain-models.md` once the API is wired up.

import type { LayoutType, EdgeType } from '@/types/mindmap';
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
  strike?: boolean; // 취소선 (텍스트 강조)
  highlight?: boolean; // 형광펜 하이라이트 (텍스트 강조)
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

// 문단 / 코드 / 표 / 체크리스트. ('warning'·'tip'은 v1.1에서 폐기 —
// 기존 데이터는 뷰어·에디터에서 문단으로 렌더링해 하위호환 유지)
export type NoteBlockType =
  | 'paragraph'
  | 'code_block'
  | 'table'
  | 'checklist';

export interface NoteBlock {
  id: string;
  type: NoteBlockType;
  text: string;
  checked?: boolean; // checklist items only
  lang?: string; // code_block only — 표시용 언어 라벨 (Shell, PHP, Node …)
  // paragraph only — 웹 기사 등을 서식·이미지째 붙여넣은 리치 콘텐츠.
  // sanitizeRichHtml()을 통과한 안전한 HTML만 저장되며, text에는 같은
  // 내용의 일반 텍스트를 함께 보관한다 (검색·하위호환용).
  html?: string;
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
  // layoutType과 함께 기록되는 연결선 종류 (resolveEdgeType 결과)
  edgeType?: EdgeType;

  colorKey?: NodeColorKey;
  side?: 'left' | 'right' | 'center';

  icon?: string;
  iconSide?: 'left' | 'right';

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
  iconSide?: 'left' | 'right';
  tag?: string;
  tags?: string[];
  note?: boolean;
  style?: NodeStyle;
  links?: NodeLink[];
  notes?: NoteBlock[];
  attachments?: NodeAttachment[];
  _childCount?: number;
}

// --- 맵 전체 설정 (좌측 상단 '맵 설정' 메뉴) --------------------------------
// 레벨(깊이)별 기본 폰트 — index 0=Root, 1=Level1 … 4=Level4+.
// size를 비우면 기본값(18/14/13…), family를 비우면 시스템 기본 글꼴.
export interface LevelFontSetting {
  size?: number;
  family?: string; // CSS font-family 문자열
}

export interface MapSettings {
  levelFonts?: LevelFontSetting[];
  // 레벨별 레이아웃 — index 1=Level1 … 4=Level4+ (0=Root는 맵 전체
  // 레이아웃이므로 레이아웃 탭에서 관리). 값을 지정하면 해당 레벨의
  // 모든 노드에 서브트리 레이아웃을 일괄 적용하고, null/미지정이면
  // 상위 레이아웃을 따른다.
  levelLayouts?: (LayoutType | null | undefined)[];
}

export interface SampleMap {
  title: string;
  root: SampleRoot;
  branches: SampleBranch[];
  settings?: MapSettings;
}

export interface KanbanCard {
  id: string;
  title: string;
  tag?: string;
  active?: boolean;
  // depth-3+ descendants of the card node, rendered inside the column as an
  // indented tree-right outline under the card (no depth limit for Kanban).
  children?: KanbanCard[];
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