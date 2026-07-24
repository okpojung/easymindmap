// libraryTemplates — 기본 제공 "템플릿 라이브러리" (실제 적용 가능한 맵).
// 템플릿 패널과 새 맵 패널이 공유한다:
//   · '적용'          — 현재 맵의 내용은 두고 속성만 (applyTemplateStyles)
//   · '이 템플릿으로 시작' — 골격 맵으로 새 맵 시작 (templateSkeletonMap과
//                        동일한 자리 표시 텍스트를 이미 담고 있다)
// [서버 연결 예정] 시스템 관리자가 관리하는 템플릿 카탈로그(templates
// 테이블, is_system=true)로 이관 — docs/02-domain/db-schema.md 참조.

import type { LayoutType, MindNode, SampleBranch, SampleMap } from '@/editor/__samples__/types';

export interface LibraryTemplate {
  id: string;
  name: string;
  desc: string;
  colors: string[]; // 카드 미리보기 띠
  map: SampleMap;
  editor: { layoutType: LayoutType; spacingX?: number; spacingY?: number };
}

// 골격 노드 헬퍼
let seq = 0;
const nid = () => `lib-${seq++}`;
const n = (text: string, children?: MindNode[], layoutType?: LayoutType): MindNode => ({
  id: nid(),
  text,
  ...(layoutType ? { layoutType } : {}),
  ...(children && children.length ? { children } : {}),
});
const br = (
  text: string,
  colorKey: SampleBranch['colorKey'],
  side: 'left' | 'right',
  children?: MindNode[],
  layoutType?: LayoutType,
): SampleBranch => ({
  id: nid(),
  text,
  colorKey,
  side,
  ...(layoutType ? { layoutType } : {}),
  ...(children && children.length ? { children } : {}),
});
const rootOf = (text: string): SampleMap['root'] =>
  ({ id: 'root', text, colorKey: 'root', side: 'center' }) as SampleMap['root'];

// ── 트리-진행트리맵 — 기본 템플릿 (2026-07 지정) ─────────────────────────
// 레벨별 레이아웃: 1레벨(중심) 트리·오른쪽 → 2레벨 진행트리·오른쪽 →
// 3레벨 트리·오른쪽 → 4레벨 진행트리·오른쪽. (노드의 layoutType = 그 노드의
// "자식" 배치 — 맵 전체 기본은 editor.layoutType이 1레벨 몫을 맡는다)
// '새 맵 만들기'의 기본 골격(documentStore.newMap)도 이 구조로 시작한다.
const treeProgressMap = (): SampleMap => ({
  title: '트리-진행트리맵',
  root: rootOf('중심 주제'),
  branches: [
    br('주제 1', 'l1A', 'right', [
      n('하위 주제', [n('내용', undefined, 'process-tree-right'), n('내용', undefined, 'process-tree-right')], 'tree-right'),
      n('하위 주제', [n('내용', undefined, 'process-tree-right')], 'tree-right'),
    ], 'process-tree-right'),
    br('주제 2', 'l1B', 'right', [
      n('하위 주제', [n('내용', undefined, 'process-tree-right'), n('내용', undefined, 'process-tree-right')], 'tree-right'),
      n('하위 주제', [n('내용', undefined, 'process-tree-right')], 'tree-right'),
    ], 'process-tree-right'),
    br('주제 3', 'l1C', 'right', [
      n('하위 주제', [n('내용', undefined, 'process-tree-right')], 'tree-right'),
      n('하위 주제', [n('내용', undefined, 'process-tree-right')], 'tree-right'),
    ], 'process-tree-right'),
  ],
});

// ── 진행트리-트리맵 — 1레벨 진행트리·오른쪽 + 2레벨 트리·오른쪽 ─────────
// ('새 맵 > 기본 맵'과 같은 뼈대를 라이브러리에 상시 제공 — 2026-07 요청)
const progressTreeMap = (): SampleMap => ({
  title: '진행트리-트리맵',
  root: rootOf('중심 주제'),
  branches: [
    br('주제 1', 'l1A', 'right', [
      n('하위 주제', [n('내용'), n('내용')]),
      n('하위 주제', [n('내용'), n('내용')]),
      n('하위 주제'),
    ], 'tree-right'),
    br('주제 2', 'l1B', 'right', [
      n('하위 주제', [n('내용'), n('내용')]),
      n('하위 주제'),
      n('하위 주제'),
    ], 'tree-right'),
    br('주제 3', 'l1C', 'right', [n('하위 주제'), n('하위 주제')], 'tree-right'),
    br('주제 4', 'l1D', 'right', [n('하위 주제'), n('하위 주제'), n('하위 주제')], 'tree-right'),
    br('주제 5', 'l1E', 'right', [n('하위 주제'), n('하위 주제'), n('하위 주제')], 'tree-right'),
    br('주제 6', 'l1A', 'right', [n('하위 주제'), n('하위 주제')], 'tree-right'),
  ],
});

