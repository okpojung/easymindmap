// libraryTemplates — 기본 제공 "템플릿 라이브러리" (실제 적용 가능한 맵).
// 템플릿 패널과 새 맵 패널이 공유한다:
//   · '적용'          — 현재 맵의 내용은 두고 속성만 (applyTemplateStyles)
//   · '이 템플릿으로 시작' — 골격 맵으로 새 맵 시작 (templateSkeletonMap과
//                        동일한 자리 표시 텍스트를 이미 담고 있다)
//
// i18n: 이름·설명·노드 내용은 **부르는 순간의 언어**로 만든다 —
// libraryTemplates() 를 쓸 때마다 tr() 로 새로 짓는다 (모듈 로드 때 굳히지
// 않는다). 구조(노드 수·레이아웃·색)는 언어와 무관하게 같다.
// [서버 연결 예정] 시스템 관리자가 관리하는 템플릿 카탈로그(templates
// 테이블, is_system=true)로 이관 — docs/02-domain/db-schema.md 참조.

import type { LayoutType, MindNode, SampleBranch, SampleMap } from '@/editor/__samples__/types';
import { tr } from '@/i18n';

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
// 자주 쓰는 자리 표시 — 부를 때마다 지금 언어로
const CENTRAL = () => tr('panel.lib.node.central');
const SUB = () => tr('panel.lib.node.subtopic');
const CONTENT = () => tr('panel.lib.node.content');
const MILESTONE = () => tr('panel.lib.node.milestone');
const TOPIC = (n: number) => tr('panel.lib.node.topicN', { n });
const rootOf = (text: string): SampleMap['root'] =>
  ({ id: 'root', text, colorKey: 'root', side: 'center' }) as SampleMap['root'];

// ── 트리-진행트리맵 — 기본 템플릿 (2026-07 지정) ─────────────────────────
// 레벨별 레이아웃: 1레벨(중심) 트리·오른쪽 → 2레벨 진행트리·오른쪽 →
// 3레벨 트리·오른쪽 → 4레벨 진행트리·오른쪽. (노드의 layoutType = 그 노드의
// "자식" 배치 — 맵 전체 기본은 editor.layoutType이 1레벨 몫을 맡는다)
// '새 맵 만들기'의 기본 골격(documentStore.newMap)도 이 구조로 시작한다.
// 2026-08-04 골격 축소(사용자 지정 이미지 기준, 11노드): 주제 1·2 =
// 하위 주제 1 + 내용 2, 주제 3 = 하위 주제 1 — documentStore.newMap 과 한 쌍.
const treeProgressMap = (): SampleMap => ({
  title: tr('panel.lib.treeProgress.name'),
  root: rootOf(CENTRAL()),
  branches: [
    br(TOPIC(1), 'l1A', 'right', [
      n(SUB(), [n(CONTENT(), undefined, 'process-tree-right'), n(CONTENT(), undefined, 'process-tree-right')], 'tree-right'),
    ], 'process-tree-right'),
    br(TOPIC(2), 'l1B', 'right', [
      n(SUB(), [n(CONTENT(), undefined, 'process-tree-right'), n(CONTENT(), undefined, 'process-tree-right')], 'tree-right'),
    ], 'process-tree-right'),
    br(TOPIC(3), 'l1C', 'right', [
      n(SUB(), undefined, 'tree-right'),
    ], 'process-tree-right'),
  ],
});

// ── 진행트리-트리맵 — 1레벨 진행트리·오른쪽 + 2레벨 트리·오른쪽 ─────────
// ('새 맵 > 기본 맵'과 같은 뼈대를 라이브러리에 상시 제공 — 2026-07 요청)
// 2026-08-04 골격 축소 — 트리-진행트리맵과 같은 11노드 뼈대(레이아웃만 반대)
const progressTreeMap = (): SampleMap => ({
  title: tr('panel.lib.progressTree.name'),
  root: rootOf(CENTRAL()),
  branches: [
    // 3레벨('하위 주제')의 자식 배치를 진행트리 → **트리·오른쪽**으로
    // (2026-08-05 요청) — 내용 노드가 세로로 가지런히 늘어선다.
    br(TOPIC(1), 'l1A', 'right', [
      n(SUB(), [n(CONTENT()), n(CONTENT())], 'tree-right'),
    ], 'tree-right'),
    br(TOPIC(2), 'l1B', 'right', [
      n(SUB(), [n(CONTENT()), n(CONTENT())], 'tree-right'),
    ], 'tree-right'),
    br(TOPIC(3), 'l1C', 'right', [n(SUB(), undefined, 'tree-right')], 'tree-right'),
  ],
});

