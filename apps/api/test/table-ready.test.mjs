// `tableReady` 캐시 정책 단위 테스트 (2026-09-05).
//
//   npm run build && npm run test:table-ready
//
// ★ 왜 시험하나 — **"얼마나 기억하는가"가 사용자 경험을 바꾼다.**
// 이 함수는 "표가 있나?" 하나만 답하지만, **없다고 답한 것을 얼마나
// 기억하느냐**가 관리자에게 이렇게 보인다.
//   · 기억한다   → 델타 SQL 을 넣었는데 화면이 **1분 동안 그대로다**.
//                  "적용했는데 왜 안 되지?" 하고 헤맨다
//   · 안 기억한다 → 넣고 새로고침하면 **바로** 된다. 대신 매번 DB 에 묻는다
// 그래서 자주 불리는 자리(맵 열기)는 기억하고, 사람이 델타를 넣고 곧바로
// 확인하는 자리(로그인 기록·관리자 콘솔)는 기억하지 않는다. 그 두 갈래가
// 실제로 갈리는지를 여기서 못 박는다.
//
// DB 없이 돈다 — `query` 만 흉내 낸 가짜를 넘긴다(몇 번 물었는지 센다).

import {
  ALWAYS_RECHECK, DEFAULT_MISS_TTL_MS,
  resetTableReadyCache, tableReady, tableReadyCached,
} from '../dist/common/table-ready.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

/** 표가 있는지를 우리가 정하는 가짜 DB. 몇 번 물었는지 센다 */
function fakeDb(exists) {
  return {
    asked: 0,
    exists,
    async query() {
      this.asked++;
      return { rows: [{ ok: this.exists }] };
    },
  };
}

const T = 'public.probe';

// ── ① 없는 표 — 기본값은 **1분 기억한다**(자주 불리는 자리의 부담을 던다) ──
{
  resetTableReadyCache();
  const db = fakeDb(false);
  check('없으면 false', await tableReady(db, T, { now: 0 }), false);
  check('한 번 물었다', db.asked, 1);
  await tableReady(db, T, { now: 30_000 });
  check('30초 뒤에는 다시 묻지 않는다', db.asked, 1);
  await tableReady(db, T, { now: DEFAULT_MISS_TTL_MS - 1 });
  check('1분 직전까지도 묻지 않는다', db.asked, 1);
  await tableReady(db, T, { now: DEFAULT_MISS_TTL_MS + 1 });
  check('1분이 지나면 다시 묻는다', db.asked, 2);
}

// ── ② ★ ALWAYS_RECHECK — **매번 묻는다** ─────────────────────────
// 로그인 기록·관리자 콘솔이 쓰는 쪽. 델타를 넣자마자 반영돼야 한다.
{
  resetTableReadyCache();
  const db = fakeDb(false);
  for (const now of [0, 1, 2, 3]) {
    await tableReady(db, T, { now, missTtlMs: ALWAYS_RECHECK });
  }
  check('네 번 부르면 네 번 묻는다', db.asked, 4);
}

// ── ③ ★★ 핵심 — **도는 중에 델타를 적용하면 곧바로 알아챈다** ──────
// 관리자가 서버를 재기동하지 않고 SQL 만 넣는 실제 상황이다.
{
  resetTableReadyCache();
  const db = fakeDb(false);
  check('처음엔 없다', await tableReady(db, T, { now: 0, missTtlMs: ALWAYS_RECHECK }), false);
  db.exists = true; // ← 관리자가 델타 SQL 을 적용한 순간
  check('★ 바로 다음 호출에서 true (1분을 기다리지 않는다)',
    await tableReady(db, T, { now: 1, missTtlMs: ALWAYS_RECHECK }), true);
}
{
  // 같은 상황을 기본값으로 하면 1분을 기다려야 한다 — 이것이 우리가
  // 로그인 기록에서 피한 동작이다(둘이 정말 다른지 못 박는다)
  resetTableReadyCache();
  const db = fakeDb(false);
  await tableReady(db, T, { now: 0 });
  db.exists = true;
  check('기본값이면 1분 안에는 아직 false', await tableReady(db, T, { now: 30_000 }), false);
  check('1분이 지나야 true', await tableReady(db, T, { now: 60_001 }), true);
}

// ── ④ 있는 표는 **영구히 기억한다** (표가 사라질 일은 없다) ─────────
{
  resetTableReadyCache();
  const db = fakeDb(true);
  check('있으면 true', await tableReady(db, T, { now: 0 }), true);
  await tableReady(db, T, { now: 10 * 60_000 });
  await tableReady(db, T, { now: 24 * 60 * 60_000 });
  check('하루가 지나도 다시 묻지 않는다', db.asked, 1);
  await tableReady(db, T, { now: 0, missTtlMs: ALWAYS_RECHECK });
  check('ALWAYS_RECHECK 를 줘도 다시 묻지 않는다', db.asked, 1);
}

// ── ⑤ 표마다 따로 기억한다 (한 표의 결과가 다른 표에 번지지 않는다) ──
{
  resetTableReadyCache();
  const db = fakeDb(true);
  await tableReady(db, 'public.a', { now: 0 });
  await tableReady(db, 'public.b', { now: 0 });
  check('둘 다 물었다', db.asked, 2);
  check('a 는 기억한다', tableReadyCached('public.a'), true);
  check('c 는 아직 물어본 적 없다', tableReadyCached('public.c'), null);
  resetTableReadyCache('public.a');
  check('a 만 지웠다', [tableReadyCached('public.a'), tableReadyCached('public.b')], [null, true]);
}

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
