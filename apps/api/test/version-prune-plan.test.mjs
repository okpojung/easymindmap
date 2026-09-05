// version-prune-plan 단위 테스트 (2026-09-06, 13a §2).
//
//   npm run build && npm run test:version-prune
//
// DB 없이 돈다 — 계획 함수가 순수하기 때문이다. 시계는 고정한다.

import assert from 'node:assert/strict';
import { planPrune, RECENT_MAX } from '../dist/versions/version-prune-plan.js';

const NOW = new Date('2026-09-06T12:00:00Z');
const H = 3_600_000, D = 24 * H;
let n = 0;
const ago = (ms) => new Date(NOW.getTime() - ms);
const mk = (rows) => rows.map(([version, agoMs]) => ({ id: `v${version}`, version, createdAt: ago(agoMs) }));
const ids = (list) => list.map((v) => v.version).sort((a, b) => a - b);
const opts = (o = {}) => ({ versionDays: 7, graceDays: 7, since: null, ...o });
const test = (name, fn) => { n++; try { fn(); console.log(`PASS [${n}] ${name}`); } catch (e) { console.log(`FAIL [${n}] ${name} — ${e.message}`); process.exitCode = 1; } };

test('최근 24시간은 전부 남기되 최대 20개 — 최신 버전은 따로 무조건', () => {
  // 26개, 30분 간격. 최신(26)은 후보에서 빠지고 25개 중 20개 남는다
  const rows = mk(Array.from({ length: 26 }, (_, i) => [26 - i, i * 30 * 60_000]));
  const p = planPrune(rows, 26, NOW, opts());
  assert.equal(p.expired.length, 0);
  assert.equal(p.kept.length, RECENT_MAX + 1);
  assert.deepEqual(ids(p.thinned), [1, 2, 3, 4, 5]);
});

test('1~7일: 8시간 칸마다 하나 (하루 3개) — 칸에서는 가장 새것을 남긴다', () => {
  // 2일 전부터 3일 전까지 1시간 간격 24개 (48h~71h)
  const rows = mk(Array.from({ length: 24 }, (_, i) => [100 - i, 48 * H + i * H]));
  const p = planPrune([...rows, ...mk([[999, 0]])], 999, NOW, opts());
  const kept = p.kept.filter((v) => v.version !== 999);
  assert.equal(kept.length, 3, `남긴 것 ${ids(kept)}`);
  // 각 칸의 가장 새것 = 나이 48h·56h·64h
  assert.deepEqual(kept.map((v) => (NOW - v.createdAt) / H).sort((a, b) => a - b), [48, 56, 64]);
  assert.equal(p.thinned.length, 21);
});

test('7~30일: 하루 하나 · 30일 뒤: 주 하나 (보관 무제한일 때)', () => {
  const rows = [
    ...mk(Array.from({ length: 48 }, (_, i) => [500 - i, 10 * D + i * H])),   // 10~12일: 2일치, 시간마다
    ...mk(Array.from({ length: 21 }, (_, i) => [300 - i, 40 * D + i * D])),  // 40~61일: 3주치, 날마다
  ];
  const p = planPrune([...rows, ...mk([[999, 0]])], 999, NOW, opts({ versionDays: null }));
  const kept = p.kept.filter((v) => v.version !== 999);
  const days = kept.filter((v) => (NOW - v.createdAt) < 30 * D).length;
  const weeks = kept.filter((v) => (NOW - v.createdAt) >= 30 * D).length;
  assert.equal(days, 2, `일 단위 ${days}`);
  // 40~60일은 주 칸(floor(나이/7일)) 5·6·7·8 네 개에 걸친다 — 3주치라도 칸은 넷
  assert.equal(weeks, 4, `주 단위 ${weeks}`);
  assert.equal(p.expired.length, 0, '무제한이면 만료 없음');
});

test('보관 7일 + 유예 7일: 15일 전은 만료 · 10일 전은 유예 중(deleteAt) · 5일 전은 그대로', () => {
  const p = planPrune(mk([[1, 15 * D], [2, 10 * D], [3, 5 * D], [4, 0]]), 4, NOW, opts());
  assert.deepEqual(ids(p.expired), [1]);
  assert.equal(p.expiring.length, 1);
  assert.equal(p.expiring[0].version, 2);
  assert.equal(p.expiring[0].deleteAt.toISOString(), ago(10 * D - 14 * D).toISOString());
  assert.deepEqual(ids(p.kept), [2, 3, 4]);
});

test('★ 최신 버전은 400일 됐어도 남는다 (복원의 기준점)', () => {
  const p = planPrune(mk([[1, 400 * D]]), 1, NOW, opts());
  assert.deepEqual(ids(p.kept), [1]);
  assert.equal(p.expired.length, 0);
});

test('★ since 이전 버전은 만료됐어도 건드리지 않는다 (13a §6 소급 금지)', () => {
  const since = ago(100 * D);
  const p = planPrune(mk([[1, 200 * D], [2, 50 * D], [3, 0]]), 3, NOW, opts({ since }));
  assert.deepEqual(ids(p.expired), [2]);
  assert.deepEqual(ids(p.kept), [1, 3]);
});

test('유예 중인 것도 밀도 규칙은 받는다 — 같은 칸이면 솎이고 expiring 에서 빠진다', () => {
  // 보관 3일·유예 7일. 5일 전 같은 8h 칸에 둘
  const p = planPrune(mk([[1, 5 * D + 2 * H], [2, 5 * D + H], [3, 0]]), 3, NOW, opts({ versionDays: 3 }));
  assert.deepEqual(ids(p.thinned), [1]);
  assert.deepEqual(p.expiring.map((v) => v.version), [2]);
});

test('후보가 비어 있으면 아무것도 없다', () => {
  const p = planPrune([], 0, NOW, opts());
  assert.deepEqual(p, { expired: [], thinned: [], expiring: [], kept: [] });
});

console.log(process.exitCode ? '실패 있음' : '전부 통과');
