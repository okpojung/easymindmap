/**
 * MCP 3단계 — 우리는 **자원 서버(resource server)** 다.
 * 설계: docs/04-extensions/ai/mcp-connector.md §10
 *
 * ★ 규격을 실제로 읽고 적는다 (2026-09-06, §8 ①이 요구한 확인)
 *   MCP 인증 규격(최신 released: **2026-07-28**)은 역할을 이렇게 가른다.
 *
 *     인가 서버(authorization server) = 로그인시키고 토큰을 발급한다
 *                                       → **규격 범위 밖**이고, 자원 서버와
 *                                         **별개여도 된다**
 *     자원 서버(resource server)       = 그 토큰을 받아 검증한다 = **우리**
 *
 *   그래서 우리가 만들 것은 인가 서버가 아니라 **자원 서버 쪽**이다.
 *   규격이 우리에게 요구하는 것은 셋뿐이다.
 *
 *     ① RFC 9728 보호 자원 메타데이터를 **반드시** 낸다
 *        ("MCP servers **MUST** implement OAuth 2.0 Protected Resource
 *          Metadata (RFC9728)")
 *     ② 401 에 `WWW-Authenticate` 로 그 메타데이터 주소를 알린다
 *        (RFC 9728 §5.1 — 클라이언트는 이 헤더로 인가 서버를 찾아간다)
 *     ③ 토큰을 검증하고, **우리 것으로 발급된 토큰만** 받는다
 *
 * ★ 인가 서버는 이미 있다 — **GoTrue** (실측 2026-09-06)
 *   설계 문서 §3 은 "GoTrue 는 OAuth 제공자가 아니다 → 우리가 세워야 하고
 *   그것이 가장 큰 덩어리" 라고 적어 두었다. **그 전제가 지금은 틀리다.**
 *   dev 의 GoTrue v2.194.0 에 물어보니 OAuth 서버가 **들어 있고 꺼져 있을
 *   뿐**이었다(`{"error_code":"feature_disabled","msg":"OAuth server is
 *   disabled"}`). 소스를 확인한 결과 authorization_code + refresh_token ·
 *   PKCE(S256) · 동적 클라이언트 등록 · `resource` 파라미터를 지원한다.
 *   그래서 3단계의 큰 덩어리는 **우리가 만드는 것이 아니라 켜는 것**이다.
 */

/**
 * ⚠️ **GoTrue 는 커스텀 scope 를 지원하지 않는다** (실측 — `oauth_scope.go`
 * 의 `SupportedOAuthScopes`). 쓸 수 있는 것은 OIDC 표준 다섯뿐이라
 * `emm:maps` 같은 것을 만들 수 없다. 그래서 우리가 요구하는 scope 는
 * 표준 조합이다.
 *
 * `offline_access` 는 **일부러 뺀다** — 규격이 그렇게 말한다: "MCP Servers
 * (Protected Resources) **SHOULD NOT** include `offline_access` in
 * `WWW-Authenticate` scope or Protected Resource Metadata
 * `scopes_supported`, as refresh tokens are not a resource requirement."
 *
 * ★★ `openid` 도 **뺀다** — 넣으면 **연결이 끊긴다** (2026-09-07 실측).
 *
 *   처음에는 `['openid','email']` 이었다. claude.ai 는 이 목록을 그대로
 *   읽어 `scope=openid email` 로 인가를 요청했고, 사용자가 [허용] 을 누른
 *   뒤 **토큰 교환에서 500** 이 났다:
 *
 *     {"error_code":"unexpected_failure","msg":"Error generating ID token"}
 *
 *   GoTrue 는 scope 에 `openid` 가 있으면 **ID 토큰을 함께 만들려 하는데**
 *   (`api/oauthserver/handlers.go:443` — `HasScope(…, ScopeOpenID)`),
 *   **HS256 으로는 ID 토큰을 만들지 못한다**:
 *
 *     // tokens/service.go:778
 *     if signingMethod == jwt.SigningMethodHS256 {
 *         return "", fmt.Errorf("HS256 is not supported for ID token signing")
 *     }
 *
 *   우리 GoTrue 는 대칭키 하나(`GOTRUE_JWT_SECRET`)로 HS256 서명을 한다.
 *   그래서 `openid` 를 요구하는 순간 **반드시** 실패한다.
 *
 *   ★ **왜 GoTrue 를 비대칭키로 바꾸지 않나** — 그러면 **액세스 토큰 서명까지**
 *     RS256 으로 바뀐다. 우리 API 의 두 가드가 모두 HS256 으로 검증하고
 *     있으므로 **살아 있는 로그인이 전부 끊긴다.** 고치는 값이 훨씬 크다.
 *
 *   ★ **`openid` 가 없어도 아쉬울 것이 없다** — MCP 에 ID 토큰은 필요 없다.
 *     우리가 쓰는 것은 **액세스 토큰의 `sub`·`email`·`client_id`** 뿐이고
 *     그 셋은 scope 와 무관하게 늘 들어 있다(`v0hooks.go:100~112`).
 */
