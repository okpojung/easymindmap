// 델타 SQL 을 **아직 적용하지 않은 서버**에서 앱이 어떻게 물러나는가
// (2026-09-04). 표를 잠깐 치워 두고 그 상태의 응답을 못 박는다.
//
//   npm run build && npm run test:schema-degrade
//   (DATABASE_URL 필요 — CI 의 백엔드 잡과 같은 값)
//
// ★ 왜 만들었나 — **이 자리는 조용히 썩는다.**
// `account.service.ts` 는 표가 없을 때 `reason:'schema'` 로 물러나려고
// `catch (e) { if (e.code === '42P01') … }` 를 썼는데, 그 분기는 **한 번도
// 실행되지 않았다**: `DatabaseService.query` 가 스키마 오류를 이미 503
// 예외로 바꿔서 올려 주기 때문이다(database.service.ts `translate`).
// 타입도 맞고 테스트도 없으니 아무도 몰랐고, 델타를 적용하지 않은 서버는
// "서버 스키마가 아직 적용되지 않아" 대신 **"서버가 응답하지 않아"** 라는
// 틀린 진단을 냈다. 코드를 읽어서는 못 잡는다 — **실제로 치워 보고**
// 응답을 봐야 잡힌다. 그래서 이 테스트가 있다.
//
// 표는 **rename** 으로 치웠다가 반드시 되돌린다(지우지 않는다).

import { spawn } from 'node:child_process';
import pg from 'pg';

const DSN = process.env.DATABASE_URL;
if (!DSN) {
  console.error('DATABASE_URL 이 필요합니다.');
  process.exit(1);
}
const PORT = Number(process.env.DEGRADE_PORT || 3399);
const BASE = `http://127.0.0.1:${PORT}/v1`;
// 치울 표 — 전부 나중에 들어온 표라 "델타 미적용" 서버에 없을 수 있다.
// (2026-09-05: login_events·deleted_accounts 를 더했다 — 표 존재 판정을
//  `common/table-ready.ts` 한 자리로 모으면서 이 둘의 물러남도 여기서 본다)
const TABLES = [
  'user_ai_keys', 'user_ai_settings', 'api_tokens',
  'login_events', 'deleted_accounts',
];

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

