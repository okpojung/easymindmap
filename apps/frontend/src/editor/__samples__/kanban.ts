import type { KanbanBoardData } from './types';

export const SAMPLE_KANBAN: KanbanBoardData = {
  title: '2026 제품 로드맵',
  columns: [
    {
      id: 'col-todo', title: '백로그', count: 5, color: '#958A78',
      cards: [
        { id: 'k1', title: 'OAuth 소셜 로그인', tag: 'Auth' },
        { id: 'k2', title: 'WBS 모드 연동', tag: 'V1' },
        { id: 'k3', title: '다크모드 폴리시', tag: 'UI' },
      ],
    },
    {
      id: 'col-doing', title: '진행 중', count: 4, color: '#D97706',
      cards: [
        { id: 'k4', title: '에디터 코어 — 노드 CRUD', tag: 'MVP', active: true },
        { id: 'k5', title: '자동저장 엔진', tag: 'MVP' },
        { id: 'k6', title: 'NodeAddIndicator', tag: 'MVP' },
      ],
    },
    {
      id: 'col-review', title: '리뷰', count: 2, color: '#0284C7',
      cards: [
        { id: 'k7', title: 'Supabase 스키마 RLS', tag: 'DB' },
        { id: 'k8', title: 'Layout 엔진 2-pass', tag: 'Core' },
      ],
    },
    {
      id: 'col-done', title: '완료', count: 3, color: '#15803D',
      cards: [
        { id: 'k9', title: '프로젝트 비전 정의', tag: 'Plan' },
        { id: 'k10', title: 'ERD 설계', tag: 'DB' },
      ],
    },
  ],
};
