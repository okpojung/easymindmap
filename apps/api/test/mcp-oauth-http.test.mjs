// MCP 3단계(OAuth) — **진짜 서버에 대고** 확인한다 (2026-09-06).
//
//   npm run build && npm run test:mcp-http     (DATABASE_URL 필요)
//
// ★ 왜 단위 테스트로 부족한가 — **HTTP 헤더까지 가 봐야 드러나는 것이
// 있다.** 실제로 여기서 잡았다: `error_description` 에 한국어를 넣었더니
// Node 의 `setHeader` 가 ERR_INVALID_CHAR 로 던져 **401 이 500 이 됐다.**
// 함수만 시험했으면 통과했을 자리다.
//
// 규격: MCP 인증(2026-07-28) · RFC 9728 · RFC 6750

import { spawn } from 'node:child_process';
import http from 'node:http';
import jwt from 'jsonwebtoken';

const DSN = process.env.DATABASE_URL;
if (!DSN) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const PORT = Number(process.env.OAUTH_PORT || 3405);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'oauth-http-test-secret-0123456789';
const AS = 'https://auth-dev.example.com';   // 닿지 않는 인가 서버 — 겉면이 502 를 내야 한다

// ── 가짜 GoTrue — 메타데이터 한 장만 낸다 (겉면 시험용, 2026-09-22 §12.6) ──
const FAKE_PORT = Number(process.env.OAUTH_FAKE_AS_PORT || 3406);
const FAKE_AS = `http://127.0.0.1:${FAKE_PORT}`;
const UPSTREAM = {
  issuer: FAKE_AS,
  authorization_endpoint: `${FAKE_AS}/oauth/authorize`,
  token_endpoint: `${FAKE_AS}/oauth/token`,
  registration_endpoint: `${FAKE_AS}/oauth/clients/register`,
  jwks_uri: `${FAKE_AS}/.well-known/jwks.json`,
  userinfo_endpoint: `${FAKE_AS}/oauth/userinfo`,
  scopes_supported: ['openid', 'email', 'profile'],
  response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
  code_challenge_methods_supported: ['S256', 'plain'],
  id_token_signing_alg_values_supported: ['RS256', 'HS256', 'ES256'],
};
const fakeAs = http.createServer((req, res) => {
  if (req.url === '/.well-known/oauth-authorization-server') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(UPSTREAM));
  } else { res.writeHead(404); res.end(); }
});
await new Promise((r) => fakeAs.listen(FAKE_PORT, '127.0.0.1', r));
const SUB = '11111111-2222-3333-4444-555555555555';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  const ok = g === w; if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}
const sign = (extra) => jwt.sign(
  { sub: SUB, email: 'oauth@example.com', aud: 'authenticated', ...extra },
  SECRET, { algorithm: 'HS256', expiresIn: '1h' });

async function rpc(token, body) {
  const res = await fetch(`${BASE}/v1/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, auth: res.headers.get('www-authenticate'), body: await res.json().catch(() => null) };
}

let api = null;
async function start(env) {
  api = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env, PORT: String(PORT), AUTH_MODE: 'supabase',
      SUPABASE_JWT_SECRET: SECRET, RATE_LIMIT_ENABLED: 'false',
      STORAGE_LOCAL_DIR: process.env.STORAGE_LOCAL_DIR || '/tmp/emm-storage',
      CORS_ORIGIN: 'http://localhost:5173', ...env,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/v1/health`); if (r.ok || r.status === 503) return; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API 가 뜨지 않았습니다.');
}
const stop = () => { if (api) { api.kill(); api = null; } };

