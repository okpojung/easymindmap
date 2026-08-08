// find-api-host.mjs — 프런트 페이지를 받아 **API 주소를 추측**한다.
//
//   node find-api-host.mjs https://web.thinkwise.co.kr/
//
// 프런트 번들에는 빌드 때 구워진 API 주소(VITE_API_URL)가 문자열로 들어
// 있다. 그걸 찾아 준다. 못 찾으면 브라우저 F12 → Network 에서 /v1/ 요청의
// 호스트를 직접 확인하면 된다.

const front = process.argv[2] || 'https://web.thinkwise.co.kr/';

const html = await (await fetch(front)).text();
// <script src="/assets/index-XXXX.js"> 를 찾는다
const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
const found = new Set();

for (const s of scripts) {
  const u = s.startsWith('http') ? s : new URL(s, front).href;
  let js = '';
  try { js = await (await fetch(u)).text(); } catch { continue; }
  // https://.../v1  또는  /v1 을 부르는 절대 URL 을 뽑는다
  for (const m of js.matchAll(/https?:\/\/[a-z0-9.\-]+(?::\d+)?(?=\/v1|["'`])/gi)) {
    const h = m[0];
    if (!/thinkwise|mindmap|api/i.test(h)) continue;   // 관련 있어 보이는 것만
    found.add(h);
  }
}

console.log('프런트:', front);
if (found.size) {
  console.log('\n번들에서 찾은 API 후보:');
  for (const h of found) console.log('  ' + h + '/v1/health');
  console.log('\n이 중 하나를 골라 probe 를 돌린다:');
  console.log('  node rate-limit-probe.mjs <위 주소>');
} else {
  console.log('\n번들에서 API 주소를 못 찾았다.');
  console.log('브라우저에서 직접 확인:');
  console.log('  1) ' + front + ' 접속 → F12 → Network 탭');
  console.log('  2) 로그인하거나 문서함을 열면 /v1/... 요청이 뜬다');
  console.log('  3) 그 요청의 Request URL 앞부분(https://호스트)이 API 주소');
}