// ── 브레인스토밍 — 방사형·양쪽 자유 확장 ─────────────────────────────────
const brainstormingMap = (): SampleMap => ({
  title: '브레인스토밍',
  root: rootOf('중심 주제'),
  branches: [
    br('아이디어 1', 'l1A', 'right', [n('하위 주제'), n('하위 주제')]),
    br('아이디어 2', 'l1B', 'right', [n('하위 주제')]),
    br('아이디어 3', 'l1C', 'right', [n('하위 주제'), n('하위 주제')]),
    br('아이디어 4', 'l1D', 'left', [n('하위 주제'), n('하위 주제')]),
    br('아이디어 5', 'l1E', 'left', [n('하위 주제')]),
    br('아이디어 6', 'l1A', 'left', [n('하위 주제'), n('하위 주제')]),
  ],
});

// ── 제품 로드맵 — Q1~Q4 분기별 마일스톤 ─────────────────────────────────
const roadmapMap = (): SampleMap => ({
  title: '제품 로드맵',
  root: rootOf('제품 로드맵'),
  branches: [
    br('Q1 · 기반', 'l1A', 'right', [n('마일스톤', [n('내용')]), n('마일스톤')]),
    br('Q2 · 확장', 'l1B', 'right', [n('마일스톤', [n('내용')]), n('마일스톤')]),
    br('Q3 · 개선', 'l1C', 'left', [n('마일스톤'), n('마일스톤')]),
    br('Q4 · 공개', 'l1D', 'left', [n('마일스톤'), n('마일스톤')]),
  ],
});

// ── WBS 프로젝트 — 계층형 작업 분해 구조 ────────────────────────────────
const wbsMap = (): SampleMap => ({
  title: 'WBS 프로젝트',
  root: rootOf('프로젝트'),
  branches: [
    br('1.0 기획', 'l1B', 'right', [n('1.1 요구 정의'), n('1.2 일정 수립')]),
    br('2.0 설계', 'l1C', 'right', [n('2.1 화면 설계'), n('2.2 데이터 설계')]),
    br('3.0 개발', 'l1A', 'right', [n('3.1 기능 구현'), n('3.2 테스트')]),
    br('4.0 이행', 'l1D', 'right', [n('4.1 배포'), n('4.2 안정화')]),
  ],
});

// ── Kanban 보드 — 백로그 → 완료 흐름 ────────────────────────────────────
const kanbanMap = (): SampleMap => ({
  title: 'Kanban 보드',
  root: rootOf('Kanban 보드'),
  branches: [
    br('백로그', 'l1E', 'right', [n('카드'), n('카드'), n('카드')]),
    br('진행 중', 'l1A', 'right', [n('카드'), n('카드')]),
    br('검토', 'l1B', 'right', [n('카드')]),
    br('완료', 'l1C', 'right', [n('카드')]),
  ],
});

// ── 회의록 — 안건 · 결정 · 액션 ─────────────────────────────────────────
const meetingMap = (): SampleMap => ({
  title: '회의록',
  root: rootOf('회의 제목 · 일시'),
  branches: [
    br('안건', 'l1B', 'right', [n('안건 1', [n('논의 내용')]), n('안건 2')]),
    br('결정 사항', 'l1C', 'right', [n('결정 1'), n('결정 2')]),
    br('액션 아이템', 'l1A', 'right', [n('할 일 · 담당 · 기한'), n('할 일 · 담당 · 기한')]),
  ],
});

export const LIBRARY_TEMPLATES: LibraryTemplate[] = [
  {
    id: 'lib-tree-progress',
    name: '트리-진행트리맵',
    desc: '기본 템플릿 · 1레벨 트리 → 2레벨 진행트리 → 3레벨 트리 → 4레벨 진행트리',
    colors: ['#D97706', '#0284C7', '#15803D', '#9333EA', '#DC2626'],
    map: treeProgressMap(),
    editor: { layoutType: 'tree-right' },
  },
  {
    id: 'lib-progress-tree',
    name: '진행트리-트리맵',
    desc: '1레벨 진행트리 · 2레벨 트리 구조',
    colors: ['#D97706', '#0284C7', '#15803D', '#9333EA', '#DC2626', '#F59E0B'],
    map: progressTreeMap(),
    editor: { layoutType: 'process-tree-right' },
  },
  {
    id: 'lib-brainstorming',
    name: '브레인스토밍',
    desc: '자유 확장 방사형(양쪽) 맵',
    colors: ['#F59E0B', '#FBBF24'],
    map: brainstormingMap(),
    editor: { layoutType: 'radial-bidirectional' },
  },
  {
    id: 'lib-roadmap',
    name: '제품 로드맵',
    desc: 'Q1~Q4 분기별 마일스톤',
    colors: ['#D97706', '#0284C7', '#15803D', '#9333EA'],
    map: roadmapMap(),
    editor: { layoutType: 'radial-bidirectional' },
  },
  {
    id: 'lib-wbs',
    name: 'WBS 프로젝트',
    desc: '계층형 작업 분해 구조',
    colors: ['#0284C7', '#38BDF8', '#7DD3FC'],
    map: wbsMap(),
    editor: { layoutType: 'hierarchy-right' },
  },
  {
    id: 'lib-kanban',
    name: 'Kanban 보드',
    desc: '백로그 → 완료 흐름',
    colors: ['#958A78', '#D97706', '#0284C7', '#15803D'],
    map: kanbanMap(),
    editor: { layoutType: 'kanban' },
  },
  {
    id: 'lib-meeting',
    name: '회의록',
    desc: '안건 · 결정 · 액션',
    colors: ['#DC2626', '#F59E0B', '#15803D'],
    map: meetingMap(),
    editor: { layoutType: 'radial-right' },
  },
];
