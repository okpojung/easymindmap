// appSettingsStore — **개인 설정** (맵이 아니라 이 브라우저의 설정).
import { create } from 'zustand';

const KEY = 'emm.appSettings';

/** 자동저장 주기(분) — 사용자가 고른다 */
export const AUTOSAVE_INTERVAL_CHOICES = [3, 5, 10] as const;

interface AppSettingsState {
  /**
   * **자동저장 주기**(분). 기본 5분, 3·5·10분 중 선택.
   *
   * 2026-08-06 저장 모델 개편 — 예전에는 "손을 멈춘 뒤 1.5초"마다 문서
   * 전체를 서버에 올렸다. 사진이 든 맵은 스냅샷이 수 MB 라, 10분 집중
   * 편집이면 수백 번 × 수 MB 가 오갔다. 이제 이 주기로 한 번만 올리고,
   * 그 사이 편집은 **브라우저(IndexedDB)** 가 지킨다.
   *
   * UI 는 3·5·10 만 고르게 하고, 저장된 값이 그 밖이면 5로 되돌린다.
   * setter 타입이 `number` 인 것은 **테스트가 짧은 주기를 직접 넣어**
   * 주기 저장을 검증할 수 있게 하기 위해서다(그 값은 저장돼도 다음
   * 실행에서 5로 떨어진다).
   */
  autosaveIntervalMin: number;
  setAutosaveIntervalMin: (v: number) => void;
}

function load(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as { autosaveIntervalMin?: number }) : null;
    const n = v?.autosaveIntervalMin;
    if (n === 3 || n === 5 || n === 10) return n;
  } catch { /* 무시 */ }
  return 5;
}

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
  autosaveIntervalMin: load(),
  setAutosaveIntervalMin: (autosaveIntervalMin) => {
    set({ autosaveIntervalMin });
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ autosaveIntervalMin }));
    } catch { /* 무시 */ }
  },
}));
