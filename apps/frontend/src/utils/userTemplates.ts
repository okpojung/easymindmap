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

// '이 템플릿으로 새 맵 시작'용 골격 맵 — 템플릿은 맵의 속성(레이아웃·
// 폰트·크기·스타일)과 뼈대 구조를 물려주는 용도이므로:
//   · 구조는 Level 4까지만 유지 (그 아래는 잘라냄)
//   · 노드 본문 콘텐츠(노트·링크·첨부·사진)는 제외
//   · 텍스트·태그·아이콘·스타일·레이아웃·수동 크기·맵 설정은 유지
// (템플릿 패널의 '적용'은 기존대로 맵 전체를 그대로 복제한다)
export function templateSkeletonMap(map: SampleMap): SampleMap {
  const strip = (n: MindNode, depth: number): MindNode => ({
    ...n,
    note: undefined,
    notes: undefined,
    links: undefined,
    attachments: undefined,
    image: undefined,
    children:
      depth >= 4
        ? undefined
        : (n.children ?? []).map((c) => strip(c, depth + 1)),
  });

  const cloned = JSON.parse(JSON.stringify(map)) as SampleMap;
  return {
    ...cloned,
    root: {
      ...cloned.root,
      note: undefined,
      notes: undefined,
      links: undefined,
      attachments: undefined,
      image: undefined,
    },
    branches: cloned.branches.map((b) => strip(b, 1) as SampleBranch),
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
