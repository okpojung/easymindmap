import type { OutlineNode } from './types';

export const SAMPLE_OUTLINE: OutlineNode[] = [
  { id: 'root', text: '2026 제품 로드맵', depth: 0, expanded: true, children: [
    { id: 'b1', text: 'Q1 · 기반 구축', depth: 1, expanded: true, children: [
      { id: 'b1-1', text: '인증 시스템', depth: 2 },
      { id: 'b1-2', text: '에디터 코어 — 노드 CRUD', depth: 2, selected: true },
      { id: 'b1-3', text: '자동저장 엔진', depth: 2 },
    ]},
    { id: 'b2', text: 'Q2 · AI 통합', depth: 1, expanded: true, children: [
      { id: 'b2-1', text: '프롬프트 → 맵 생성', depth: 2 },
      { id: 'b2-2', text: '최대 depth 3, 50 노드', depth: 2 },
      { id: 'b2-3', text: '결과 프리뷰 & 수락 플로우', depth: 2 },
    ]},
    { id: 'b3', text: 'Q3 · 협업 런칭', depth: 1, expanded: false },
    { id: 'b4', text: 'Q4 · 확장 & 공개', depth: 1, expanded: false },
    { id: 'b5', text: '핵심 지표 (KPI)', depth: 1, expanded: false },
    { id: 'b6', text: '리스크 & 완화', depth: 1, expanded: false },
  ]},
];
