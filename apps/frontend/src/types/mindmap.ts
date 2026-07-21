// TextAlign/LayoutType/EdgeType의 단일 원본은 EMM 레퍼런스 파서
// (@easymindmap/emm-parser model.ts) — 파일 포맷과 앱이 같은 유니언을
// 쓰도록 재수출한다.
export type { TextAlign, LayoutType, EdgeType } from '@emm/model';
import type { TextAlign, LayoutType, EdgeType } from '@emm/model';

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