// Supabase Auth(GoTrue) REST 클라이언트 — 이메일/비밀번호 로그인 (Phase 3).
//
// SDK(@supabase/supabase-js) 대신 가벼운 REST 직접 호출을 쓴다 — 필요한
// 것은 가입/로그인/갱신/로그아웃 4개뿐이고, 번들 크기와 의존을 줄인다.
// VITE_SUPABASE_URL 이 없으면 인증 비활성(개발 모드 — 백엔드 AUTH_MODE=dev).

import { LOGOUT_PATH } from './logoutRules';
import { tr } from '@/i18n';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
// 인증 엔드포인트 경로 접두사 — 전체 Supabase(Kong 게이트웨이)는
// '/auth/v1'(기본), **GoTrue 단독 배포**는 루트로 서비스하므로 ''.
// (dev-server-coolify.md §5.5 — 경로 A)
const AUTH_PREFIX =
  import.meta.env.VITE_SUPABASE_AUTH_PREFIX !== undefined
    ? String(import.meta.env.VITE_SUPABASE_AUTH_PREFIX).replace(/\/$/, '')
    : '/auth/v1';

export const authEnabled = SUPABASE_URL !== '';

/**
 * 인증 서버의 절대 주소를 만든다 — 접두사 규칙을 한 곳에서만 안다
 * (2026-09-06, 동의 화면이 두 번째 사용자가 되면서 밖으로 뺐다).
 *
 * 전체 Supabase(Kong)는 `/auth/v1`, GoTrue 단독 배포는 루트다. 그 갈림을
 * 부르는 쪽마다 다시 쓰면 한 곳을 빠뜨린다.
 */
export function authUrl(path: string): string {
  return `${SUPABASE_URL}${AUTH_PREFIX}${path}`;
}

/** GoTrue 가 요구하는 공통 헤더 (`apikey`) — 동의 화면도 같은 것을 쓴다 */
export function authHeaders(bearer?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
  };
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** epoch ms — 이 시각 이후 accessToken 만료 */
  expiresAt: number;
  userId: string;
  email: string;
}

/** GoTrue 사용자 — 필요한 칸만 */
export interface GoTrueIdentity {
  identity_id: string;
  provider: string;
  identity_data?: { email?: string; name?: string; full_name?: string; nickname?: string };
  created_at?: string;
}
export interface GoTrueUser {
  id: string;
  email?: string;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: { full_name?: string; name?: string; nickname?: string; avatar_url?: string };
  identities?: GoTrueIdentity[];
}

export class AuthError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface GoTrueTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id?: string; email?: string };
  /** 소셜(PKCE) 교환에서만 — 공급자(카카오·네이버…) 토큰. 세션에 넣지 않는다 */
  provider_token?: string;
}

async function goTrue<T>(
  path: string, body: unknown, bearer?: string, method = 'POST',
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(authUrl(path), {
      method,
      headers: authHeaders(bearer),
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AuthError(0, tr('auth.error.unreachable'));
  }
  if (!res.ok) {
    let msg = tr('auth.error.failed', { status: res.status });
    let errorCode: string | undefined;
    try {
      const j = (await res.json()) as { msg?: string; message?: string; error_description?: string; error_code?: string };
      errorCode = j.error_code;
      msg = j.error_description || j.msg || j.message || msg;
    } catch { /* 본문 없음 */ }
    // GoTrue 의 대표 오류를 사용자 언어로
    if (/invalid login credentials/i.test(msg)) msg = tr('auth.error.badCredentials');
    if (path === '/signup' && (errorCode === 'user_already_exists' || errorCode === 'email_exists'
        || /^(?:user already registered|email (?:address )?already (?:registered|exists))\.?$/i.test(msg))) {
      throw new AuthError(res.status, tr('auth.error.alreadyRegistered'), 'EMAIL_ALREADY_REGISTERED');
    }
    throw new AuthError(res.status, msg);
  }
  return (res.status === 204 ? undefined : res.json()) as Promise<T>;
}

function toSession(r: GoTrueTokenResponse, fallbackEmail: string): AuthSession {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000,
    userId: r.user?.id ?? '',
    email: r.user?.email ?? fallbackEmail,
  };
}

