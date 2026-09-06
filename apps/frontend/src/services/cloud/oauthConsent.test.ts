// OAuth 동의 화면의 판정들 — 단위 테스트 (2026-09-06 · MCP 4단계).
//
// 화면 없이 시험할 수 있는 것만 여기 있다: ① 주소가 동의 화면인가
// ② `authorization_id` 를 꺼내고 **모양까지** 보나 ③ 범위를 사람 말로
// 옮기되 **모르는 것을 감추지 않나** ④ 이동 주소에서 `javascript:` 를 막나.
//
//   npx tsx src/services/cloud/oauthConsent.test.ts

import {
  CONSENT_PATH, isConsentPath, authorizationIdFromSearch,
  describeScopes, isSafeRedirect,
} from './oauthConsentRules';

let failed = 0;
function check(name: string, got: unknown, want: unknown): void {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// ── ① 주소 판정 ────────────────────────────────────────────────────────
check('① 동의 화면이다', isConsentPath('/oauth/consent'), true);
check('① 끝의 슬래시는 무시한다', isConsentPath('/oauth/consent/'), true);
check('① 슬래시 여러 개도', isConsentPath('/oauth/consent///'), true);
check('① 에디터는 아니다', isConsentPath('/'), false);
check('① 비슷하지만 다른 경로', isConsentPath('/oauth/consent2'), false);
check('① 앞에 뭔가 붙은 경로', isConsentPath('/x/oauth/consent'), false);
// ★ 이 상수는 GoTrue 설정과 **같아야** 붙는다 — 값이 바뀌면 여기서 걸린다
check('① GOTRUE_OAUTH_SERVER_AUTHORIZATION_PATH 와 같은 값', CONSENT_PATH, '/oauth/consent');

// ── ② authorization_id ─────────────────────────────────────────────────
const ID32 = 'aB3xY9zQ1mN7pR2sT4uV6wX8yZ0aB2cD'; // GoTrue: 영숫자 32자
check('② 정상 값을 꺼낸다', authorizationIdFromSearch(`?authorization_id=${ID32}`), ID32);
check('② 다른 파라미터가 섞여 있어도', authorizationIdFromSearch(`?a=1&authorization_id=${ID32}&b=2`), ID32);
check('② 물음표 없이도', authorizationIdFromSearch(`authorization_id=${ID32}`), ID32);
check('② 없으면 null', authorizationIdFromSearch('?foo=1'), null);
check('② 빈 값이면 null', authorizationIdFromSearch('?authorization_id='), null);
// ★ 모양을 보는 이유: 아무 글자나 그대로 서버 주소에 실어 보내지 않는다
check('② 슬래시가 섞이면 거른다(경로 탈출)', authorizationIdFromSearch('?authorization_id=../../admin'), null);
check('② 꺾쇠가 섞이면 거른다', authorizationIdFromSearch('?authorization_id=<script>alert(1)</script>'), null);
check('② 너무 짧으면 거른다', authorizationIdFromSearch('?authorization_id=abc'), null);
check('② 너무 길면 거른다', authorizationIdFromSearch(`?authorization_id=${'a'.repeat(129)}`), null);
check('② 하이픈·밑줄은 통과(형식이 바뀌어도 화면이 먼저 막지 않게)',
  authorizationIdFromSearch('?authorization_id=abc-def_ghi-jkl_mno'), 'abc-def_ghi-jkl_mno');

// ── ③ 범위를 사람 말로 ─────────────────────────────────────────────────
check('③ openid·email 을 옮긴다',
  describeScopes('openid email').map((x) => x.label),
  ['회원 식별 — 어느 계정인지', '이메일 주소']);
check('③ 옮긴 것은 unknown 이 아니다', describeScopes('openid').map((x) => x.unknown), [false]);
// ★ 모르는 범위를 **감추지 않는다** — 무엇을 허락하는지 모른 채 누르는 것이 가장 나쁘다
check('③ 모르는 범위는 이름 그대로 남긴다',
  describeScopes('openid write:everything'),
  [
    { id: 'openid', label: '회원 식별 — 어느 계정인지', unknown: false },
    { id: 'write:everything', label: 'write:everything', unknown: true },
  ]);
check('③ 빈 값이면 빈 목록', describeScopes(''), []);
check('③ undefined 도 빈 목록', describeScopes(undefined), []);
check('③ 공백이 여러 개여도 나뉜다', describeScopes('openid   email').length, 2);
check('③ 같은 것이 두 번 오면 한 번만', describeScopes('email email openid').map((x) => x.id), ['email', 'openid']);
check('③ 다섯 가지를 모두 안다',
  describeScopes('openid email profile phone offline_access').every((x) => !x.unknown), true);

// ── ④ 이동 주소 ────────────────────────────────────────────────────────
check('④ https 는 통과', isSafeRedirect('https://claude.ai/api/mcp/auth_callback?code=x'), true);
check('④ http 도 통과(로컬 시험)', isSafeRedirect('http://127.0.0.1:8080/cb'), true);
// ★ 이 한 줄이 "우리 오리진에서 남의 코드가 도는" 부류 전체를 막는다
check('④ javascript: 는 막는다', isSafeRedirect('javascript:alert(1)'), false);
check('④ data: 는 막는다', isSafeRedirect('data:text/html,<script>alert(1)</script>'), false);
check('④ 대문자로 써도 막는다', isSafeRedirect('JavaScript:alert(1)'), false);
check('④ 상대 경로는 막는다(절대 주소만 받는다)', isSafeRedirect('/oauth/consent'), false);
check('④ 빈 값은 막는다', isSafeRedirect(''), false);
check('④ undefined 는 막는다', isSafeRedirect(undefined), false);

console.log(failed === 0 ? `\n전부 통과` : `\n${failed}건 실패`);
if (failed > 0) process.exit(1);