export const MCP_SCOPES = ['email'] as const;
export const MCP_SCOPE_STRING = MCP_SCOPES.join(' ');

/** RFC 9728 이 정한 well-known 접미사 */
export const PRM_SUFFIX = '.well-known/oauth-protected-resource';

/**
 * 우리 MCP 엔드포인트의 **정규 URI**. 클라이언트가 `resource` 파라미터로
 * 보내는 값이고, 메타데이터의 `resource` 와 같아야 한다.
 *
 * 규격 권고대로 **끝의 `/` 를 붙이지 않는다** — "implementations **SHOULD**
 * consistently use the form without the trailing slash".
 */
export function mcpResourceUri(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/v1/mcp`;
}

/**
 * 보호 자원 메타데이터가 놓이는 주소. 규격은 두 자리를 인정하는데
 * (뿌리 / 경로를 끼운 형태), **경로를 끼운 쪽**을 알린다 — 한 도메인에
 * 자원이 여럿일 때도 어긋나지 않는 쪽이다.
 *   `https://api.example.com/v1/mcp`
 *   → `https://api.example.com/.well-known/oauth-protected-resource/v1/mcp`
 */
export function prmUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/${PRM_SUFFIX}/v1/mcp`;
}

/** RFC 9728 문서. `authorization_servers` 는 **최소 하나**가 있어야 한다 */
export function protectedResourceMetadata(
  origin: string, authorizationServer: string,
): Record<string, unknown> {
  return {
    resource: mcpResourceUri(origin),
    authorization_servers: [authorizationServer.replace(/\/+$/, '')],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'EasyMindMap MCP',
    resource_documentation:
      'https://github.com/okpojung/easymindmap/blob/main/docs/04-extensions/ai/mcp-connector.md',
  };
}

/**
 * 401 에 실을 `WWW-Authenticate` 값.
 *
 * `resource_metadata` 가 **이 헤더의 핵심**이다 — 클라이언트는 401 본문이
 * 아니라 이 값을 보고 인가 서버를 찾아간다. 빠지면 claude.ai 커넥터가
 * "연결할 수 없습니다" 한 줄로 끝난다.
 *
 * `error` 는 **토큰을 받았는데 틀린 경우에만** 붙인다 — 토큰이 아예 없을
 * 때 붙이면 클라이언트가 "고쳐도 안 되는 오류" 로 읽을 수 있다
 * (RFC 6750 §3.1: error 는 요청에 인증 정보가 있었을 때 쓴다).
 */
export function wwwAuthenticate(
  origin: string, opts: { error?: 'invalid_token'; description?: string } = {},
): string {
  const parts = [
    'Bearer realm="EasyMindMap MCP"',
    `resource_metadata="${prmUrl(origin)}"`,
    `scope="${MCP_SCOPE_STRING}"`,
  ];
  if (opts.error) {
    parts.push(`error="${opts.error}"`);
    if (opts.description) parts.push(`error_description="${escapeQuoted(opts.description)}"`);
  }
  return parts.join(', ');
}

/**
 * 이 문자열이 **JWT 모양이나 되는가** — 점 두 개로 갈린 세 조각.
 *
 * ★ 왜 필요한가 — **틀린 진단을 하지 않기 위해서다** (2026-09-06 실측).
 *   `emm_` 로 시작하지 않는 토큰을 곧바로 "OAuth 토큰" 으로 보고 다루면,
 *   **PAT 을 잘못 넣은 사람에게 "서버가 OAuth 를 설정하지 않았다" 고
 *   말하게 된다.** 원인은 그 사람의 토큰인데 서버를 탓하는 안내다.
 *
 *   실제로 그렇게 겪었다: `.mcp.json` 의 `Bearer ${EMM_MCP_TOKEN}` 이
 *   환경 변수가 없어 **자리표시 그대로** 나갔고, 서버는 "OAuth 커넥터가
 *   설정되지 않았습니다" 라고 답했다. 사용자가 할 일은 환경 변수 한 줄인데
 *   그 문장은 서버 설정을 보라고 가리킨다.
 *
 *   그래서 **모양부터 가른다.** JWT 도 아니고 `emm_` 도 아니면, 그것은
 *   OAuth 이야기가 아니라 **토큰이 잘못 들어온 것**이다.
 */
export function looksLikeJwt(raw: string): boolean {
  const parts = raw.split('.');
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}
/**
 * `error_description` 에 넣어도 되는 글자만 남긴다.
 *
 * ★ **한글을 넣으면 서버가 500 으로 죽는다** (실측 2026-09-06).
 *   HTTP 헤더 값은 latin1 이라 Node 의 `setHeader` 가 비 ASCII 를
 *   `ERR_INVALID_CHAR` 로 거절한다 — 그러면 401 을 주려던 자리가 500 이
 *   되고, 클라이언트는 **인증하라는 말 대신 서버 오류**를 본다.
 *   RFC 6750 §3 도 같은 것을 요구한다: `%x20-21 / %x23-5B / %x5D-7E`
 *   (= 출력 가능한 ASCII 에서 `"` 와 `\` 를 뺀 것).
 *
 *   그래서 이 값은 **영문으로 적는다.** 사람이 읽을 한국어 문장은 401
 *   **본문**으로 간다 — 헤더는 기계가 읽는 자리다.
 */
function escapeQuoted(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    const ok = (c >= 0x20 && c <= 0x21) || (c >= 0x23 && c <= 0x5b) || (c >= 0x5d && c <= 0x7e);
    out += ok ? ch : ' ';
  }
  return out.replace(/\s+/g, ' ').trim().slice(0, 120);
}

/**
 * 이 요청이 밖에서 보기에 어느 주소인가 — 메타데이터가 **자기 주소를
 * 정확히 말해야** 하기 때문에 필요하다.
 *
 * 프록시 뒤에 있으므로 `X-Forwarded-Proto`·`Host` 를 봐야 하는데, 그것은
 * Express 의 `trust proxy` 가 이미 해 준다(main.ts). 여기서 헤더를 직접
 * 읽지 않는 이유다 — 두 곳이 다르게 판단하면 메타데이터의 `resource` 와
 * 클라이언트가 보낸 `resource` 가 어긋난다.
 *
 * `PUBLIC_API_URL` 이 있으면 그것이 이긴다 — 프록시 설정이 미덥지 않은
 * 배포에서 손으로 못 박는 문이다.
 */
export function requestOrigin(
  req: { protocol?: string; get?: (h: string) => string | undefined },
  override?: string,
): string {
  const fixed = (override ?? '').trim().replace(/\/+$/, '');
  if (fixed) return fixed;
  const host = req.get?.('host') ?? 'localhost';
  return `${req.protocol ?? 'https'}://${host}`;
}
