// 로그아웃 경로 — 단위 테스트 (2026-09-27, mcp-connector.md §12.10).
//
// GoTrue `/logout` 의 기본(global)은 그 사용자의 세션을 전부 지워 AI 커넥터의
// refresh 토큰까지 없앤다. 이 시험은 "우리는 이 세션만 끝낸다" 를 못 박는다.
//
//   npx tsx src/services/cloud/logoutRules.test.ts

import { LOGOUT_PATH, LOGOUT_SCOPE } from './logoutRules';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

check('★ 로그아웃은 이 세션만 (scope=local) — global 이면 AI 커넥터가 끊긴다', LOGOUT_SCOPE, 'local');
check('경로에 scope 가 붙어 있다', LOGOUT_PATH, '/logout?scope=local');
check('global 은 어디에도 없다', LOGOUT_PATH.includes('global'), false);

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
