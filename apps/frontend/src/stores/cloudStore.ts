// 클라우드 연결 상태 — 현재 문서가 어떤 서버 맵(cloudMapId)과 묶여 있는지
// 기억한다. 문서 본문은 documentStore(인메모리)에 있고, 여기서는 "연결
// 정보"만 관리한다.
//
// **서버에 저장된 이름·폴더·유형도 함께 들고 있다** (2026-08-02):
// "서버 맵을 열어 편집한 뒤 저장하면 열었던 그 이름 그대로" 가 규칙이라,
// 재저장 때 문서 안의 map.title 이 아니라 이 값을 쓴다.
//
// ⚠️ 세션 한정(비영속): cloudMapId 를 새로고침 후에도 유지하면, 인메모리
// 문서는 기본 샘플인데 자동저장이 그 샘플로 서버 맵을 덮어써 데이터가
// 유실될 수 있다. 그래서 링크는 세션 동안만 유지하고, 재접속은 명시적
// "서버 맵 불러오기"(또는 `?map=<id>`)로만 한다.
import { create } from 'zustand';
import type { MapKind } from '@/services/cloud/apiClient';

/** 서버 맵의 식별 정보 — 링크할 때 함께 기억한다 */
export interface CloudMapMeta {
  title: string;
  /** null = 최상위("홈") */
  folderId: string | null;
  kind: MapKind;
}

interface CloudState {
  /** 현재 문서와 연결된 서버 맵 id (없으면 아직 서버 미저장) */
  cloudMapId: string | null;
  /** 서버에 저장된 이름 — 재저장 시 이 이름을 그대로 쓴다 */
  cloudTitle: string | null;
  cloudFolderId: string | null;
  cloudKind: MapKind;
  /** 마지막으로 서버에 저장한 시각(ISO) */
  lastSavedAt: string | null;
  busy: 'idle' | 'saving' | 'opening';
  error: string | null;
  /**
   * 읽기 전용으로 연 서버 맵 (2026-08-04 단일 세션 편집 잠금) — 다른
   * 세션이 편집 중이라 잠금을 얻지 못했다. 링크(cloudMapId)는 없어
   * 자동저장·저장이 이 맵에 쓰지 않고, 배너로 안내한다.
   */
  /**
   * 읽기 전용으로 연 맵. `viewer` 는 **권한 자체가 없다**는 뜻이라
   * 다른 이름으로 저장(사본)도 막는다 — 주인은 '읽기만' 을 준 것이지
   * 문서를 가져가도 좋다고 한 적이 없다 (2026-08-19).
   */
  readOnlyInfo: { mapId: string; title: string; reason?: string; viewer?: boolean } | null;

  link: (mapId: string, savedAt: string, meta?: Partial<CloudMapMeta>) => void;
  unlink: () => void;
  setReadOnlyInfo: (info: { mapId: string; title: string; reason?: string; viewer?: boolean } | null) => void;
  setBusy: (b: CloudState['busy']) => void;
  setError: (e: string | null) => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  cloudMapId: null,
  cloudTitle: null,
  cloudFolderId: null,
  cloudKind: 'solo',
  lastSavedAt: null,
  busy: 'idle',
  error: null,
  readOnlyInfo: null,
  // meta 를 주지 않으면 같은 맵을 다시 저장한 것으로 보고 기존 값을 유지,
  // 다른 맵이면 비운다 (옛 이름이 새 맵에 붙는 사고 방지).
  link: (mapId, savedAt, meta) =>
    set((s) => {
      const same = s.cloudMapId === mapId;
      return {
        cloudMapId: mapId,
        lastSavedAt: savedAt,
        error: null,
        readOnlyInfo: null,
        cloudTitle: meta?.title ?? (same ? s.cloudTitle : null),
        cloudFolderId:
          meta?.folderId !== undefined ? meta.folderId : same ? s.cloudFolderId : null,
        cloudKind: meta?.kind ?? (same ? s.cloudKind : 'solo'),
      };
    }),
  unlink: () =>
    set({
      cloudMapId: null,
      lastSavedAt: null,
      cloudTitle: null,
      cloudFolderId: null,
      cloudKind: 'solo',
      readOnlyInfo: null,
    }),
  setReadOnlyInfo: (readOnlyInfo) => set({ readOnlyInfo }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));
