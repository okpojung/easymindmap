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
  /** 0~1 */
  ratio: number;
  /** 사용자가 [취소]를 누르면 이걸 abort 한다 */
  abort: () => void;
}

interface UploadState {
  uploads: UploadItem[];
  begin: (item: UploadItem) => void;
  progress: (key: string, ratio: number) => void;
  end: (key: string) => void;
}

export const useUploadStore = create<UploadState>((set) => ({
  uploads: [],
  begin: (item) => set((s) => ({ uploads: [...s.uploads, item] })),
  progress: (key, ratio) => set((s) => ({
    uploads: s.uploads.map((u) => (u.key === key ? { ...u, ratio } : u)),
  })),
  end: (key) => set((s) => ({ uploads: s.uploads.filter((u) => u.key !== key) })),
}));
