// 홈페이지(www) 출처 허용 — **로그인이 필요 없는 경로만** (2026-10-23, 홈페이지 개편).
//
// 앱(web) 출처는 `CORS_ORIGIN` 으로 전체 API 를 쓴다(쿠키·인증 헤더 포함, 예전 그대로).
// 홈페이지 출처는 아래 목록의 공개 읽기와 문의 보내기만 — 인증 정보(credentials)는 허용하지
// 않는다. www 에서는 로그인하지 않는다(로그인이 필요한 일은 앱으로 보낸다, 사용자 결정).
//
// www 출처는 `WWW_ORIGIN`(콤마로 여럿) 이 있으면 그것, 없으면 `PUBLIC_APP_URL` 이
// `https://web.<도메인>` 일 때 `https://www.<도메인>` 으로 정한다(운영은 설정 추가 없음).

const PUBLIC_ROUTES: { method: string; re: RegExp }[] = [
  { method: 'GET', re: /^\/v1\/published(?:\/.*)?$/ },
  { method: 'GET', re: /^\/v1\/notices\/recent$/ },
  { method: 'GET', re: /^\/v1\/board\/posts(?:\/[^/]+(?:\/comments)?)?$/ },
  { method: 'POST', re: /^\/v1\/inquiries$/ },
];

export function wwwOriginsFrom(env: { WWW_ORIGIN?: string; PUBLIC_APP_URL?: string }): string[] {
  const explicit = String(env.WWW_ORIGIN ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (explicit.length) return explicit;
  try {
    const u = new URL(String(env.PUBLIC_APP_URL ?? ''));
    if (u.protocol === 'https:' && u.hostname.startsWith('web.')) return [`https://www.${u.hostname.slice(4)}`];
  } catch { /* 주소가 없으면 홈페이지 출처도 없다 */ }
  return [];
}

/** 이 요청이 홈페이지에 열어 둔 공개 경로인가 (사전 요청 OPTIONS 는 실제로 보낼 메서드로 본다) */
export function isWwwPublicRoute(method: string, url: string, requestedMethod?: string): boolean {
  const m = String(method).toUpperCase() === 'OPTIONS' ? String(requestedMethod ?? '').toUpperCase() : String(method).toUpperCase();
  const path = String(url ?? '').split('?')[0];
  return PUBLIC_ROUTES.some((r) => r.method === m && r.re.test(path));
}
