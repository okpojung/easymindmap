// userTemplates — '내 템플릿' 로컬 저장소 (템플릿 패널·새 맵 패널이 공유).
// MVS에서는 브라우저 localStorage에 저장한다 — 이 기기·브라우저에서만 보인다.
// [서버 연결 예정] Supabase 연동 시 templates 테이블로 이관 — 최초 로그인
// 때 로컬 등록분을 서버로 옮긴다 (docs/02-domain/db-schema.md 참조).

import type { SampleMap, SampleBranch, MindNode, LayoutType } from '@/editor/__samples__/types';

export const USER_TPL_KEY = 'easymindmap.userTemplates.v1';

export interface UserTemplate {
  id: string;
  name: string;
  savedAt: string; // ISO
  nodeCount: number;
  map: SampleMap;
  // 맵 전체 레이아웃·간격은 문서(map)가 아니라 editorUiStore에 있으므로
  // 템플릿에 따로 저장해 적용 시 함께 복원한다. (없으면 — 구버전 등록분 —
  // map.root.layoutType으로 폴백)
  editor?: {
    layoutType?: LayoutType;
    spacingX?: number;
    spacingY?: number;
  };
}

export function loadUserTemplates(): UserTemplate[] {
  try {
    const raw = localStorage.getItem(USER_TPL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveUserTemplates(list: UserTemplate[]): boolean {
  try {
    localStorage.setItem(USER_TPL_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // 저장소 초과 등
  }
}

// '이 템플릿으로 새 맵 시작'용 골격 맵 (ThinkWise 방식) —
// 템플릿은 맵의 속성만 물려준다: 구조(4레벨까지)·레이아웃·폰트(맵 설정)·
// 도형/색(스타일)·정렬. 원본 맵의 "내용"은 모두 비운다:
//   · 노드 텍스트 → 자리 표시 텍스트로 교체
//       1레벨(루트) '중심 주제' · 2레벨 '주제 1..n' · 3레벨 '하위 주제' ·
//       4레벨 '내용'
//   · 노트·링크·첨부·사진·태그·아이콘·수동 크기 제외, 접힘 해제
//   · 구조는 4레벨(루트 포함)까지만 — 그 아래는 잘라냄
// (템플릿 패널의 '적용'은 기존대로 맵 전체를 그대로 복제한다)
const SKELETON_TEXT: Record<number, string> = {
  2: '하위 주제',
  3: '내용',
};

export function templateSkeletonMap(map: SampleMap): SampleMap {
  // depth: 루트=0 … '4레벨'=depth 3 (루트를 1레벨로 세는 사용자 기준)
  const strip = (n: MindNode, depth: number, index: number): MindNode => ({
    ...n,
    text: depth === 1 ? `주제 ${index + 1}` : SKELETON_TEXT[depth] ?? '내용',
    note: undefined,
    notes: undefined,
    links: undefined,
    attachments: undefined,
    image: undefined,
    tag: undefined,
    tags: undefined,
    icon: undefined,
    sizeW: undefined,
    sizeH: undefined,
    collapsed: undefined,
    children:
      depth >= 3
        ? undefined
        : (n.children ?? []).map((c, i) => strip(c, depth + 1, i)),
  });

  const cloned = JSON.parse(JSON.stringify(map)) as SampleMap;
  return {
    ...cloned,
    root: {
      ...cloned.root,
      text: '중심 주제',
      note: undefined,
      notes: undefined,
      links: undefined,
      attachments: undefined,
      image: undefined,
      tag: undefined,
      tags: undefined,
      icon: undefined,
      sizeW: undefined,
      sizeH: undefined,
    },
    branches: cloned.branches.map((b, i) => strip(b, 1, i) as SampleBranch),
  };
}

export function countMapNodes(map: SampleMap): number {
  let n = 1; // root
  const walk = (nodes: { children?: unknown[] }[]) => {
    for (const node of nodes) {
      n++;
      walk((node.children ?? []) as { children?: unknown[] }[]);
    }
  };
  walk(map.branches);
  return n;
}

// ---------------------------------------------------------------------------
// 템플릿 "속성만" 적용 — 현재 맵의 내용(노드·텍스트·노트·태그)은 그대로
// 두고, 템플릿의 맵 설정(레벨별 폰트·레이아웃)과 레벨별 대표 스타일
// (도형·색·테두리)만 입힌다. (템플릿 패널의 '적용' — 맵 전체를 교체하지
// 않는다. 교체가 필요하면 '새 맵 > 이 템플릿으로 시작'을 쓴다.)
// ---------------------------------------------------------------------------

import type { NodeStyle } from '@/editor/__samples__/types';

// 템플릿 맵에서 depth별 대표 스타일(그 depth 첫 노드의 style)을 뽑는다
function levelStylesOf(map: SampleMap): (NodeStyle | undefined)[] {
  const styles: (NodeStyle | undefined)[] = [];
  const walk = (nodes: MindNode[], depth: number) => {
    for (const n of nodes) {
      if (styles[depth] === undefined && n.style) styles[depth] = n.style;
      if (styles.length <= depth) styles.length = depth + 1;
      walk(n.children ?? [], depth + 1);
    }
  };
  walk(map.branches as MindNode[], 1);
  return styles;
}

export function applyTemplateStyles(current: SampleMap, tpl: SampleMap): SampleMap {
  const levelStyles = levelStylesOf(tpl);
  const maxLevel = levelStyles.length - 1;

  const restyle = (n: MindNode, depth: number): MindNode => ({
    ...n,
    // depth별 대표 스타일 — 템플릿에 그 depth가 없으면 마지막 레벨 스타일
    style: levelStyles[Math.min(depth, Math.max(1, maxLevel))] ?? undefined,
    children: (n.children ?? []).map((c) => restyle(c, depth + 1)),
  });

  return {
    ...current,
    root: {
      ...current.root,
      style: tpl.root.style,
      textAlign: tpl.root.textAlign ?? current.root.textAlign,
    },
    branches: current.branches.map((b) => restyle(b, 1)) as SampleMap['branches'],
    // 맵 설정(레벨별 폰트·레이아웃)은 템플릿 것으로
    settings: tpl.settings,
  };
}
