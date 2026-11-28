// 소셜 로그인 — 카카오·네이버·구글 (2026-11-28 사용자 요청: "카카오·네이버·구글로 가입(계정 연결)하고 로그인").
//
// 흐름 (PKCE — 코드만 가로채서는 세션을 못 받는다):
//   1) 버튼 → 검증 문자열(verifier)을 만들어 이 탭 sessionStorage 에 두고,
//      그 해시(challenge)를 붙여 GoTrue /authorize?provider=… 로 보낸다.
//   2) 공급자 로그인·동의 → GoTrue /callback → 앱 /auth/callback?code=…
//   3) SocialCallbackPage 가 code + verifier 로 /token?grant_type=pkce → 세션.
// 계정 연결(로그인한 상태에서 [연결])은 /user/identities/authorize 로 같은 흐름을 탄다.
//
// 공급자 이름: 구글·카카오·Microsoft(azure)는 GoTrue 기본 공급자, 네이버는 커스텀 공급자 'custom:naver'.
// Microsoft 는 이메일을 받으려면 scopes=email 을 붙여야 한다(GoTrue 기본은 openid 만).
import { authUrl, authHeaders, AuthError } from './supabaseAuth';
import { tr } from '@/i18n';

export type SocialId = 'kakao' | 'naver' | 'google' | 'microsoft';
/** 화면 순서 — 2026-08-04 사용자 결정 (카카오 → 네이버 → Google) */
// 2026-11-28 Microsoft(Office 365·Outlook 계정) 추가 — 네 번째
export const SOCIAL_IDS: SocialId[] = ['kakao', 'naver', 'google', 'microsoft'];
export const GOTRUE_PROVIDER: Record<SocialId, string> = { kakao: 'kakao', naver: 'custom:naver', google: 'google', microsoft: 'azure' };

/** GoTrue 의 공급자 이름 → 우리 이름 (이메일 등은 null) */
export function socialIdOf(provider: string | undefined): SocialId | null {
  const p = String(provider ?? '').toLowerCase();
  if (p === 'kakao') return 'kakao';
  if (p === 'google') return 'google';
  if (p === 'azure' || p === 'microsoft') return 'microsoft';
  if (p === 'custom:naver' || p === 'naver') return 'naver';
  return null;
}

export const CALLBACK_PATH = '/auth/callback';
/** 연결을 마치고 돌아왔다는 안내 (콜백 → 계정 프로필) */
export const LINK_NOTICE_KEY = 'emm.social.notice.v1';
export function callbackUrl(origin = window.location.origin): string { return origin + CALLBACK_PATH; }

/** 돌아갈 자리 — **같은 사이트의 상대 경로만** (열린 리디렉션 방지). 콜백 자신은 안 된다 */
export function safeReturnTo(path: string | null | undefined): string {
  const p = String(path ?? '');
  if (!p.startsWith('/') || p.startsWith('//') || p.startsWith('/\\') || /[\r\n]/.test(p)) return '/';
  if (p === CALLBACK_PATH || p.startsWith(CALLBACK_PATH + '?') || p.startsWith(CALLBACK_PATH + '/')) return '/';
  return p.slice(0, 2000);
}

const b64url = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
/** PKCE 검증 문자열 — 64바이트 난수(86자, RFC 7636 허용 문자만) */
export function makeVerifier(): string {
  const a = new Uint8Array(64);
  crypto.getRandomValues(a);
  return b64url(a);
}
export async function pkceChallenge(verifier: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

export interface PendingSocial {
  v: string;
  provider: SocialId;
  mode: 'login' | 'link';
  returnTo: string;
  at: number;
  /** 연결이면 시작한 계정 — 돌아왔을 때 다른 계정이면 받지 않는다 */
  userId?: string;
}
const PENDING_KEY = 'emm.social.pending.v1';
const PENDING_TTL = 15 * 60_000;

export function savePending(p: PendingSocial, store: Storage = window.sessionStorage): void {
  store.setItem(PENDING_KEY, JSON.stringify(p));
}
/** 한 번만 꺼낸다 — 꺼내면 지운다. 15분이 지났거나 모양이 틀리면 null */
export function takePending(now = Date.now(), store: Storage = window.sessionStorage): PendingSocial | null {
  const raw = store.getItem(PENDING_KEY);
  store.removeItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PendingSocial;
    if (!p || typeof p.v !== 'string' || p.v.length < 43 || !SOCIAL_IDS.includes(p.provider)) return null;
    if (p.mode !== 'login' && p.mode !== 'link') return null;
    if (typeof p.at !== 'number' || now - p.at > PENDING_TTL || p.at > now + 60_000) return null;
    return { ...p, returnTo: safeReturnTo(p.returnTo) };
  } catch { return null; }
}

export interface CallbackParams { code?: string; error?: string; errorCode?: string; description?: string }
/** 콜백 주소에서 값 읽기 — PKCE 는 ?code=, 오류는 ? 또는 # 에 온다 */
export function parseCallback(search: string, hash: string): CallbackParams {
  const q = new URLSearchParams(search.replace(/^\?/, ''));
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const get = (k: string) => q.get(k) ?? h.get(k) ?? undefined;
  const code = get('code');
  return {
    ...(code && /^[A-Za-z0-9\-._~]{8,512}$/.test(code) ? { code } : {}),
    ...(get('error') ? { error: String(get('error')).slice(0, 100) } : {}),
    ...(get('error_code') ? { errorCode: String(get('error_code')).slice(0, 100) } : {}),
    ...(get('error_description') ? { description: String(get('error_description')).slice(0, 300) } : {}),
  };
}

