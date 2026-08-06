// 큰 첨부를 **올리는 중**인 목록 (2026-08-06, §12.7).
//
// 1GB 는 회선에 따라 몇 분이 걸린다. 진행 표시가 없으면 사용자에게는
// 그냥 **"무반응"** 으로 보인다 — 20MB 첨부가 조용히 실패하던 것과 같은
// 종류의 문제다. 그래서 올리는 동안 화면 위에 한 줄을 띄우고, 끝나면
// 지운다. 취소도 여기서 한다.
//
// 첨부를 시작하는 곳이 여럿이라(노드 드롭 · 첨부 탭 문서/미디어) 상태를
// 스토어에 두고 **한 곳에서만 그린다** — 경로마다 진행률 UI 를 따로 만들면
// 어느 하나는 반드시 빠진다.

import { create } from 'zustand';

export interface UploadItem {
  /** 이 업로드의 임시 키 (첨부 id 가 아니다 — 완료 전엔 없다) */
  key: string;
  name: string;
  /** 전체 바이트 */
  size: number;
  /** 0~1 — **보낸 바이트 기준** (조각 수가 아니다, 2026-08-06) */
  ratio: number;
  /**
   * 지금 무슨 일이 일어나는지 한 줄 (재시도 중 등). 평소에는 null.
   * 진행률이 잠깐 멈춰도 **왜 멈췄는지** 보이게 하려는 것이다.
   */
  note?: string | null;
  /** 사용자가 [취소]를 누르면 이걸 abort 한다 */
  abort: () => void;
}

interface UploadState {
  uploads: UploadItem[];
  begin: (item: UploadItem) => void;
  progress: (key: string, ratio: number) => void;
  notice: (key: string, note: string | null) => void;
  end: (key: string) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: [],
  begin: (item) => set((s) => ({ uploads: [...s.uploads, item] })),
  progress: (key, ratio) => set((s) => ({
    // 값이 그대로면 새 배열을 만들지 않는다 — 바이트 단위 진행률은
    // 초당 수십 번 불려서, 같은 값에도 리렌더가 돌면 낭비다.
    uploads: s.uploads.some((u) => u.key === key && u.ratio !== ratio)
      ? s.uploads.map((u) => (u.key === key ? { ...u, ratio } : u))
      : s.uploads,
  })),
  notice: (key, note) => set((s) => ({
    uploads: s.uploads.some((u) => u.key === key && (u.note ?? null) !== note)
      ? s.uploads.map((u) => (u.key === key ? { ...u, note } : u))
      : s.uploads,
  })),
  end: (key) => set((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) })),
}));
