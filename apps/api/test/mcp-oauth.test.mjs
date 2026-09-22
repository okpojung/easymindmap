// MCP 3단계(OAuth) 자원 서버 계층 단위 테스트 (2026-09-06).
//
//   npm run build && npm run test:mcp
//
// ★ 왜 시험하나 — **여기가 틀리면 클라이언트가 "연결할 수 없습니다" 한
// 줄만 보여 준다.** claude.ai 커넥터는 401 의 `WWW-Authenticate` 를 읽고
// 인가 서버를 찾아가는데, 그 헤더가 없거나 깨지면 사용자는 왜 안 되는지
// 알 길이 없다. 서버 로그에도 "401 을 줬다" 밖에 안 남는다.
//
// 규격: MCP 인증(2026-07-28) · RFC 9728 · RFC 6750
// 설계: docs/04-extensions/ai/mcp-connector.md §11

import {
  AS_METADATA_SUFFIX, AUTHORIZE_PATH, MCP_SCOPES, MCP_SCOPE_STRING, OIDC_DISCOVERY_SUFFIX, PRM_SUFFIX,
  authorizationServerMetadata, looksLikeJwt,
  mcpResourceUri, prmUrl, protectedResourceMetadata, requestOrigin, rewriteAuthorizeUrl, stripOpenId,
  wwwAuthenticate,
} from '../dist/mcp/oauth.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const ORIGIN = 'https://api-dev.example.com';

// ── ① 정규 URI — 끝의 '/' 를 붙이지 않는다 (규격 권고) ──────────────
check('자원 URI', mcpResourceUri(ORIGIN), 'https://api-dev.example.com/v1/mcp');
check('끝의 / 는 없앤다', mcpResourceUri(ORIGIN + '///'), 'https://api-dev.example.com/v1/mcp');
check('메타데이터 주소는 경로를 끼운 형태',
  prmUrl(ORIGIN), `${ORIGIN}/${PRM_SUFFIX}/v1/mcp`);

// ── ② RFC 9728 문서 ────────────────────────────────────────────────
{
  const m = protectedResourceMetadata(ORIGIN, 'https://auth-dev.example.com/');
  check('resource 가 자원 URI 와 같다', m.resource, mcpResourceUri(ORIGIN));
  check('★ authorization_servers 가 비면 안 된다', m.authorization_servers.length >= 1, true);
  check('인가 서버 주소 끝의 / 를 없앤다',
    m.authorization_servers, ['https://auth-dev.example.com']);
  check('scopes_supported', m.scopes_supported, ['email']);
  // ★★ `openid` 를 **광고하면 안 된다** — 넣으면 연결이 끊긴다 (2026-09-07 실측).
  //    claude.ai 는 이 목록을 그대로 읽어 요청하고, GoTrue 는 scope 에
  //    openid 가 있으면 ID 토큰을 만들려다 **HS256 이라 500** 을 낸다
  //    (handlers.go:443 · tokens/service.go:778). oauth.ts 머리말 참조.
  check('★ openid 는 광고하지 않는다 (HS256 + ID 토큰 = 500)',
    m.scopes_supported.includes('openid'), false);
  check('★ offline_access 도 광고하지 않는다 (규격 SHOULD NOT)',
    m.scopes_supported.includes('offline_access'), false);
  // 규격: "MCP Servers SHOULD NOT include `offline_access` in ...
  //        Protected Resource Metadata `scopes_supported`"
  check('★ offline_access 는 넣지 않는다',
    m.scopes_supported.includes('offline_access'), false);
  check('헤더로만 받는다', m.bearer_methods_supported, ['header']);
}

// ── ③ WWW-Authenticate — 클라이언트가 실제로 읽는 자리 ───────────────
{
  const h = wwwAuthenticate(ORIGIN);
  check('★ resource_metadata 가 들어 있다',
    h.includes(`resource_metadata="${prmUrl(ORIGIN)}"`), true);
  check('scope 가 들어 있다', h.includes(`scope="${MCP_SCOPE_STRING}"`), true);
  // RFC 6750 §3.1 — 요청에 인증 정보가 없었으면 error 를 붙이지 않는다
  check('★ 토큰이 없을 때는 error 를 붙이지 않는다', h.includes('error='), false);

  const bad = wwwAuthenticate(ORIGIN, { error: 'invalid_token', description: 'nope' });
  check('토큰이 틀렸을 때만 error', bad.includes('error="invalid_token"'), true);
  check('설명도 함께', bad.includes('error_description="nope"'), true);
}