/** 사용자가 읽을 오류 — 공급자에서 취소한 것은 취소라고 말한다 */
export function callbackErrorMessage(p: CallbackParams): string {
  const all = `${p.error ?? ''} ${p.errorCode ?? ''} ${p.description ?? ''}`.toLowerCase();
  if (/access_denied|cancel|user_denied|consent/.test(all)) return tr('auth.social.cancelled');
  if (/identity.*already|already.*linked|identity_already_exists/.test(all)) return tr('auth.social.alreadyLinked');
  if (/manual_linking_disabled/.test(all)) return tr('auth.social.linkDisabled');
  if (/email.*(provider|external)|email_not_found|missing email/.test(all)) return tr('auth.social.noEmail');
  if (/signup.*disabled|signups not allowed/.test(all)) return tr('auth.social.signupDisabled');
  return tr('auth.social.failed');
}

/** 공급자 로그인·가입 화면으로 보낸다 (돌아오지 않는다) */
export async function beginSocial(provider: SocialId, opts: {
  mode?: 'login' | 'link'; accessToken?: string; userId?: string; returnTo?: string;
} = {}): Promise<void> {
  const mode = opts.mode ?? 'login';
  const v = makeVerifier();
  const challenge = await pkceChallenge(v);
  const returnTo = safeReturnTo(opts.returnTo ?? window.location.pathname + window.location.search);
  savePending({ v, provider, mode, returnTo, at: Date.now(), ...(opts.userId ? { userId: opts.userId } : {}) });
  const qs = new URLSearchParams({
    provider: GOTRUE_PROVIDER[provider],
    redirect_to: callbackUrl(),
    code_challenge: challenge,
    code_challenge_method: 's256',
  });
  if (provider === 'microsoft') qs.set('scopes', 'email profile');
  if (mode === 'login') {
    window.location.assign(authUrl('/authorize?' + qs.toString()));
    return;
  }
  // 계정 연결 — 로그인한 사람의 토큰으로 연결 주소를 받아 간다
  if (!opts.accessToken) throw new AuthError(401, tr('cloud.err.loginRequired'));
  qs.set('skip_http_redirect', 'true');
  let res: Response;
  try {
    res = await fetch(authUrl('/user/identities/authorize?' + qs.toString()), { headers: authHeaders(opts.accessToken) });
  } catch { throw new AuthError(0, tr('auth.error.unreachable')); }
  let body: { url?: string; msg?: string; error_code?: string } = {};
  try { body = await res.json(); } catch { /* 본문 없음 */ }
  if (!res.ok || !body.url) {
    throw new AuthError(res.status, callbackErrorMessage({ errorCode: body.error_code, description: body.msg }));
  }
  window.location.assign(body.url);
}

export type SocialAvailability = Record<SocialId, boolean>;
let availability: Promise<SocialAvailability> | null = null;
/**
 * 켜진 공급자 — 구글·카카오는 GoTrue /settings, 네이버(커스텀)는 EMM API /v1/auth/social.
 * 한 번만 묻는다(실패하면 다음에 다시). 꺼진 것은 '준비 중'으로 보인다.
 */
export function loadSocialAvailability(): Promise<SocialAvailability> {
  if (availability) return availability;
  const none: SocialAvailability = { kakao: false, naver: false, google: false, microsoft: false };
  availability = (async () => {
    const out = { ...none };
    try {
      const r = await fetch(authUrl('/settings'), { headers: authHeaders(), cache: 'no-store' });
      if (r.ok) {
        const s = (await r.json()) as { external?: Record<string, boolean> };
        out.google = s.external?.google === true;
        out.kakao = s.external?.kakao === true;
        out.microsoft = s.external?.azure === true;
        out.naver = s.external?.['custom:naver'] === true || s.external?.naver === true;
      }
    } catch { /* 인증 서버에 못 닿으면 모두 꺼진 것으로 */ }
    if (!out.naver) {
      try {
        const { cloudApi } = await import('./apiClient');
        out.naver = (await cloudApi.socialProviders()).naver === true;
      } catch { /* 옛 API — 네이버 없음 */ }
    }
    return out;
  })();
  availability.then((a) => { if (!a.google && !a.kakao && !a.naver && !a.microsoft) availability = null; }, () => { availability = null; });
  return availability;
}

/** 액세스 토큰(JWT)에서 로그인 수단 — 'email' · 'kakao' · 'google' · 'custom:naver' … (서명 확인은 서버가 한다) */
export function sessionProvider(accessToken: string | undefined): string | null {
  try {
    const part = String(accessToken ?? '').split('.')[1];
    if (!part) return null;
    const json = JSON.parse(decodeURIComponent(escape(atob(part.replace(/-/g, '+').replace(/_/g, '/')))));
    const p = json?.app_metadata?.provider;
    return typeof p === 'string' ? p : null;
  } catch { return null; }
}
