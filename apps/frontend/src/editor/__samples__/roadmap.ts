import type { SampleMap } from './types';

// "2026 제품 로드맵" — radial-bidirectional default
// Each branch chooses a side ('left' or 'right') for radial layout splitting.
export const SAMPLE_ROADMAP: SampleMap = {
  title: '2026 제품 로드맵',
  root: { id: 'root', text: '2026\n제품 로드맵', colorKey: 'root', side: 'center' },
  branches: [
    {
      id: 'b1', text: 'Q1 · 기반 구축', colorKey: 'l1B', side: 'right', icon: '🧱',
      children: [
        {
          id: 'b1-1', text: '인증 시스템 (Supabase Auth)', tags: ['MVP', 'Auth'],
          children: [
            { id: 'b1-1-1', text: '이메일 / 소셜 로그인' },
            { id: 'b1-1-2', text: '세션 · 권한 관리' },
          ],
        },
        {
          id: 'b1-2', text: '에디터 코어 — 노드 CRUD', tags: ['MVP', 'Core'], note: true,
          children: [
            { id: 'b1-2-1', text: '노드 추가 / 삭제 / 이동' },
            {
              id: 'b1-2-2', text: '실행 취소 · 재실행',
              children: [
                { id: 'b1-2-2-1', text: '히스토리 스택 (depth 4)' },
              ],
            },
          ],
        },
        { id: 'b1-3', text: '자동저장 엔진 (800ms debounce)' },
      ],
    },
    {
      id: 'b2', text: 'Q2 · AI 통합', colorKey: 'l1A', side: 'right', icon: '✨',
      children: [
        {
          id: 'b2-1', text: '프롬프트 → 맵 생성', tags: ['AI', 'MVP'], locked: true,
          children: [
            { id: 'b2-1-1', text: '템플릿 프롬프트 모음' },
            { id: 'b2-1-2', text: '스트리밍 응답 파싱' },
          ],
        },
        { id: 'b2-2', text: '최대 depth 3, 50 노드' },
        { id: 'b2-3', text: '결과 프리뷰 & 수락 플로우' },
      ],
    },
    {
      id: 'b3', text: 'Q3 · 협업 런칭', colorKey: 'l1E', side: 'right', icon: '👥',
      children: [
        { id: 'b3-1', text: '실시간 동시 편집 (Yjs)' },
        { id: 'b3-2', text: 'Soft Lock + 커서 공유' },
      ],
    },
    {
      id: 'b4', text: 'Q4 · 확장 & 공개', colorKey: 'l1C', side: 'left', icon: '🚀',
      children: [
        { id: 'b4-1', text: 'Publish URL + 임베드' },
        { id: 'b4-2', text: 'Markdown / HTML Export', tags: ['Export', 'MVP'] },
        { id: 'b4-3', text: 'Obsidian / Redmine 연동' },
      ],
    },
    {
      id: 'b5', text: '핵심 지표 (KPI)', colorKey: 'l1D', side: 'left', icon: '📊',
      children: [
        { id: 'b5-1', text: 'MAU 10,000' },
        { id: 'b5-2', text: 'Retention D30 ≥ 35%' },
        { id: 'b5-3', text: '맵당 평균 노드 ≥ 40' },
      ],
    },
    {
      id: 'b6', text: '리스크 & 완화', colorKey: 'l1A', side: 'left', icon: '⚠️',
      children: [
        { id: 'b6-1', text: 'LLM 비용 — 캐시 레이어' },
        { id: 'b6-2', text: '대형맵 성능 — 가상화' },
      ],
    },
  ],
};