export const supabaseAuth = {
  /** 가입 — 이메일 확인이 꺼진 셀프호스팅 기본값에선 곧바로 세션이 온다 */
  async signUp(email: string, password: string): Promise<AuthSession | null> {
    const r = await goTrue<GoTrueTokenResponse & { id?: string; identities?: unknown[] }>('/signup', { email, password });
    // 이메일 확인이 켜져 있으면 세션 없이 사용자만 온다 → null (안내 필요)
    if (!r.access_token) {
      // GoTrue can obscure an already-confirmed signup with a synthetic user
      // and an explicitly empty identities array. Missing identities alone is not proof.
      if (r.id && Array.isArray(r.identities) && r.identities.length === 0) {
        throw new AuthError(409, tr('auth.error.alreadyRegistered'), 'EMAIL_ALREADY_REGISTERED');
      }
      if (!r.id) throw new AuthError(502, tr('auth.signup.failed'));
      return null;
    }
    return toSession(r, email);
  },

  async signIn(email: string, password: string): Promise<AuthSession> {
    const r = await goTrue<GoTrueTokenResponse>('/token?grant_type=password', { email, password });
    return toSession(r, email);
  },

  async refresh(refreshToken: string): Promise<AuthSession> {
    const r = await goTrue<GoTrueTokenResponse>('/token?grant_type=refresh_token', {
      refresh_token: refreshToken,
    });
    return toSession(r, '');
  },

  /**
   * 소셜 로그인 (2026-11-28) — 공급자에서 돌아온 코드 + 처음에 만든 검증 문자열(PKCE)로 세션을 받는다.
   * 코드만 훔쳐서는 세션을 못 받는다(검증 문자열은 이 탭의 sessionStorage 에만 있었다).
   */
  async exchangeCode(authCode: string, codeVerifier: string): Promise<AuthSession> {
    return (await supabaseAuth.exchangeSocialCode(authCode, codeVerifier)).session;
  },

  /**
   * 위와 같되 공급자 토큰도 돌려준다 — 휴대폰 번호 미리 채우기(socialPhone.ts)가 **한 번** 쓰고 버린다.
   * 세션(저장되는 것)에는 넣지 않는다.
   */
  async exchangeSocialCode(authCode: string, codeVerifier: string): Promise<{ session: AuthSession; providerToken: string | null }> {
    const r = await goTrue<GoTrueTokenResponse>('/token?grant_type=pkce', { auth_code: authCode, code_verifier: codeVerifier });
    const pt = typeof r.provider_token === 'string' && r.provider_token ? r.provider_token : null;
    return { session: toSession(r, ''), providerToken: pt };
  },

  /** 지금 사용자와 연결된 로그인 수단(identities) — 계정 프로필 > 로그인 연결 */
  async getUser(accessToken: string): Promise<GoTrueUser> {
    let res: Response;
    try {
      res = await fetch(authUrl('/user'), { headers: authHeaders(accessToken), cache: 'no-store' });
    } catch { throw new AuthError(0, tr('auth.error.unreachable')); }
    if (!res.ok) throw new AuthError(res.status, tr('auth.error.failed', { status: res.status }));
    return res.json() as Promise<GoTrueUser>;
  },

  /** 로그인 수단 하나 해제 — 마지막 하나는 GoTrue 가 거절한다(single_identity_not_deletable) */
  async unlinkIdentity(accessToken: string, identityId: string): Promise<void> {
    await goTrue<void>('/user/identities/' + encodeURIComponent(identityId), {}, accessToken, 'DELETE');
  },

  /** 서버 측 세션 무효화 — 실패해도 로컬 로그아웃은 진행한다 */
  /**
   * 비밀번호 변경 (2026-08-13). **지금 로그인한 사람의 것만** 바꾼다 —
   * GoTrue 가 액세스 토큰의 주인을 보고 처리하므로, 남의 비밀번호를
   * 이 길로 바꿀 수는 없다.
   *
   * 옛 비밀번호를 함께 묻지 않는 이유: GoTrue 의 `PUT /user` 가 받지
   * 않는다. 대신 **관리자 콘솔은 이미 2단계 인증을 지난 상태**라
   * 세션을 훔친 사람이 여기까지 오기 어렵다.
   */
  async updatePassword(accessToken: string, password: string): Promise<void> {
    await goTrue<void>('/user', { password }, accessToken, 'PUT');
  },

  /**
   * ★ **이 세션만** 끝낸다 (2026-09-27). 경로를 `/logout` 으로만 두면 GoTrue 기본
   *   `global` 이 되어 그 사용자의 세션이 **전부** 지워진다 — ChatGPT·claude.ai 가
   *   OAuth 로 받아 둔 세션까지. 그래서 앱에서 로그아웃할 때마다 AI 커넥터가
   *   "Refresh Token Not Found" 로 끊겼다(mcp-connector.md §12.10). logoutRules.ts.
   */
  async signOut(accessToken: string): Promise<void> {
    try {
      await goTrue<void>(LOGOUT_PATH, {}, accessToken);
    } catch { /* best-effort */ }
  },
};
