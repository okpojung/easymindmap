// appSettingsStore — **개인 설정** (맵이 아니라 이 브라우저의 설정).
// 지금은 자동저장 관련 값 하나뿐이라 작게 시작한다.
import { create } from 'zustand';

const KEY = 'emm.appSettings';

/** 자동저장이 히스토리 버전을 남기는 간격 (분) — 사용자가 고른다 */
export const VERSION_INTERVAL_CHOICES = [3, 5, 10] as const;
export type VersionIntervalMin = (typeof VERSION_INTERVAL_CHOICES)[number];

interface AppSettingsState {
  /**
   * 자동저장 **버전 남기기** 간격(분). 자동저장은 원래 히스토리 버전을
   * 남기지 않아, 자동저장으로 지워진 내용은 세션 undo 말고는 복구할
   * 방법이 없었다 (2026-08-05 감사 R4). 이제 이 간격마다 한 번은
   * 버전으로도 남긴다 — 기본 5분, 3·5·10분 중 선택.
   */
  versionIntervalMin: VersionIntervalMin;
  setVersionIntervalMin: (v: VersionIntervalMin) => void;
}

function load(): VersionIntervalMin {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as { versionIntervalMin?: number }) : null;
    const n = v?.versionIntervalMin;
    if (n === 3 || n === 5 || n === 10) return n;
  } catch { /* 무시 */ }
  return 5;
}

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
  versionIntervalMin: load(),
  setVersionIntervalMin: (versionIntervalMin) => {
    set({ versionIntervalMin });
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ versionIntervalMin }));
    } catch { /* 무시 */ }
  },
}));
