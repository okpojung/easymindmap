// 클라우드 연결 상태 — 현재 문서가 어떤 서버 맵(cloudMapId)과 묶여 있는지
// 기억한다(브라우저 localStorage 영속). 문서 본문은 documentStore(인메모리)에
// 있고, 여기서는 "연결 정보"만 관리한다.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CloudState {
  /** 현재 문서와 연결된 서버 맵 id (없으면 아직 클라우드 미저장) */
  cloudMapId: string | null;
  /** 마지막으로 클라우드에 저장한 시각(ISO) */
  lastSavedAt: string | null;
  /** 진행 상태 표시용 */
  busy: 'idle' | 'saving' | 'opening';
  error: string | null;

  link: (mapId: string, savedAt: string) => void;
  unlink: () => void;
  setBusy: (b: CloudState['busy']) => void;
  setError: (e: string | null) => void;
}

export const useCloudStore = create<CloudState>()(
  persist(
    (set) => ({
      cloudMapId: null,
      lastSavedAt: null,
      busy: 'idle',
      error: null,
      link: (mapId, savedAt) => set({ cloudMapId: mapId, lastSavedAt: savedAt, error: null }),
      unlink: () => set({ cloudMapId: null, lastSavedAt: null }),
      setBusy: (busy) => set({ busy }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'easymindmap.cloud',
      // 영속 대상은 연결 정보만 (busy/error 는 제외)
      partialize: (s) => ({ cloudMapId: s.cloudMapId, lastSavedAt: s.lastSavedAt }),
    },
  ),
);
