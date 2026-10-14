// 연결 맵의 탭별 상태 (2026-10-14) — 어느 연결 맵을 이 탭이 고칠 수 있나, 그 맵의
// 마지막 저장 내용·시각. 서버를 부르는 코드는 services/cloud/linkedMaps.ts 에 있고,
// 여기는 **상태만** 둔다 — 노드 아이콘(nodeContent)·레이아웃 테스트가 이 파일을
// 불러도 API 클라이언트까지 끌려오지 않게.
import { create } from 'zustand';
import type { SampleMap } from '@/editor/__samples__/types';

export type LinkState =
  /** 이 탭이 편집 잠금을 쥐었다 — 큰 맵 안에서 고친 것을 그 맵에 저장한다 */
  | 'editable'
  /** 다른 곳에서 편집 중 · 읽기 전용으로 연 큰 맵 · 공개/대시보드/협업 맵 — 보기만 */
  | 'readonly'
  /** 지워졌거나 권한이 없다 — 이름만 보인다 */
  | 'missing'
  /** 고리 · 너무 깊다 — 펼치지 않았다 */
  | 'skipped';

export interface LinkedEntry {
  mapId: string;
  title: string;
  state: LinkState;
  /** 서버 문서의 마지막 갱신 시각 — 저장의 baseUpdatedAt */
  updatedAt?: string;
  /** 그 맵 문서에서 큰 맵에 붙이지 않는 부분(연결선·설정·둘째 이후 중심·에디터 설정) */
  base?: { map: SampleMap; editor?: unknown };
  /** 마지막으로 읽거나 저장한 그 맵의 내용(JSON) — 바뀐 것만 저장한다 */
  savedJson?: string;
}

interface LinkedStore {
  entries: Record<string, LinkedEntry>;
  set: (e: LinkedEntry) => void;
  reset: () => void;
}
export const useLinkedMapStore = create<LinkedStore>((set) => ({
  entries: {},
  set: (e) => set((s) => ({ entries: { ...s.entries, [e.mapId]: e } })),
  reset: () => set({ entries: {} }),
}));

