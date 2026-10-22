// 들어온 길 표시 — 홈페이지(www)의 'Guest로 체험해보기' 버튼 (2026-10-22 사용자 결정).
//
// 홈페이지는 `https://web.easymindmap.org/?from=www` 로 보낸다. 앱은 그 표시를 보고
// **로그인하지 않은 방문자에게만** 게스트 안내 팝업을 띄운다. 이미 로그인한 회원은
// 표시를 지우기만 하고 평소처럼 문서함으로 간다.
//
// 예전 체험 주소 `/try` 도 같은 길로 받는다 — 체험 화면은 걷어 냈고(같은 날 결정),
// 옛 링크를 누른 사람도 게스트 안내로 이어져야 한다.
//
// 표시는 화면이 뜨자마자 주소에서 지운다. 남겨 두면 새로고침·주소 공유 때마다
// 팝업이 다시 뜬다.

export interface EntryIntent {
  /** 게스트 안내 팝업을 띄울 만한 방문인가 (로그인 여부는 따로 본다) */
  fromWww: boolean;
  /** 표시를 지운 주소 (경로 + 쿼리 + 해시). 바뀐 것이 없으면 null */
  cleanUrl: string | null;
}

/** 주소만 보고 판정한다 — 테스트할 수 있게 브라우저 객체를 쓰지 않는다. */
export function parseEntry(href: string): EntryIntent {
  const url = new URL(href);
  let fromWww = false;
  let changed = false;
  if (url.pathname.replace(/\/+$/, '') === '/try') {
    url.pathname = '/';
    fromWww = true;
    changed = true;
  }
  if (url.searchParams.has('from')) {
    if (url.searchParams.get('from') === 'www') fromWww = true;
    url.searchParams.delete('from');
    changed = true;
  }
  return { fromWww, cleanUrl: changed ? url.pathname + url.search + url.hash : null };
}

/** localStorage 의 로그인 세션(authStore persist) 이 있는가 — 읽기만 한다 */
export function hasStoredSession(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { state?: { session?: unknown; guest?: unknown } };
    return !!parsed?.state?.session;
  } catch {
    return false;
  }
}

let guestInvite = false;

/**
 * 앱이 뜰 때 **한 번** 부른다 (main.tsx, 화면 고르기 전).
 * 로그인 세션이 이미 있으면 팝업 표시는 켜지 않는다.
 */
export function captureEntryIntent(): void {
  if (typeof window === 'undefined') return;
  const { fromWww, cleanUrl } = parseEntry(window.location.href);
  if (cleanUrl !== null) window.history.replaceState(window.history.state, '', cleanUrl);
  let stored: string | null = null;
  try { stored = window.localStorage.getItem('emm.auth'); } catch { /* 저장소를 못 읽으면 비로그인으로 본다 */ }
  guestInvite = fromWww && !hasStoredSession(stored);
}

/** 게스트 안내 팝업을 띄워야 하는가 (지우지 않는다 — StrictMode 이중 호출에도 같은 답) */
export function hasGuestInvite(): boolean {
  return guestInvite;
}

/** 팝업을 닫았다 — 같은 페이지에서 다시 띄우지 않는다 */
export function clearGuestInvite(): void {
  guestInvite = false;
}
