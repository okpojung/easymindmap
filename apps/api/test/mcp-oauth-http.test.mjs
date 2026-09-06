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
import jwt from 'jsonwebtoken';

const DSN = process.env.DATABASE_URL;
if (!DSN) { console.error('DATABASE_URL 이 필요합니다.'); process.exit(1); }
const PORT = Number(process.env.OAUTH_PORT || 3405);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = 'oauth-http-test-secret-0123456789';
const AS = 'https://auth-dev.example.com';
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
  await start({ GOTRUE_PUBLIC_URL: AS });

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
    check('  인가 서버를 가리킨다', j?.authorization_servers, [AS]);
  }
  check('메타데이터는 **인증 없이** 읽힌다(닭과 달걀)',
    (await fetch(BASE + '/.well-known/oauth-protected-resource')).status, 200);

  // ── ② 무토큰 401 — 클라이언트가 읽는 유일한 안내 ───────────────
  {
    const r = await rpc(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    check('무토큰은 401', r.status, 401);
    check('★ resource_metadata 를 알려 준다',
      (r.auth ?? '').includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/v1/mcp"`), true);
    check('  scope 도 알려 준다', (r.auth ?? '').includes('scope="openid email"'), true);
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

  // ── ⑤ OAuth 토큰은 통한다 + 사용자가 JIT 로 생긴다 ─────────────
  {
    const tok = sign({ client_id: 'cli_test', scope: 'openid email' });
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
  check('★ OAuth 토큰도 401 (문을 안 열었다)',
    (await rpc(sign({ client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 401);
  stop();

  // ══ AUTH_MODE=dev — 둘 다 열리지 않는다 (§3) ═══════════════════
  await start({ AUTH_MODE: 'dev', DEV_USER_ID: SUB, GOTRUE_PUBLIC_URL: AS });
  check('★ dev 에서는 OAuth 토큰도 403',
    (await rpc(sign({ client_id: 'c' }), { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 403);
} finally { stop(); }

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
