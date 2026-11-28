/**
 * 네이버 로그인 사용자정보 → 표준(OIDC) 모양 (2026-11-28 소셜 로그인).
 *
 * GoTrue 는 네이버를 기본 공급자로 두지 않아 '커스텀 공급자(custom:naver)'로 붙인다.
 * 그런데 네이버의 사용자정보 응답은 `{ resultcode, message, response: { id, email, … } }`
 * 처럼 한 겹 감싸여 있어 GoTrue 가 `sub`·`email` 을 찾지 못한다. 그래서 GoTrue 가
 * 사용자정보를 물을 곳을 이 API 로 두고, 여기서 네이버에 대신 묻고 표준 모양으로 돌려준다.
 *
 * ★ email_verified — 같은 이메일의 기존 계정에 **자동으로 연결되는 기준**이다.
 *   네이버의 '연락처 이메일'은 네이버 주소가 아닐 수 있고 그 소유를 우리가 확인할 수 없다.
 *   그래서 네이버 메일(@naver.com)만 확인된 것으로 본다 — 남의 이메일을 적어 둔 네이버
 *   계정으로 그 이메일의 EMM 계정에 들어가는 길을 막는다.
 */
export interface NaverProfileResponse {
  resultcode?: string;
  message?: string;
  response?: {
    id?: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
  };
}

export interface StandardUserInfo {
  sub: string;
  email?: string;
  email_verified: boolean;
  name?: string;
  nickname?: string;
  picture?: string;
}

const clean = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
};

export function naverToStandard(raw: NaverProfileResponse): StandardUserInfo | null {
  if (!raw || raw.resultcode !== '00' || !raw.response) return null;
  const r = raw.response;
  const sub = clean(r.id, 200);
  if (!sub) return null;
  const email = clean(r.email, 254)?.toLowerCase();
  const validEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
  const picture = clean(r.profile_image, 1000);
  return {
    sub,
    ...(validEmail ? { email: validEmail } : {}),
    email_verified: !!validEmail && validEmail.endsWith('@naver.com'),
    ...(clean(r.name, 100) ? { name: clean(r.name, 100) } : {}),
    ...(clean(r.nickname, 100) ? { nickname: clean(r.nickname, 100) } : {}),
    ...(picture && /^https:\/\//.test(picture) ? { picture } : {}),
  };
}

/** 네이버 액세스 토큰 모양 — 헤더 끼워 넣기를 막는다 (영문·숫자·-._~+/= 만) */
export function bearerToken(header: string | string[] | undefined): string | null {
  const h = Array.isArray(header) ? header[0] : header;
  const m = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/.exec(String(h ?? '').trim());
  return m && m[1].length <= 2048 ? m[1] : null;
}
