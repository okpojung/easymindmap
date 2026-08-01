// Supabase Auth(GoTrue) REST 클라이언트 — 이메일/비밀번호 로그인 (Phase 3).
//
// SDK(@supabase/supabase-js) 대신 가벼운 REST 직접 호출을 쓴다 — 필요한
// 것은 가입/로그인/갱신/로그아웃 4개뿐이고, 번들 크기와 의존을 줄인다.
// VITE_SUPABASE_URL 이 없으면 인증 비활성(개발 모드 — 백엔드 AUTH_MODE=dev).

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const authEnabled = SUPABASE_URL !== '';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  /** epoch ms — 이 시각 이후 accessToken 만료 */
  expiresAt: number;
  userId: string;
  email: string;
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

interface GoTrueTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { id?: string; email?: string };
}

async function goTrue<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AuthError(0, '인증 서버에 연결할 수 없습니다.');
  }
  if (!res.ok) {
    let msg = `인증 실패 (${res.status})`;
    try {
      const j = (await res.json()) as { msg?: string; message?: string; error_description?: string };
      msg = j.error_description || j.msg || j.message || msg;
    } catch { /* 본문 없음 */ }
    // GoTrue 의 대표 오류를 사용자 언어로
    if (/invalid login credentials/i.test(msg)) msg = '이메일 또는 비밀번호가 올바르지 않습니다.';
    if (/already registered/i.test(msg)) msg = '이미 가입된 이메일입니다. 로그인해 주세요.';
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
    const r = await goTrue<GoTrueTokenResponse & { id?: string }>('/signup', { email, password });
    // 이메일 확인이 켜져 있으면 세션 없이 사용자만 온다 → null (안내 필요)
    if (!r.access_token) return null;
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

  /** 서버 측 세션 무효화 — 실패해도 로컬 로그아웃은 진행한다 */
  async signOut(accessToken: string): Promise<void> {
    try {
      await goTrue<void>('/logout', {}, accessToken);
    } catch { /* best-effort */ }
  },
};