// ── 방사형 양쪽 — 양쪽으로 자유 확장 ─────────────────────────────────────
// (2026-08-07 이름 변경: '브레인스토밍' → '방사형 양쪽'. 템플릿 이름이
//  용도가 아니라 **배치 모양**을 말하도록 통일 — 고를 때 결과가 보인다)
const brainstormingMap = (): SampleMap => ({
  title: tr('panel.lib.brainstorming.name'),
  root: rootOf(CENTRAL()),
  branches: [
    br(tr('panel.lib.node.ideaN', { n: 1 }), 'l1A', 'right', [n(SUB()), n(SUB())]),
    br(tr('panel.lib.node.ideaN', { n: 2 }), 'l1B', 'right', [n(SUB())]),
    br(tr('panel.lib.node.ideaN', { n: 3 }), 'l1C', 'right', [n(SUB()), n(SUB())]),
    br(tr('panel.lib.node.ideaN', { n: 4 }), 'l1D', 'left', [n(SUB()), n(SUB())]),
    br(tr('panel.lib.node.ideaN', { n: 5 }), 'l1E', 'left', [n(SUB())]),
    br(tr('panel.lib.node.ideaN', { n: 6 }), 'l1A', 'left', [n(SUB()), n(SUB())]),
  ],
});

// ── 시간배치(타임라인) — Q1~Q4 분기별 마일스톤 ──────────────────────────
// (2026-08-07 이름·레이아웃 변경: '제품 로드맵'/방사형·양쪽 → '시간배치
//  (타임라인)'/timeline. 분기 골격은 시간축 위에 놓일 때 제 모양이 난다)
const roadmapMap = (): SampleMap => ({
  title: tr('panel.lib.roadmap.name'),
  root: rootOf(CENTRAL()),
  branches: [
    br(tr('panel.lib.roadmap.q1'), 'l1A', 'right', [n(MILESTONE(), [n(CONTENT())]), n(MILESTONE())]),
    br(tr('panel.lib.roadmap.q2'), 'l1B', 'right', [n(MILESTONE(), [n(CONTENT())]), n(MILESTONE())]),
    br(tr('panel.lib.roadmap.q3'), 'l1C', 'left', [n(MILESTONE()), n(MILESTONE())]),
    br(tr('panel.lib.roadmap.q4'), 'l1D', 'left', [n(MILESTONE()), n(MILESTONE())]),
  ],
});

// ── 계층형 오른쪽 — 작업 분해(WBS) 골격 ─────────────────────────────────
// (2026-08-07 이름 변경: 'WBS 프로젝트' → '계층형 오른쪽')
const wbsMap = (): SampleMap => ({
  title: tr('panel.lib.wbs.name'),
  root: rootOf(tr('panel.lib.wbs.root')),
  branches: [
    br(tr('panel.lib.wbs.plan'), 'l1B', 'right', [n(tr('panel.lib.wbs.plan1')), n(tr('panel.lib.wbs.plan2'))]),
    br(tr('panel.lib.wbs.design'), 'l1C', 'right', [n(tr('panel.lib.wbs.design1')), n(tr('panel.lib.wbs.design2'))]),
    br(tr('panel.lib.wbs.dev'), 'l1A', 'right', [n(tr('panel.lib.wbs.dev1')), n(tr('panel.lib.wbs.dev2'))]),
    br(tr('panel.lib.wbs.rollout'), 'l1D', 'right', [n(tr('panel.lib.wbs.rollout1')), n(tr('panel.lib.wbs.rollout2'))]),
  ],
});