try {
  // ══ OAuth 를 켠 배포 ═══════════════════════════════════════════
  await start({ GOTRUE_PUBLIC_URL: FAKE_AS });

  // ── ① 보호 자원 메타데이터가 /v1 **밖에** 있다 ────────────────
  // 프리픽스 예외를 빼먹으면 여기가 404 가 되고, 클라이언트는 이유를
  // 모른 채 연결에 실패한다(main.ts 의 setGlobalPrefix exclude).
  for (const path of [
    '/.well-known/oauth-protected-resource/v1/mcp',
    '/.well-known/oauth-protected-resource',
  ]) {
    const r = await fetch(BASE + path);
    const j = await r.json().catch(() => null);
    check(`★ ${path} 가 열린다`, r.status, 200);
    check('  resource 가 우리 MCP 주소', j?.resource, `${BASE}/v1/mcp`);
    // ★ 2026-09-22 부터 인가 서버는 GoTrue 가 아니라 **우리 겉면**이다 (§12.6)
    check('  ★ 인가 서버로 **우리 주소**(겉면)를 가리킨다', j?.authorization_servers, [BASE]);
  }
  check('메타데이터는 **인증 없이** 읽힌다(닭과 달걀)',
    (await fetch(BASE + '/.well-known/oauth-protected-resource')).status, 200);

  // ── ①-b 인가 서버 겉면 문서 — GoTrue 문서를 받아 우리 것으로 바꿔 낸다 (§12.6) ──
  for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
    const r = await fetch(BASE + path);
    const j = await r.json().catch(() => null);
    check(`★ ${path} 가 /v1 밖에서 열린다`, r.status, 200);
    check('  issuer 는 우리 주소', j?.issuer, BASE);
    check('  authorization_endpoint 는 우리 /v1/oauth/authorize', j?.authorization_endpoint, `${BASE}/v1/oauth/authorize`);
    check('  토큰·등록·JWKS 는 GoTrue 그대로',
      [j?.token_endpoint, j?.registration_endpoint, j?.jwks_uri],
      [UPSTREAM.token_endpoint, UPSTREAM.registration_endpoint, UPSTREAM.jwks_uri]);
    check('  ★ scopes_supported 에 openid 가 없다', j?.scopes_supported, ['email', 'profile']);
    check('  OIDC 전용 항목(userinfo·id_token alg)은 없다',
      ['userinfo_endpoint', 'id_token_signing_alg_values_supported'].map((k) => j && k in j), [false, false]);
    check('  10분 캐시 헤더', (r.headers.get('cache-control') ?? '').includes('max-age=600'), true);
  }

  // ── ①-c 겉면 인가 엔드포인트 — openid 만 떼고 GoTrue 로 302 (ChatGPT 가 붙이는 그것) ──
  {
    const q = new URLSearchParams({
      response_type: 'code', client_id: 'abc', redirect_uri: 'https://chatgpt.com/connector_platform_oauth_redirect',
      scope: 'openid email', state: 's1', code_challenge: 'cc', code_challenge_method: 'S256',
      resource: `${BASE}/v1/mcp`,
    });
    const r = await fetch(`${BASE}/v1/oauth/authorize?${q}`, { redirect: 'manual' });
    check('★ /v1/oauth/authorize 는 302', r.status, 302);
    const loc = new URL(r.headers.get('location') ?? 'http://x/');
    check('  GoTrue 의 /oauth/authorize 로', loc.origin + loc.pathname, `${FAKE_AS}/oauth/authorize`);
    check('  ★ scope 에서 openid 만 뗐다', loc.searchParams.get('scope'), 'email');
    check('  PKCE·state·resource·redirect_uri 는 그대로',
      ['client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'resource', 'response_type'].map((k) => loc.searchParams.get(k)),
      ['abc', 'https://chatgpt.com/connector_platform_oauth_redirect', 's1', 'cc', 'S256', `${BASE}/v1/mcp`, 'code']);
    check('  인증 없이 (로그인 전 첫걸음)', r.headers.get('www-authenticate'), null);
  }

  // ── ② 무토큰 401 — 클라이언트가 읽는 유일한 안내 ───────────────
  {
    const r = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('무토큰은 401', r.status, 401);
    check('★ resource_metadata 를 알려 준다',
      (r.auth ?? '').includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/v1/mcp"`), true);
    check('  scope 도 알려 준다', (r.auth ?? '').includes('scope="email"'), true);
    // ★ 401 안내에도 openid 가 실리면 안 된다 — 클라이언트는 이 값을 그대로 쓴다
    check('  ★ openid 를 요구하지 않는다', (r.auth ?? '').includes('openid'), false);
    check('  error 는 붙이지 않는다 (RFC 6750 §3.1)', (r.auth ?? '').includes('error='), false);
  }

  // ── ③ ★★ 헤더가 깨지지 않는다 — 여기서 500 이 났었다 ──────────
  {
    const r = await rpc('not.a.jwt', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('★ 틀린 토큰은 500 이 아니라 401', r.status, 401);
    check('  error=invalid_token', (r.auth ?? '').includes('error="invalid_token"'), true);
    check('★ 헤더에 비 ASCII 가 없다', /[^\x20-\x7e]/.test(r.auth ?? ''), false);
  }

  // ── ④ ★ 로그인 세션 토큰으로는 못 연다 ────────────────────────
  // GoTrue 는 OAuth 로 발급한 토큰에만 `client_id` 를 넣는다. 이 확인이
  // 없으면 **브라우저 세션 토큰이 곧 MCP 열쇠**가 된다.
  {
    const r = await rpc(sign({}), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('★ client_id 없는 토큰은 401', r.status, 401);
  }

  // ── ④-b ★★ **자리표시가 그대로 온 경우 — 틀린 진단을 하지 않는다** ──
  // 실측(2026-09-06): `.mcp.json` 의 `Bearer ${EMM_MCP_TOKEN}` 이 환경
  // 변수 없이 그대로 나갔는데 서버가 "OAuth 커넥터가 설정되지 않았습니다"
  // 라고 답했다. 사용자가 할 일은 환경 변수 한 줄인데 서버 설정을 보라고
  // 가리키는 안내였다.
  for (const bad of ['${EMM_MCP_TOKEN}', 'emm', 'paste-your-token-here']) {
    const r = await rpc(bad, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check(`★ ${bad} → 401`, r.status, 401);
    check('  ★ 서버 탓을 하지 않는다', (r.body?.message ?? '').includes('OAuth 커넥터가 설정되지'), false);
    check('  ★ 토큰 형식을 짚어 준다', (r.body?.message ?? '').includes('토큰 형식이 아닙니다'), true);
    check('  자리표시를 의심하라고 말한다', (r.body?.message ?? '').includes('자리표시'), true);
  }

  // ── ⑤ OAuth 토큰은 통한다 + 사용자가 JIT 로 생긴다 ─────────────
  {
    const tok = sign({ client_id: 'cli_test', scope: 'email' });
    const r = await rpc(tok, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('★ OAuth 토큰은 200', r.status, 200);
    check('  도구 목록이 온다', (r.body?.result?.tools ?? []).length > 0, true);
    const made = await rpc(tok, {
      jsonrpc: '2.0', id: 2, method: 'tools/call',
      params: { name: 'create_map', arguments: {
        title: `OAuth ${Date.now()}`, markdown: '# 회의\n\n## 결정\n\n- OAuth 로 붙었다\n' } },
    });
    check('★ OAuth 토큰으로 맵이 생긴다', made.body?.result?.isError !== true, true);
  }

  // ── ⑥ 만료 토큰 ───────────────────────────────────────────────
  {
    const old = jwt.sign({ sub: SUB, aud: 'authenticated', client_id: 'c' }, SECRET,
      { algorithm: 'HS256', expiresIn: '-1h' });
    check('만료 토큰은 401', (await rpc(old, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  }
  // ── ⑦ 다른 비밀로 서명한 토큰 ─────────────────────────────────
  {
    const forged = jwt.sign({ sub: SUB, aud: 'authenticated', client_id: 'c' },
      'a-different-secret-0123456789abcd', { algorithm: 'HS256', expiresIn: '1h' });
    check('★ 남의 비밀로 서명한 토큰은 401',
      (await rpc(forged, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  }
  stop();

  // ══ OAuth 를 켜지 않은 배포 ════════════════════════════════════
  await start({ GOTRUE_PUBLIC_URL: '' });
  check('메타데이터는 404 (없는 것을 있는 척하지 않는다)',
    (await fetch(BASE + '/.well-known/oauth-protected-resource/v1/mcp')).status, 404);
  check('  겉면 문서도 404', (await fetch(BASE + '/.well-known/oauth-authorization-server')).status, 404);
  check('  겉면 authorize 도 404', (await fetch(BASE + '/v1/oauth/authorize?scope=email', { redirect: 'manual' })).status, 404);
  {
    const r = await rpc(sign({ client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('★ OAuth 토큰도 401 (문을 안 열었다)', r.status, 401);
    // JWT 는 맞으므로 이때는 "서버가 안 열었다" 가 **사실에 맞는 진단**이다
    check('  이때는 서버 탓이 맞다', (r.body?.message ?? '').includes('OAuth 커넥터가 설정되지'), true);
    const ph = await rpc('${EMM_MCP_TOKEN}', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('  ★ 그래도 자리표시에는 토큰 형식을 짚는다',
      (ph.body?.message ?? '').includes('토큰 형식이 아닙니다'), true);
  }
  stop();

  // ══ AUTH_MODE=dev — 둘 다 열리지 않는다 (§3) ═══════════════════
  await start({ AUTH_MODE: 'dev', DEV_USER_ID: SUB, GOTRUE_PUBLIC_URL: AS });
  check('★ dev 에서는 OAuth 토큰도 403',
    (await rpc(sign({ client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 403);
  // 인가 서버(GoTrue)에 닿지 못하면 겉면 문서는 **502** — 없는 것을 있는 척하지 않는다
  check('★ GoTrue 를 못 읽으면 겉면 문서는 502',
    (await fetch(BASE + '/.well-known/oauth-authorization-server')).status, 502);
} finally { stop(); fakeAs.close(); }

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