async function get(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function put(path, body) {
  const res = await fetch(BASE + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const client = new pg.Client({ connectionString: DSN });
await client.connect();

async function moveAway() {
  for (const t of TABLES) {
    await client.query(`ALTER TABLE IF EXISTS public.${t} RENAME TO ${t}__degrade_test`);
  }
}
async function moveBack() {
  for (const t of TABLES) {
    await client.query(`ALTER TABLE IF EXISTS public.${t}__degrade_test RENAME TO ${t}`);
  }
}

let api = null;
async function startApi() {
  api = spawn(process.execPath, ['dist/main.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      AUTH_MODE: 'dev',
      DEV_USER_ID: process.env.DEV_USER_ID || '00000000-0000-0000-0000-000000000001',
      RATE_LIMIT_ENABLED: 'false',
      // 키 보관은 **켜 둔다** — 그래야 'secret' 이 아니라 'schema' 로
      // 물러나는지를 볼 수 있다 (둘을 섞으면 이 테스트가 무의미해진다)
      AI_KEY_SECRET: process.env.AI_KEY_SECRET || 'degrade-test-secret-0123456789',
      // 로그인 기록도 **켜 둔다** (2026-09-05). 이것이 없으면 코드가
      // `available:false` 로 먼저 끝나 **그 아래 login_events 판정에 닿지
      // 못한다** — #393 에서 확인하지 못했던 자리가 바로 여기다.
      // 로컬/CI 에는 GoTrue 가 없으므로 앱 DB 를 그대로 가리킨다:
      // dev shim 이 auth.audit_log_entries 를 만들고 시드가 줄을 넣는다.
      GOTRUE_DATABASE_URL: DSN,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok || r.status === 503) return;
    } catch { /* 아직 안 떴다 */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('API 가 뜨지 않았습니다.');
}

try {
  // ★ 표를 **먼저** 치우고 API 를 띄운다. `tableReady` 는 "있다"를 영구히
  //   기억하므로(table-ready.ts), 이미 본 뒤에 치우면 이 상황이 재현되지
  //   않는다 — 실제 배포도 "없는 채로 뜬다" 쪽이다.
  await moveAway();
  await startApi();

  const health = await get('/health');
  check('health 는 200 이되 스키마가 낡았다고 말한다',
    [health.status, health.body.status, health.body.schema], [200, 'degraded', 'outdated']);
  check('무엇이 없는지 이름을 준다',
    TABLES.every((t) => health.body.missingTables?.includes(t)), true);

  // ── ① AI 키 — "왜 브라우저에만 남는지" 를 화면이 말할 수 있어야 한다 ──
  const keys = await get('/account/ai-keys');
  check('ai-keys 는 200 으로 물러난다(503 이 아니다)', keys.status, 200);
  check('이유가 schema 다 (offline·secret 이 아니다)',
    [keys.body.enabled, keys.body.reason], [false, 'schema']);

  // ── ② AI 설정 ────────────────────────────────────────────────
  const st = await get('/account/ai-settings');
  check('ai-settings 는 200 으로 물러난다', st.status, 200);
  check('available:false', st.body.available, false);

  // ── ③ MCP 토큰 화면 ──────────────────────────────────────────
  const tok = await get('/mcp-tokens');
  check('mcp-tokens 는 200 으로 물러난다', tok.status, 200);
  check('ready:false + 빈 목록', [tok.body.ready, tok.body.tokens], [false, []]);

  // ── ④ **쓰기**는 물러나지 않는다 — 무엇을 해야 하는지 말한다 ────
  // 조회는 조용히 물러나는 것이 맞지만, 저장은 조용히 실패하면 안 된다.
  const saveKey = await put('/account/ai-keys', { provider: 'openai', key: 'sk-degrade' });
  check('키 저장은 503', saveKey.status, 503);
  check('어느 표인지 이름을 준다', /user_ai_keys/.test(saveKey.body?.message ?? ''), true);

  const saveSt = await put('/account/ai-settings', { priority: ['openai'] });
  check('설정 저장은 503', saveSt.status, 503);
  check('어느 표인지 이름을 준다', /user_ai_settings/.test(saveSt.body?.message ?? ''), true);

  // ── ⑤ 로그인 기록·탈퇴 화면도 **죽지 않는다** (2026-09-05) ───────
  // 표 존재 판정을 한 자리로 모으면서 이 둘이 함께 걸린다. 500 이
  // 아니라는 것이 요점이다 — 없는 표 때문에 화면이 통째로 막히면 안 된다.
  const logins = await get('/account/logins');
  check('로그인 기록은 500 이 아니다', logins.status, 200);
  check('감사 로그는 읽힌다(available)', logins.body?.available, true);
  // ★ **"표가 없다"와 "기록이 없다"는 다른 말이다** — 화면이 사용자에게
  //   할 일을 정확히 말하려면 이 둘이 갈려야 한다(login-events.service.ts).
  check('접속 IP 가 없는 이유를 no-table 로 말한다', logins.body?.ipSource, 'no-table');
  check('token_refreshed 는 걸러진다',
    (logins.body?.events ?? []).some((e) => e.action === 'token_refreshed'), false);
  const del = await get('/account/delete-preview');
  check('탈퇴 확인 화면도 200', del.status, 200);

  // ── ⑤-b ★★ **도는 중에 델타를 적용하면 곧바로 알아챈다** (2026-09-05) ──
  // `login_events` 는 "없다"를 기억하지 않는다(ALWAYS_RECHECK) — 관리자가
  // SQL 을 넣고 **재기동 없이** 화면을 새로고침하는 자리이기 때문이다.
  // 기본값(1분 기억)으로 합쳤다면 여기서 여전히 'no-table' 이 나온다.
  // 단위 테스트(table-ready)는 정책이 갈리는 것까지만 보고, **그 정책을
  // 이 자리에 실제로 걸었는지**는 여기서만 드러난다.
  await client.query(
    `ALTER TABLE IF EXISTS public.login_events__degrade_test RENAME TO login_events`,
  );
  const after = await get('/account/logins');
  check('★ 델타를 넣자마자(재기동·대기 없이) no-table 이 아니다',
    after.body?.ipSource !== 'no-table', true);
  check('  그 값은 no-records 다(표는 생겼고 기록이 아직 없다)',
    after.body?.ipSource, 'no-records');

  // ── ⑥ **다른 기능은 멀쩡하다** — 이것이 물러남의 목적이다 ────────
  const maps = await get('/maps');
  check('맵 목록은 그대로 200', maps.status, 200);
  const folders = await get('/folders');
  check('폴더도 그대로 200', folders.status, 200);
} finally {
  if (api) api.kill();
  await moveBack();
  await client.end();
}

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
