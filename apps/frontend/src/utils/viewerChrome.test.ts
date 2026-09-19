// 퍼블리싱 뷰어 위 "돌아갈 자리" 판정 — `viewerChrome.ts` (2026-09-19).
//
//   npm run test:unit
//
// 왜 시험하나: 판정이 틀리면 **두 가지 나쁜 일**이 생긴다.
//   ⑴ 새 탭인데 버튼이 없다 → 사용자가 겪은 그 문제(돌아갈 길이 없다)
//   ⑵ 남의 사이트에서 온 사람에게 "지식창고로" 가 뜬다 → 브라우저
//      뒤로가기와 다른 곳으로 데려간다
// ⑵ 는 다른 사이트가 있어야 재현되어 손으로는 확인하기 어렵다.

import { isFreshTab, libraryBackHref } from './viewerChrome';

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      ${detail}`}`);
}

const SITE = 'https://www.easymindmap.org';

// ── ① 새 탭인가 ──────────────────────────────────────────
check('① 첫 장뿐이면 새 탭이다', isFreshTab(1));
check('① 0 을 주는 브라우저도 새 탭으로 본다', isFreshTab(0));
check('① ★ 뒤로 갈 곳이 있으면 새 탭이 아니다 (버튼을 그리지 않는다)', !isFreshTab(2));
check('① 한참 돌아다닌 탭도 아니다', !isFreshTab(17));

// ── ② 지식창고에서 왔다 ─────────────────────────────────
check('② /library 에서 왔으면 그 자리로',
  libraryBackHref(`${SITE}/library`, SITE) === '/library',
  String(libraryBackHref(`${SITE}/library`, SITE)));
check('② ★ 찾던 말(?q=)까지 그대로 데려간다',
  libraryBackHref(`${SITE}/library?q=%ED%9A%8C%EC%9D%98`, SITE) === '/library?q=%ED%9A%8C%EC%9D%98',
  String(libraryBackHref(`${SITE}/library?q=%ED%9A%8C%EC%9D%98`, SITE)));
check('② 끝의 / 는 같은 자리로 본다',
  libraryBackHref(`${SITE}/library/`, SITE) === '/library',
  String(libraryBackHref(`${SITE}/library/`, SITE)));
check('② #조각은 버린다 (경로+쿼리만 돌려준다)',
  libraryBackHref(`${SITE}/library?q=a#top`, SITE) === '/library?q=a',
  String(libraryBackHref(`${SITE}/library?q=a#top`, SITE)));

// ── ③ 지식창고가 아니면 null ────────────────────────────
check('③ 홈에서 왔으면 없다', libraryBackHref(`${SITE}/`, SITE) === null);
check('③ 기능 페이지에서 왔으면 없다', libraryBackHref(`${SITE}/function`, SITE) === null);
check('③ 이름이 비슷한 자리도 아니다',
  libraryBackHref(`${SITE}/library-old`, SITE) === null,
  String(libraryBackHref(`${SITE}/library-old`, SITE)));
check('③ 하위 경로도 아니다',
  libraryBackHref(`${SITE}/library/x`, SITE) === null,
  String(libraryBackHref(`${SITE}/library/x`, SITE)));

// ── ④ ★ 바깥에서 온 것은 절대 돌려주지 않는다 ───────────
check('④ ★ 다른 도메인은 null (오픈 리다이렉트 방지)',
  libraryBackHref('https://evil.example/library', SITE) === null,
  String(libraryBackHref('https://evil.example/library', SITE)));
check('④ ★ 우리 이름을 앞에 붙인 도메인도 null',
  libraryBackHref('https://www.easymindmap.org.evil.example/library', SITE) === null,
  String(libraryBackHref('https://www.easymindmap.org.evil.example/library', SITE)));
check('④ ★ http 로 온 것은 https 오리진과 다르다',
  libraryBackHref('http://www.easymindmap.org/library', SITE) === null,
  String(libraryBackHref('http://www.easymindmap.org/library', SITE)));
check('④ 포트가 다르면 다른 오리진이다',
  libraryBackHref('https://www.easymindmap.org:8443/library', SITE) === null);
check('④ 앞머리 없는 도메인(apex)도 다른 오리진이다',
  libraryBackHref('https://easymindmap.org/library', SITE) === null);

// ── ⑤ 아예 안 오는 경우 ─────────────────────────────────
check('⑤ 빈 referrer 는 null (주소를 직접 친 사람)', libraryBackHref('', SITE) === null);
check('⑤ 망가진 주소도 죽지 않는다', libraryBackHref('아무거나', SITE) === null);
check('⑤ 상대 경로만 온 것도 null (오리진을 알 수 없다)',
  libraryBackHref('/library', SITE) === null);

// ── ⑥ 개발 주소(localhost)에서도 같은 규칙이다 ──────────
check('⑥ localhost 도 오리진만 맞으면 된다',
  libraryBackHref('http://127.0.0.1:5199/library?q=b', 'http://127.0.0.1:5199') === '/library?q=b',
  String(libraryBackHref('http://127.0.0.1:5199/library?q=b', 'http://127.0.0.1:5199')));

console.log(failed === 0 ? '\n전부 PASS' : `\n실패 ${failed}건`);
process.exit(failed ? 1 : 0);
