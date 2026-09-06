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
  MCP_SCOPES, MCP_SCOPE_STRING, PRM_SUFFIX,
  mcpResourceUri, prmUrl, protectedResourceMetadata, requestOrigin, wwwAuthenticate,
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
  check('scopes_supported', m.scopes_supported, ['openid', 'email']);
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

check('scope 는 상수와 문자열이 같다', MCP_SCOPE_STRING, MCP_SCOPES.join(' '));

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
