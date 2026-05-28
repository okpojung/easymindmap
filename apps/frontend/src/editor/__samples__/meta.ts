import type { SampleMap } from './types';

// "easymindmap MVP 설계" — meta/self-referential sample
export const SAMPLE_META: SampleMap = {
  title: 'easymindmap MVP 설계',
  root: { id: 'root', text: 'easymindmap\nMVP', colorKey: 'root', side: 'center' },
  branches: [
    {
      id: 'b1', text: '에디터 코어', colorKey: 'l1B', side: 'right', icon: '⚙️',
      children: [
        { id: 'b1-1', text: '노드 CRUD · depth ≤ 50', tag: 'MVP' },
        { id: 'b1-2', text: '4방향 인디케이터', tag: 'UX', note: true },
        { id: 'b1-3', text: 'Layout 엔진 2-pass · 15종' },
      ],
    },
    {
      id: 'b2', text: 'AI 생성', colorKey: 'l1A', side: 'right', icon: '✨',
      children: [
        { id: 'b2-1', text: '프롬프트 → Markdown → 트리', locked: true },
        { id: 'b2-2', text: '최대 depth 3 · 50 노드' },
      ],
    },
    {
      id: 'b3', text: '자동 저장', colorKey: 'l1E', side: 'right', icon: '☁️',
      children: [
        { id: 'b3-1', text: '800ms debounce · patch' },
        { id: 'b3-2', text: '실패 시 재시도 큐' },
      ],
    },
    {
      id: 'b4', text: 'Export', colorKey: 'l1C', side: 'left', icon: '📤',
      children: [
        { id: 'b4-1', text: 'Markdown (Basic · Extended)' },
        { id: 'b4-2', text: 'Standalone HTML 뷰어' },
      ],
    },
    {
      id: 'b5', text: '데이터 모델', colorKey: 'l1D', side: 'left', icon: '🗄️',
      children: [
        { id: 'b5-1', text: 'Supabase PostgreSQL 16' },
        { id: 'b5-2', text: 'ltree · RLS 정책' },
      ],
    },
    {
      id: 'b6', text: 'Canvas', colorKey: 'l1A', side: 'left', icon: '🎨',
      children: [
        { id: 'b6-1', text: 'SVG 자체 엔진' },
        { id: 'b6-2', text: 'Pan · Zoom · Fit' },
      ],
    },
  ],
};