// ── Kanban 보드 — 주제 1~4 기본 보드 (2026-08-04 사용자 지정 이미지) ────
// 각 컬럼(주제)에 하위 주제 카드 1개 + 그 아래 내용 2개.
const kanbanMap = (): SampleMap => ({
  title: tr('panel.lib.kanban.name'),
  root: rootOf(tr('panel.lib.kanban.name')),
  branches: [
    br(TOPIC(1), 'l1A', 'right', [n(SUB(), [n(CONTENT()), n(CONTENT())])]),
    br(TOPIC(2), 'l1B', 'right', [n(SUB(), [n(CONTENT()), n(CONTENT())])]),
    br(TOPIC(3), 'l1C', 'right', [n(SUB(), [n(CONTENT()), n(CONTENT())])]),
    br(TOPIC(4), 'l1D', 'right', [n(SUB(), [n(CONTENT()), n(CONTENT())])]),
  ],
});

// ── 회의록 — 안건 · 결정 · 액션 ─────────────────────────────────────────
const meetingMap = (): SampleMap => ({
  title: tr('panel.lib.meeting.name'),
  root: rootOf(tr('panel.lib.meeting.root')),
  branches: [
    br(tr('panel.lib.meeting.agenda'), 'l1B', 'right', [n(tr('panel.lib.meeting.agendaN', { n: 1 }), [n(tr('panel.lib.meeting.discussion'))]), n(tr('panel.lib.meeting.agendaN', { n: 2 }))]),
    br(tr('panel.lib.meeting.decisions'), 'l1C', 'right', [n(tr('panel.lib.meeting.decisionN', { n: 1 })), n(tr('panel.lib.meeting.decisionN', { n: 2 }))]),
    br(tr('panel.lib.meeting.actions'), 'l1A', 'right', [n(tr('panel.lib.meeting.todo')), n(tr('panel.lib.meeting.todo'))]),
  ],
});

/** 기본 제공 템플릿 — **부르는 순간의 언어**로 이름·설명·노드 내용을 짓는다 */
export function libraryTemplates(): LibraryTemplate[] {
  return [
    {
      id: 'lib-tree-progress',
      name: tr('panel.lib.treeProgress.name'),
      desc: tr('panel.lib.treeProgress.desc'),
      colors: ['#D97706', '#0284C7', '#15803D', '#9333EA', '#DC2626'],
      map: treeProgressMap(),
      editor: { layoutType: 'tree-right' },
    },
    {
      id: 'lib-progress-tree',
      name: tr('panel.lib.progressTree.name'),
      desc: tr('panel.lib.progressTree.desc'),
      colors: ['#D97706', '#0284C7', '#15803D', '#9333EA', '#DC2626', '#F59E0B'],
      map: progressTreeMap(),
      editor: { layoutType: 'process-tree-right' },
    },
    {
      // id 는 그대로 둔다 — 저장된 맵·문서가 참조할 수 있다 (이름만 변경)
      id: 'lib-brainstorming',
      name: tr('panel.lib.brainstorming.name'),
      desc: tr('panel.lib.brainstorming.desc'),
      colors: ['#F59E0B', '#FBBF24'],
      map: brainstormingMap(),
      editor: { layoutType: 'radial-bidirectional' },
    },
    {
      id: 'lib-roadmap',
      name: tr('panel.lib.roadmap.name'),
      desc: tr('panel.lib.roadmap.desc'),
      colors: ['#D97706', '#0284C7', '#15803D', '#9333EA'],
      map: roadmapMap(),
      editor: { layoutType: 'timeline' },
    },
    {
      id: 'lib-wbs',
      name: tr('panel.lib.wbs.name'),
      desc: tr('panel.lib.wbs.desc'),
      colors: ['#0284C7', '#38BDF8', '#7DD3FC'],
      map: wbsMap(),
      editor: { layoutType: 'hierarchy-right' },
    },
    {
      id: 'lib-kanban',
      name: tr('panel.lib.kanban.name'),
      desc: tr('panel.lib.kanban.desc'),
      colors: ['#958A78', '#D97706', '#0284C7', '#15803D'],
      map: kanbanMap(),
      editor: { layoutType: 'kanban' },
    },
    {
      id: 'lib-meeting',
      name: tr('panel.lib.meeting.name'),
      desc: tr('panel.lib.meeting.desc'),
      colors: ['#DC2626', '#F59E0B', '#15803D'],
      map: meetingMap(),
      editor: { layoutType: 'radial-right' },
    },
  ];
}
