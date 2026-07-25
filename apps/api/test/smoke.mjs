// 맵·노드·autosave 왕복 스모크 — 이미 떠 있는 API 서버에 대해 실행.
//   API_URL 기본값 http://localhost:3000  (dev 모드 인증 스텁 전제)
//   사용: node test/smoke.mjs
// 실패 시 비정상 종료코드로 끝나 CI/스크립트에서 감지 가능.
const BASE = (process.env.API_URL || 'http://localhost:3000').replace(/\/$/, '');
let failed = 0;
const ok = (name, cond, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failed++;
};
const req = async (method, path, body, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await r.json(); } catch { /* 204 등 */ }
  return { status: r.status, data };
};

// ═══ 맵 CRUD ═══════════════════════════════════════════════
const health = (await req('GET', '/v1/health')).data;
ok('health = ok/up', health.status === 'ok' && health.db === 'up', JSON.stringify(health));

const created = (await req('POST', '/v1/maps', { title: 'smoke map', defaultLayoutType: 'tree-right' })).data;
ok('map create → mapId', !!created.mapId);
const mapId = created.mapId;

const list = (await req('GET', '/v1/maps')).data;
ok('map list 포함', list.maps?.some((m) => m.mapId === mapId));

const patched = (await req('PATCH', `/v1/maps/${mapId}`, { title: 'renamed', viewMode: 'dashboard' })).data;
ok('map patch 반영', patched.title === 'renamed' && patched.viewMode === 'dashboard');

// ═══ 노드 CRUD + ltree ═════════════════════════════════════
const root = (await req('POST', `/v1/maps/${mapId}/nodes`, { text: '중심 주제' })).data;
ok('root 생성(parentId=null, depth 0, path=root)',
   root.parentId === null && root.depth === 0 && root.path === 'root', JSON.stringify(root));

const dupRoot = await req('POST', `/v1/maps/${mapId}/nodes`, { text: '중복 루트' });
ok('두 번째 루트 거부(400)', dupRoot.status === 400, `status=${dupRoot.status}`);

const child = (await req('POST', `/v1/maps/${mapId}/nodes`, { parentId: root.id, text: '자식1' })).data;
ok('child 생성(depth 1, path=root.*)',
   child.depth === 1 && child.parentId === root.id && child.path.startsWith('root.'), JSON.stringify(child));

const loaded = (await req('GET', `/v1/maps/${mapId}`)).data;
ok('map 로드 시 노드 2개', loaded.nodes?.length === 2, `nodes=${loaded.nodes?.length}`);

const upd = (await req('PATCH', `/v1/nodes/${child.id}`, { text: '자식 수정', style: { fillColor: '#FFE066' } })).data;
ok('node update(text·style)', upd.text === '자식 수정' && upd.style?.fillColor === '#FFE066');

const lay = (await req('PATCH', `/v1/nodes/${child.id}/layout`, { layoutType: 'tree-down' })).data;
ok('node layout 변경', lay.layoutType === 'tree-down');

const child2 = (await req('POST', `/v1/maps/${mapId}/nodes`, { parentId: root.id, text: '자식2' })).data;
const moved = (await req('PATCH', `/v1/nodes/${child2.id}/move`, { newParentId: child.id, orderIndex: 1 })).data;
ok('node move(부모=자식1, depth 2)',
   moved.parentId === child.id && moved.depth === 2 && moved.path.startsWith(child.path + '.'),
   JSON.stringify({ parentId: moved.parentId, depth: moved.depth, path: moved.path }));

// 순환 이동 차단: 조상(child)을 자기 자손(child2) 밑으로 이동 → 400
const cyc = await req('PATCH', `/v1/nodes/${child.id}/move`, { newParentId: child2.id, orderIndex: 0 });
ok('순환 이동 차단(400)', cyc.status === 400, `status=${cyc.status}`);

