// 클라우드 연결 상태 — 현재 문서가 어떤 서버 맵(cloudMapId)과 묶여 있는지
// 기억한다. 문서 본문은 documentStore(인메모리)에 있고, 여기서는 "연결
// 정보"만 관리한다.
//
// ⚠️ 세션 한정(비영속): cloudMapId 를 새로고침 후에도 유지하면, 인메모리
// 문서는 기본 샘플인데 자동저장이 그 샘플로 서버 맵을 덮어써 데이터가
// 유실될 수 있다. 그래서 링크는 세션 동안만 유지하고, 재접속은 명시적
// "클라우드에서 열기"로만 한다. (안전한 startup 자동 재연결은 향후 과제)
import { create } from 'zustand';

interface CloudState {
  /** 현재 문서와 연결된 서버 맵 id (없으면 아직 클라우드 미저장) */
  cloudMapId: string | null;
  /** 마지막으로 클라우드에 저장한 시각(ISO) */
  lastSavedAt: string | null;
  busy: 'idle' | 'saving' | 'opening';
  error: string | null;

  link: (mapId: string, savedAt: string) => void;
  unlink: () => void;
  setBusy: (b: CloudState['busy']) => void;
  setError: (e: string | null) => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  cloudMapId: null,
  lastSavedAt: null,
  busy: 'idle',
  error: null,
  link: (mapId, savedAt) => set({ cloudMapId: mapId, lastSavedAt: savedAt, error: null }),
  unlink: () => set({ cloudMapId: null, lastSavedAt: null }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
}));
