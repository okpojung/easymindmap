// rate-limit-probe.mjs — 배포된 API 에 레이트 리밋이 걸려 있는지 확인한다.
//
// 왜 필요한지·무엇을 하는지: docs/05-implementation/rate-limit.md
//
// ── 실행 (Node 18 이상, 설치 필요 없음) ─────────────────────────────
//   node rate-limit-probe.mjs https://<API호스트>/v1/maps
//
// ⚠️ **API 호스트를 겨눠야 한다.** 프런트(web.thinkwise.co.kr)는 nginx 가
//    정적 파일만 주는 곳이라 레이트 리밋이 없다. API 주소를 모르면 먼저
//    find-api-host.mjs 를 돌려서 찾는다.
//
// ⚠️ **경로는 /v1/maps 를 쓴다. /v1/health 는 안 된다.** health 는 감시
//    도구가 막히면 안 되므로 **레이트 리밋에서 일부러 제외**했다 —
//    아무리 불러도 429 가 안 나서 "리밋 없음" 으로 오판한다.
//    /v1/maps 는 로그인 안 하면 401 이지만, 레이트 리밋이 그 **앞에서**
//    세므로 한도를 넘기면 429 가 나온다 (401 이 나오는 건 정상이다).
//
// 안전장치:
//   · 로그인 없이 부를 수 있는 경로만 두드린다 (401 이 나와도 무방)
//   · 429 가 처음 보이면 **즉시 멈춘다** — 서버에 부담을 최소화한다
//   · 요청은 작은 묶음(batch)으로 나눠 보낸다

const url = process.argv[2];
if (!url) {
  console.error('사용법: node rate-limit-probe.mjs https://<API호스트>/v1/maps');
  console.error('  예:   node rate-limit-probe.mjs https://api.thinkwise.co.kr/v1/maps');
  console.error('  주의: /v1/health 가 아니라 /v1/maps — health 는 리밋 제외 경로다');
  process.exit(2);
}

// 기본 한도(60초 600회)를 넘기려면 넉넉히 쏴야 한다. 필요하면 인자로 조절.
const TOTAL = Number(process.argv[3] || 700);   // 총 요청 수
const BATCH = Number(process.argv[4] || 40);     // 한 묶음 크기(동시 요청)

const t0 = Date.now();
let sent = 0;
const codes = {};        // 상태코드별 개수
let first429 = null;     // 처음 429 를 받은 순번
let sample429 = null;    // 429 응답 표본(본문·헤더)

async function hit(i) {
  try {
    const res = await fetch(url, { headers: { 'x-probe': String(i) } });
    codes[res.status] = (codes[res.status] || 0) + 1;
    if (res.status === 429 && first429 === null) {
      first429 = i;
      let body = '';
      try { body = await res.text(); } catch { /* 무시 */ }
      sample429 = {
        retryAfter: res.headers.get('retry-after'),
        server: res.headers.get('server'),
        poweredBy: res.headers.get('x-powered-by'),
        body: body.slice(0, 300),
      };
    }
  } catch (e) {
    codes['ERR'] = (codes['ERR'] || 0) + 1;
    if (!codes._err0) { codes._err0 = String(e).slice(0, 120); }
  }
}

console.log(`대상: ${url}`);
console.log(`계획: 최대 ${TOTAL}회 (묶음 ${BATCH}), 429 나오면 즉시 중단`);
console.log('참고: 로그인 없이 돌려도 된다 — 429 전의 401/500 은 정상이다.\n');

for (let start = 0; start < TOTAL && first429 === null; start += BATCH) {
  const n = Math.min(BATCH, TOTAL - start);
  await Promise.all(Array.from({ length: n }, (_, k) => hit(start + k + 1)));
  sent += n;
  process.stdout.write(`  보냄 ${sent}\r`);
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n\n총 ${sent}회, ${secs}초`);
console.log('상태코드별:', JSON.stringify(codes));
console.log();

// 429 이전 응답이 401/403/500 인 것은 정상이다 — 로그인 안 했거나(401)
// 서버가 처리하려다 만 것일 뿐, 레이트 리밋은 그 앞에서 세고 있다.
// 우리가 보는 것은 오직 "429 가 나오는가" 다.
if (first429 !== null) {
  console.log(`✅ 레이트 리밋이 **걸려 있다.** (${first429}번째 요청에서 429)`);
  console.log('   429 응답 표본:', JSON.stringify(sample429, null, 2));
  const ours = /요청이 너무 잦습니다|retryAfterSec/.test(sample429.body || '');
  const lib = /ThrottlerException/.test(sample429.body || '');
  const server = (sample429.server || '').toLowerCase();
  console.log();
  if (ours) {
    console.log('   → **우리 API 의 레이트 리밋**이다 (한국어 안내 문구 + retryAfterSec).');
  } else if (lib) {
    console.log('   → throttler 는 걸렸는데 **문구가 라이브러리 원문**이다.');
    console.log('     배포된 API 가 최신(#229)이 아닐 수 있다 — 재배포 확인.');
  } else if (server.includes('nginx') || server.includes('openresty') || server.includes('cloudflare')) {
    console.log('   → 429 를 낸 것이 **우리 API 가 아니라 앞단(nginx/CDN)** 일 수 있다.');
    console.log('     Server 헤더:', sample429.server);
  } else {
    console.log('   → 429 는 맞지만 출처가 불분명하다. 위 표본을 확인.');
  }
} else if ((codes['ERR'] || 0) >= sent * 0.5) {
  // 절반 이상이 연결 실패면 "리밋 없음" 이 아니라 **대상에 못 닿은 것**이다.
  console.log('⚠️  대상에 **연결하지 못했다.** (리밋 유무를 판단할 수 없음)');
  console.log('    오류:', codes._err0 || '(알 수 없음)');
  console.log();
  console.log('   확인:');
  console.log('   · 주소가 맞나? (https:// 포함, /v1/maps 로 끝나야 한다)');
  console.log('   · 그 호스트가 켜져 있나? 브라우저로 <호스트>/v1/health 를 열어 본다');
  console.log('   · 방화벽/VPN 뒤라 이 PC 에서 못 닿는 건 아닌가');
} else {
  console.log('❌ 레이트 리밋이 **안 걸렸다.** (모두 통과 — 429 없음)');
  console.log();
  console.log('   가능한 원인:');
  console.log('   1) API 가 아니라 **프런트(정적 호스트)** 를 겨눴다 → API 주소 확인');
  console.log('   2) 배포된 API 가 최신(#229)이 아니다 → 재배포');
  console.log('   3) RATE_LIMIT_ENABLED=false 로 꺼져 있다');
  console.log(`   4) 한도가 ${TOTAL}회보다 높다 → 3번째 인자를 늘려 재시도`);
  console.log('      예: node rate-limit-probe.mjs ' + url + ' 1500 60');
}