// ═══ autosave (버전 + 멱등성) ══════════════════════════════
const newId = crypto.randomUUID();
const av1 = await req('PATCH', `/v1/maps/${mapId}/nodes`, {
  clientId: 'cli_smoke', patchId: 'p_smoke_1', baseVersion: 0,
  patches: [
    { op: 'add', nodeId: newId, data: { parentId: root.id, text: 'AS추가', orderIndex: 9 } },
    { op: 'update', nodeId: child.id, data: { text: 'AS수정' } },
  ],
});
ok('autosave → newVersion 1', av1.status === 200 && av1.data.newVersion === 1, JSON.stringify(av1.data));

const dup = await req('PATCH', `/v1/maps/${mapId}/nodes`, {
  clientId: 'cli_smoke', patchId: 'p_smoke_1', baseVersion: 1, patches: [],
});
ok('autosave 중복 patchId(409 DUPLICATE_PATCH)',
   dup.status === 409 && dup.data.error === 'DUPLICATE_PATCH', JSON.stringify(dup.data));

const vc = await req('PATCH', `/v1/maps/${mapId}/nodes`, {
  clientId: 'cli_smoke', patchId: 'p_smoke_stale', baseVersion: 0, patches: [],
});
ok('autosave 버전 충돌(409 VERSION_CONFLICT, currentVersion 1)',
   vc.status === 409 && vc.data.error === 'VERSION_CONFLICT' && vc.data.currentVersion === 1,
   JSON.stringify(vc.data));

const afterAv = (await req('GET', `/v1/maps/${mapId}`)).data;
ok('autosave 반영(추가 노드 존재·child 텍스트 AS수정)',
   afterAv.nodes.some((n) => n.id === newId) && afterAv.nodes.find((n) => n.id === child.id)?.text === 'AS수정');

// ═══ 문서 스냅샷(클라우드 저장) ════════════════════════════
const doc = {
  version: 1,
  map: { id: 'root', text: '중심', children: [{ id: 'c', text: '자식', img: 'data:image/png;base64,AAAA' }] },
};
const saveDoc = await req('PUT', `/v1/maps/${mapId}/document`, { doc, title: '스냅샷 저장됨' });
ok('문서 스냅샷 저장(200)', saveDoc.status === 200 && !!saveDoc.data.updatedAt, JSON.stringify(saveDoc.data));

const getDoc = await req('GET', `/v1/maps/${mapId}/document`);
ok('문서 스냅샷 조회(손실 없이 왕복)',
   getDoc.status === 200 &&
   getDoc.data.doc?.map?.children?.[0]?.img === 'data:image/png;base64,AAAA' &&
   getDoc.data.title === '스냅샷 저장됨',
   JSON.stringify(getDoc.data).slice(0, 120));

const noDoc = await req('GET', `/v1/maps/11111111-1111-1111-1111-111111111111/document`);
ok('없는 맵 문서 404', noDoc.status === 404, `status=${noDoc.status}`);

// ═══ cascade 삭제 ══════════════════════════════════════════
const delRoot = await req('DELETE', `/v1/nodes/${root.id}`);
ok('root 삭제 204', delRoot.status === 204, `status=${delRoot.status}`);
const empty = (await req('GET', `/v1/maps/${mapId}`)).data;
ok('cascade 삭제로 노드 0개', empty.nodes?.length === 0, `nodes=${empty.nodes?.length}`);

// ═══ 인증/격리/404 ═════════════════════════════════════════
const other = (await req('GET', '/v1/maps', undefined, { 'x-user-id': '00000000-0000-0000-0000-000000000009' })).data;
ok('다른 사용자 격리', Array.isArray(other.maps) && !other.maps.some((m) => m.mapId === mapId));
const missing = await req('GET', '/v1/maps/11111111-1111-1111-1111-111111111111');
ok('없는 맵 404', missing.status === 404, `status=${missing.status}`);

console.log(failed ? `\n${failed}건 실패` : '\n전체 통과');
process.exit(failed ? 1 : 0);