// ── ④ ★★ 헤더에 넣으면 안 되는 글자 — 여기서 500 이 났다 ────────────
// 실측(2026-09-06): 한국어 설명을 넣었더니 Node 의 setHeader 가
// ERR_INVALID_CHAR 로 던져 **401 이 500 이 됐다.** 규격도 같은 것을
// 요구한다(RFC 6750 §3: %x20-21 / %x23-5B / %x5D-7E).
{
  const cases = [
    ['한글', '토큰이 유효하지 않습니다'],
    ['따옴표', 'say "hi"'],
    ['역슬래시', 'a\\b'],
    ['개행', 'line1\nline2'],
    ['이모지', 'bad \u{1F600} token'],
    ['탭', 'a\tb'],
  ];
  for (const [label, desc] of cases) {
    const h = wwwAuthenticate(ORIGIN, { error: 'invalid_token', description: desc });
    // latin1 로 왕복해도 그대로여야 = 헤더에 실을 수 있다
    const safe = Buffer.from(h, 'latin1').toString('latin1') === h
      && !/[^\x20-\x7e]/.test(h) && !h.includes('\\');
    check(`★ ${label} 을 넣어도 헤더로 안전하다`, safe, true);
  }
  const h = wwwAuthenticate(ORIGIN, { error: 'invalid_token', description: '한글 only' });
  check('  못 쓰는 글자는 지우고 나머지는 남긴다',
    /error_description="only"/.test(h), true);
  const long = wwwAuthenticate(ORIGIN, { error: 'invalid_token', description: 'x'.repeat(400) });
  check('  너무 길면 자른다', long.length < 500, true);
}

// ── ⑤ 자기 주소 알아내기 ───────────────────────────────────────────
{
  const req = { protocol: 'https', get: (h) => (h === 'host' ? 'api-dev.example.com' : undefined) };
  check('요청에서 알아낸다', requestOrigin(req), 'https://api-dev.example.com');
  check('★ 못 박은 값이 이긴다', requestOrigin(req, 'https://forced.example.com'),
    'https://forced.example.com');
  check('빈 문자열은 무시한다', requestOrigin(req, '   '), 'https://api-dev.example.com');
  check('host 가 없어도 죽지 않는다', requestOrigin({ protocol: 'http' }), 'http://localhost');
}

// ── ⑥ ★ JWT 모양 가르기 — **틀린 진단을 막는 자리** ────────────────
// 실측(2026-09-06): `.mcp.json` 의 `Bearer ${EMM_MCP_TOKEN}` 이 환경 변수
// 없이 **자리표시 그대로** 나갔는데, 서버가 "OAuth 커넥터가 설정되지
// 않았습니다" 라고 답했다 — 원인은 토큰인데 서버를 탓하는 안내다.
{
  const jwtish = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln';
  check('진짜 JWT 모양', looksLikeJwt(jwtish), true);
  check('★ 자리표시가 그대로 온 경우', looksLikeJwt('${EMM_MCP_TOKEN}'), false);
  check('★ 빈 자리표시', looksLikeJwt('Bearer ${EMM_MCP_TOKEN}'), false);
  check('점이 없다', looksLikeJwt('emm_abcdefghijklmnop'), false);
  check('조각이 둘뿐', looksLikeJwt('aaa.bbb'), false);
  check('조각이 넷', looksLikeJwt('a.b.c.d'), false);
  check('빈 조각이 있다', looksLikeJwt('a..c'), false);
  check('base64url 밖 글자(+/=)', looksLikeJwt('a+b.c/d.e=f'), false);
  check('공백이 섞였다', looksLikeJwt('aaa.bb b.ccc'), false);
  check('빈 문자열', looksLikeJwt(''), false);
}

check('scope 는 상수와 문자열이 같다', MCP_SCOPE_STRING, MCP_SCOPES.join(' '));


// ── 인가 서버 겉면 (2026-09-22, §12.6) — ChatGPT 가 붙이는 openid 를 우리 authorize 가 뗀다 ──
check('stripOpenId: openid 만 뗀다', stripOpenId('openid email'), 'email');
check('stripOpenId: 순서·다른 scope 는 그대로', stripOpenId('profile openid email'), 'profile email');
check('stripOpenId: 비면 기본 scope', stripOpenId('openid'), MCP_SCOPE_STRING);
check('stripOpenId: undefined 도 기본 scope', stripOpenId(undefined), MCP_SCOPE_STRING);
check('stripOpenId: 공백 여러 개', stripOpenId('  openid   email  '), 'email');

