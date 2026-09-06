// OAuth 동의 화면의 **순수 판정들** — MCP 4단계 (2026-09-06).
// 설계·근거: docs/04-extensions/ai/mcp-connector.md §10.6
//
// ★ 왜 호출(oauthConsent.ts)과 갈라 놓았나
//   여기 있는 것들은 무엇이 안전한 주소인가 · 범위를 사람 말로 어떻게
//   옮기나 같은 **판단**이라, 브라우저도 인증 서버도 없이 시험할 수 있어야
//   한다. 그런데 호출 쪽은 `import.meta.env`(Vite 전용)를 읽는 모듈에
//   기대므로, 한 파일에 두면 `tsx` 로 단위 시험을 돌릴 수 없다 —
//   실제로 그래서 갈랐다(합쳐 두었더니 테스트가 기동조차 못 했다).
//
//   `main.tsx` 도 `isConsentPath` 하나 때문에 인증 모듈을 끌고 오지
//   않게 되는 이득이 함께 온다.

/** 동의 화면의 주소 — GoTrue 의 `GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH` 와 **같아야 한다** */
export const CONSENT_PATH = '/oauth/consent';

/** 지금 주소가 동의 화면인가 (끝의 슬래시는 무시한다) */
export function isConsentPath(pathname: string): boolean {
  return pathname.replace(/\/+$/, '') === CONSENT_PATH;
}

/**
 * `?authorization_id=…` 를 꺼낸다.
 *
 * 모양까지 본다 — GoTrue 가 만드는 값은 **영숫자 32자**다
 * (`models.NewOAuthServerAuthorization` → `crypto.SecureAlphanumeric(32)`).
 * 아무 글자나 그대로 주소에 실어 보내면 우리가 남의 글을 서버로 옮겨 주는
 * 통로가 된다. 폭을 조금 넉넉히 둔 것은 GoTrue 가 길이를 바꿔도 화면이
 * 먼저 막아 버리지 않게 하려는 것이다.
 */
export function authorizationIdFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('authorization_id');
  if (!raw) return null;
  return /^[A-Za-z0-9_-]{16,128}$/.test(raw) ? raw : null;
}

/**
 * 범위(scope)를 사람 말로 옮긴다.
 *
 * ★ **모르는 범위를 감추지 않는다.** 목록에 없는 것이 오면 그 이름을
 *   그대로 보여 준다 — "무엇을 허락하는지 모르는 채 [허용]" 이 되는 것이
 *   가장 나쁘다. GoTrue 는 범위 목록을 스스로 늘릴 수 있어(`oauth_scope.go`)
 *   우리 표가 언제든 뒤처질 수 있다.
 */
const SCOPE_LABELS: Record<string, string> = {
  openid: '회원 식별 — 어느 계정인지',
  email: '이메일 주소',
  profile: '프로필 정보 (이름·사진)',
  phone: '전화번호',
  offline_access: '연결 유지 — 자리에 없을 때도 갱신',
};

export interface ScopeItem {
  id: string;
  label: string;
  /** 우리가 모르는 범위 — 화면이 따로 표시한다 */
  unknown: boolean;
}

export function describeScopes(scope: string | undefined): ScopeItem[] {
  const ids = (scope ?? '').split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const out: ScopeItem[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const label = SCOPE_LABELS[id];
    out.push({ id, label: label ?? id, unknown: label === undefined });
  }
  return out;
}

/**
 * GoTrue 가 돌려준 이동 주소를 그대로 믿지 않는다.
 *
 * GoTrue 는 이미 등록된 `redirect_uri` 인지 확인하고 만들지만, 그 값은
 * **결국 우리 화면이 `location` 에 넣는다.** `javascript:` 하나가 섞이면
 * 우리 오리진에서 남의 코드가 돈다. http/https 만 통과시킨다 — 한 줄로
 * 그 부류 전체가 막힌다.
 */
export function isSafeRedirect(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
