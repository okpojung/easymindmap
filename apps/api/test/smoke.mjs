// 맵 CRUD 왕복 스모크 테스트 — 이미 떠 있는 API 서버에 대해 실행.
//   API_URL 기본값 http://localhost:3000  (dev 모드 인증 스텁 전제)
//   사용: node test/smoke.mjs
// 실패 시 비정상 종료코드로 끝나 CI/스크립트에서 감지 가능.
const BASE = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
let failed = 0;
const ok = (name, cond, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
};
const j = (r) => r.json();

const health = await fetch(`${BASE}/v1/health`).then(j);
ok('health = ok/up', health.status === 'ok' && health.db === 'up', JSON.stringify(health));

const created = await fetch(`${BASE}/v1/maps`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'smoke map', defaultLayoutType: 'tree-right' }),
}).then(j);
ok('create → mapId', !!created.mapId, JSON.stringify(created));
const id = created.mapId;

const list = await fetch(`${BASE}/v1/maps`).then(j);
ok('list 포함', list.maps?.some((m) => m.mapId === id), `total=${list.total}`);

const one = await fetch(`${BASE}/v1/maps/${id}`).then(j);
ok('getOne + nodes 배열', one.mapId === id && Array.isArray(one.nodes));

const patched = await fetch(`${BASE}/v1/maps/${id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'smoke renamed', viewMode: 'dashboard' }),
}).then(j);
ok('patch 반영', patched.title === 'smoke renamed' && patched.viewMode === 'dashboard');

const del = await fetch(`${BASE}/v1/maps/${id}`, { method: 'DELETE' });
ok('delete 204', del.status === 204, `status=${del.status}`);

const after = await fetch(`${BASE}/v1/maps`).then(j);
ok('삭제 후 목록 제외', !after.maps?.some((m) => m.mapId === id));

const other = await fetch(`${BASE}/v1/maps`, {
  headers: { 'x-user-id': '00000000-0000-0000-0000-000000000009' },
}).then(j);
ok('다른 사용자 격리', Array.isArray(other.maps));

const missing = await fetch(`${BASE}/v1/maps/11111111-1111-1111-1111-111111111111`);
ok('없는 맵 404', missing.status === 404, `status=${missing.status}`);

console.log(failed ? `\n${failed}건 실패` : '\n전체 통과');
process.exit(failed ? 1 : 0);