const GOTRUE = 'https://auth-dev.example.com/';
const q = {
  response_type: 'code', client_id: 'abc', redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
  scope: 'openid email', state: 's1', code_challenge: 'cc', code_challenge_method: 'S256',
  resource: 'https://api-dev.example.com/v1/mcp',
};
const u = new URL(rewriteAuthorizeUrl(GOTRUE, q));
check('authorize: GoTrue 의 /oauth/authorize 로', u.origin + u.pathname, 'https://auth-dev.example.com/oauth/authorize');
check('authorize: scope 에서 openid 만 뗐다', u.searchParams.get('scope'), 'email');
check('authorize: 나머지 파라미터는 그대로 (PKCE·state·resource·redirect_uri)',
  ['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource'].map((k) => u.searchParams.get(k)),
  ['code', 'abc', 'https://chatgpt.com/connector_platform_oauth_redirect', 's1', 'cc', 'S256', 'https://api-dev.example.com/v1/mcp']);
check('authorize: scope 가 없으면 기본 scope 를 넣는다', new URL(rewriteAuthorizeUrl(GOTRUE, { client_id: 'x' })).searchParams.get('scope'), MCP_SCOPE_STRING);
check('authorize: 같은 키가 여럿이면 첫 값', new URL(rewriteAuthorizeUrl(GOTRUE, { scope: ['openid email', 'profile'] })).searchParams.get('scope'), 'email');
check('authorize: undefined 값은 건너뛴다', new URL(rewriteAuthorizeUrl(GOTRUE, { scope: 'email', nonce: undefined })).searchParams.has('nonce'), false);

const upstream = {
  issuer: 'https://auth-dev.example.com',
  authorization_endpoint: 'https://auth-dev.example.com/oauth/authorize',
  token_endpoint: 'https://auth-dev.example.com/oauth/token',
  registration_endpoint: 'https://auth-dev.example.com/oauth/clients/register',
  jwks_uri: 'https://auth-dev.example.com/.well-known/jwks.json',
  userinfo_endpoint: 'https://auth-dev.example.com/oauth/userinfo',
  scopes_supported: ['openid', 'email', 'profile'],
  response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
  code_challenge_methods_supported: ['S256', 'plain'],
  id_token_signing_alg_values_supported: ['RS256', 'HS256', 'ES256'], subject_types_supported: ['public'], claims_supported: ['sub'],
};
const facade = authorizationServerMetadata(upstream, ORIGIN + '/');
check('겉면: issuer 는 우리 주소 (끝 / 없이)', facade.issuer, ORIGIN);
check('겉면: authorization_endpoint 는 우리 /v1/oauth/authorize', facade.authorization_endpoint, `${ORIGIN}/${AUTHORIZE_PATH}`);
check('겉면: 토큰·등록·JWKS 는 GoTrue 그대로',
  [facade.token_endpoint, facade.registration_endpoint, facade.jwks_uri],
  [upstream.token_endpoint, upstream.registration_endpoint, upstream.jwks_uri]);
check('겉면: scopes_supported 에서 openid 를 뺀다', facade.scopes_supported, ['email', 'profile']);
check('겉면: OIDC 전용 항목은 뺀다',
  ['userinfo_endpoint', 'id_token_signing_alg_values_supported', 'subject_types_supported', 'claims_supported'].map((k) => k in facade),
  [false, false, false, false]);
check('겉면: PKCE·grant·auth method 목록은 그대로',
  [facade.code_challenge_methods_supported, facade.grant_types_supported, facade.token_endpoint_auth_methods_supported],
  [upstream.code_challenge_methods_supported, upstream.grant_types_supported, upstream.token_endpoint_auth_methods_supported]);
check('겉면: scopes_supported 가 없으면 우리 기본', authorizationServerMetadata({ token_endpoint: 't' }, ORIGIN).scopes_supported, [...MCP_SCOPES]);
check('겉면 문서 자리 둘', [AS_METADATA_SUFFIX, OIDC_DISCOVERY_SUFFIX], ['.well-known/oauth-authorization-server', '.well-known/openid-configuration']);
check('PRM 이 겉면(우리 주소)을 인가 서버로 알린다', protectedResourceMetadata(ORIGIN, ORIGIN).authorization_servers, [ORIGIN]);

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
