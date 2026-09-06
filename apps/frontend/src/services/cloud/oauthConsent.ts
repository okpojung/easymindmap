// OAuth 동의(consent) 화면이 쓰는 GoTrue 호출과 순수 판정들 — MCP 4단계
// (2026-09-06). 설계·근거: docs/04-extensions/ai/mcp-connector.md §10.6
//
// ★ 왜 이 화면을 **우리가** 만드나
//   GoTrue 에는 로그인·동의 화면이 **들어 있지 않다.** `/oauth/authorize` 는
//   인가 요청을 DB 에 적어 두고 `SiteURL + AUTHORIZATION_PATH` 로 넘길 뿐이다
//   (`internal/api/oauthserver/authorize.go:169~171`). 그 자리에 아무것도
//   없으면 사용자는 404 를 만난다 — 커넥터가 붙지 않는다.
//
// ★ 이 파일에 화면이 없는 이유
//   화면은 `pages/OAuthConsentPage` 에 둔다. 여기에는 GoTrue 와 주고받는
//   일만 둔다. 순수 판정은 한 겹 더 갈라 `oauthConsentRules.ts` 에 있다
//   (그 파일 머리말에 이유를 적었다).

import { authUrl, authHeaders, AuthError } from './supabaseAuth';
import { describeScopes, isSafeRedirect, type ScopeItem } from './oauthConsentRules';

// 한 문을 유지한다 — 부르는 쪽이 '판정은 저기, 호출은 여기' 를 외우지
// 않아도 되게 이 파일에서 함께 내보낸다.
export * from './oauthConsentRules';

export interface AuthorizationDetails {
  authorizationId: string;
  clientName: string;
  clientUri: string;
  userEmail: string;
  scopes: ScopeItem[];
}

export type AuthorizationLookup =
  | { kind: 'consent'; details: AuthorizationDetails }
  | { kind: 'approved'; redirectUrl: string };

interface RawDetails {
  authorization_id?: string;
  redirect_uri?: string;
  client?: { id?: string; name?: string; uri?: string; logo_uri?: string };
  user?: { id?: string; email?: string };
  scope?: string;
  /** 자동 승인일 때만 온다 */
  redirect_url?: string;
}

async function call<T>(path: string, accessToken: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(authUrl(path), {
      method: body === undefined ? 'GET' : 'POST',
      headers: authHeaders(accessToken),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AuthError(0, '인증 서버에 연결할 수 없습니다.');
  }
  if (!res.ok) {
    let msg = `요청이 거부되었습니다 (${res.status})`;
    try {
      const j = (await res.json()) as { msg?: string; message?: string; error_description?: string };
      msg = j.error_description || j.msg || j.message || msg;
    } catch { /* 본문 없음 */ }
    // GoTrue 의 대표 오류를 사용자 언어로 — 여기서 가장 흔한 둘이다.
    if (/authorization not found/i.test(msg)) {
      msg = '이 연결 요청을 찾을 수 없습니다. 시간이 지났거나(10분) 이미 처리된 요청입니다. '
        + '연결을 처음부터 다시 시작해 주세요.';
    }
    if (/no longer pending|cannot be processed/i.test(msg)) {
      msg = '이미 처리된 연결 요청입니다. 연결을 처음부터 다시 시작해 주세요.';
    }
    throw new AuthError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const oauthConsent = {
  /**
   * 이 인가 요청이 무엇을 달라는지 읽는다.
   *
   * ★ **두 가지 답이 온다.** 전에 같은 범위를 허락한 적이 있으면 GoTrue 가
   *   이 호출에서 곧바로 승인해 버리고 `redirect_url` 만 준다
   *   (`authorize.go:249~271` — `shouldAutoApprove`). 그때 화면에 동의를
   *   또 물으면 되돌아갈 곳을 잃는다.
   */
  async lookup(authorizationId: string, accessToken: string): Promise<AuthorizationLookup> {
    const r = await call<RawDetails>(`/oauth/authorizations/${authorizationId}`, accessToken);
    if (r.redirect_url) {
      // 자동 승인도 같은 검사를 지난다 — 이동 주소는 어느 길로 왔든 위험하다
      if (!isSafeRedirect(r.redirect_url)) {
        throw new AuthError(0, '인증 서버가 돌아갈 주소를 주지 않았습니다.');
      }
      return { kind: 'approved', redirectUrl: r.redirect_url };
    }
    return {
      kind: 'consent',
      details: {
        authorizationId: r.authorization_id ?? authorizationId,
        clientName: r.client?.name?.trim() || '이름을 밝히지 않은 앱',
        clientUri: r.client?.uri ?? '',
        userEmail: r.user?.email ?? '',
        scopes: describeScopes(r.scope),
      },
    };
  },

  /**
   * [허용] / [거부]. 둘 다 **되돌아갈 주소**를 준다 — 거부도 그냥 끝내지
   * 않고 `error=access_denied` 를 달아 부른 쪽으로 돌려보내는 것이 규격이다
   * (RFC 6749 §4.1.2.1). 그래야 claude.ai 가 "거절당했다"를 알 수 있다.
   */
  async decide(
    authorizationId: string, action: 'approve' | 'deny', accessToken: string,
  ): Promise<string> {
    const r = await call<{ redirect_url?: string }>(
      `/oauth/authorizations/${authorizationId}/consent`, accessToken, { action },
    );
    if (!isSafeRedirect(r.redirect_url)) {
      throw new AuthError(0, '인증 서버가 돌아갈 주소를 주지 않았습니다.');
    }
    return r.redirect_url as string;
  },
};
