// ── 단일 세션 편집 잠금의 세션 키 (2026-08-04) ──────────────────────
// 탭마다 고유한 키 — sessionStorage 라 같은 브라우저의 다른 탭도
// "다른 세션"이다. 서버 map_edit_locks 가 이 키로 편집권을 관리한다.
//
// mapSession.ts 가 아니라 이 작은 파일에 두는 이유: 자동저장
// (useCloudAutosave)도 저장 요청에 이 키를 실어야 하는데, mapSession 이
// useCloudAutosave 를 import 하고 있어 반대 방향 import 는 순환이 된다.
// (2026-08-05 — 키를 싣지 않은 자동저장이 자기 자신이 쥔 잠금에 막혀
//  409 로 계속 실패했다. 되돌리기 중 "저장 실패" 배지의 원인.)
const EDIT_SESSION_STORAGE = 'emm.editSession';

export function editSessionKey(): string {
  try {
    let k = window.sessionStorage.getItem(EDIT_SESSION_STORAGE);
    if (!k) {
      k = (window.crypto?.randomUUID?.() ??
        `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
      window.sessionStorage.setItem(EDIT_SESSION_STORAGE, k);
    }
    return k;
  } catch {
    return 'no-session-storage';
  }
}
