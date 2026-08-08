// rate-limit-headers.mjs — **정상 요청 1회**로 응답 헤더만 보고
// 레이트 리밋이 설정돼 있는지 추정한다.
//
// ★ rate-limit-probe.mjs 와의 차이 ★
//   probe   = 한도를 넘길 때까지 요청을 **몰아붓는다** → 우리 서버에만 쓴다
//   headers = **딱 1회** 보내 헤더만 본다 → **남의 서버에도 안전**
//
// 남의 서버(관계사 등)에 레이트 리밋 유무를 알아볼 때는 **이것만** 쓴다.
// 부하를 주지 않고 로그에도 평범한 요청 하나로만 남는다.
//
//   node rate-limit-headers.mjs https://example.com/               (GET)
//   node rate-limit-headers.mjs https://example.com/api/... OPTIONS
//
// 두 번째 인자로 메서드를 줄 수 있다(기본 GET). 로그인 API 라면
// OPTIONS(preflight) 가 부작용이 없어 더 안전하다.

const url = process.argv[2];
const method = (process.argv[3] || 'GET').toUpperCase();
if (!url) {
  console.error('사용법: node rate-limit-headers.mjs <URL> [메서드=GET]');
  console.error('  예:   node rate-limit-headers.mjs https://web.thinkwise.co.kr/');
  process.exit(2);
}

// 흔히 쓰이는 레이트 리밋 헤더 이름들. 구현마다 조금씩 다르다.
// (표준안 RateLimit-* / 관행 X-RateLimit-* / nginx·cloudflare 계열)
const RL_HEADERS = [
  'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset', 'ratelimit-policy',
  'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
  'retry-after',
  'x-rate-limit-limit', 'x-rate-limit-remaining',
];

const res = await fetch(url, { method, redirect: 'manual' }).catch((e) => {
  console.error('연결 실패:', String(e).slice(0, 160));
  console.error('  · 주소가 맞나? (https:// 포함)');
  console.error('  · 방화벽/VPN 뒤라 이 PC 에서 못 닿는 건 아닌가');
  process.exit(1);
});

const all = [...res.headers.entries()];
const hit = all.filter(([k]) => RL_HEADERS.includes(k.toLowerCase()));

console.log(`대상: ${method} ${url}`);
console.log(`상태: ${res.status} ${res.statusText}`);
console.log(`서버: ${res.headers.get('server') || '(없음)'}`);
console.log();

if (hit.length) {
  console.log('✅ 레이트 리밋 헤더가 **있다** — 설정돼 있을 가능성이 높다:');
  for (const [k, v] of hit) console.log(`   ${k}: ${v}`);
  console.log();
  console.log('   해석:');
  console.log('   · ratelimit-limit / x-ratelimit-limit = 창당 허용 횟수');
  console.log('   · *-remaining = 지금 남은 횟수 (매 응답 줄어든다)');
  console.log('   · retry-after = (429 일 때) 몇 초 뒤 재시도');
} else {
  console.log('❔ 레이트 리밋 헤더가 **안 보인다.**');
  console.log();
  console.log('   주의: **헤더가 없다고 리밋이 없는 건 아니다.**');
  console.log('   많은 구현(우리 API 포함)은 평상시엔 헤더를 안 붙이고,');
  console.log('   **한도를 넘겼을 때만 429 + Retry-After** 를 낸다.');
  console.log('   즉 이 방법으로는 "있음" 은 확인해도 "없음" 은 단정 못 한다.');
  console.log();
  console.log('   더 확실히 하려면 (남의 서버라면 반드시 **동의부터**):');
  console.log('   · 상대에게 직접 물어본다 — "레이트 리밋 설정돼 있나요?"');
  console.log('   · 합의된 부하 테스트만 rate-limit-probe.mjs 로 한다');
}

console.log();
console.log('── 참고: 받은 응답 헤더 전체 ──');
for (const [k, v] of all) console.log(`   ${k}: ${v}`);
