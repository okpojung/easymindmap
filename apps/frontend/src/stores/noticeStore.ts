// 사용자에게 **한 줄 알린다** (2026-08-20, B16 ② 슬라이스 3).
//
// 왜 스토어인가: 사진 붙여넣기는 **네 군데**에서 시작된다 — 캔버스 전역
// 붙여넣기 · 노드 텍스트 편집창 · 아웃라인 · 칸반. 각자 안내 UI 를 만들면
// 어느 하나는 반드시 빠진다(첨부 진행률에서 이미 겪은 일 — `uploadStore.ts`).
// 그래서 상태만 여기 두고 **그리는 것은 EditorPage 한 곳**에서 한다.
//
// ★ 이 파일이 있는 이유는 **실패를 조용히 삼키지 않기 위해서**다.
//   사진을 서버에 올리지 못했는데 아무 말이 없으면, 사용자는 문서가
//   무거워진 것도 · 나중에 그 사진이 왜 안 옮겨졌는지도 알 수 없다.

import { create } from 'zustand';

interface NoticeState {
  /** 지금 띄울 한 줄 (없으면 null) */
  notice: string | null;
  /** 같은 문구가 다시 와도 다시 띄우기 위한 일련번호 */
  seq: number;
  notify: (msg: string) => void;
  clear: () => void;
}

export const useNoticeStore = create<NoticeState>((set) => ({
  notice: null,
  seq: 0,
  notify: (msg) => set((s) => ({ notice: msg, seq: s.seq + 1 })),
  clear: () => set({ notice: null }),
}));

/** 리액트 밖(유틸 함수)에서 부르는 입구 */
export function notifyUser(msg: string): void {
  useNoticeStore.getState().notify(msg);
}
