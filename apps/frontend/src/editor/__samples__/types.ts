// Types used across the app.
//
// 맵 데이터 모델(노드·맵·노트·사진·설정 등)의 단일 원본은 EMM 레퍼런스
// 파서(@easymindmap/emm-parser의 model.ts)다 — 파일 포맷(EMM)과 앱이
// 같은 모델을 쓰도록 여기서 재수출한다 (docs/04-extensions/emm-spec.md).
// 앱 전용 표시 타입(Kanban/Outline/Collaborator)만 이 파일에 남는다.

export type {
  TextAlign,
  LayoutType,
  EdgeType,
  NodeColorKey,
  ShapeType,
  NodeFontWeight,
  NodeFontStyle,
  NodeBorderStyle,
  NodeStyle,
  NodeLink,
  NoteBlockType,
  NoteBlock,
  AttachmentKind,
  NodeImage,
  NodeInlineImage,
  NodeAttachment,
  MindNode,
  SampleLeaf,
  SampleBranch,
  SampleRoot,
  LevelFontSetting,
  MapSettings,
  SampleMap,
  EmmMap,
  EmmNode,
} from '@emm/model';

import type { NodeImage } from '@emm/model';

// --- 앱 전용 표시 타입 ------------------------------------------------------

export interface KanbanCard {
  id: string;
  title: string;
  tag?: string;
  active?: boolean;
  image?: NodeImage; // 노드에 붙여넣은 사진 — 카드 썸네일로 표시
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
