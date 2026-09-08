// `check_items` **도구 계층** 테스트 (2026-09-09) — McpToolsService 를 가짜
// MapsService·FocusService 로 직접 만들어 인자 해석·문장·저장 호출을 본다.
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 순수 부분(check-items.test.mjs)이 맞아도 도구 계층이
// ⑴ "current"/"selected" 를 못 풀거나 ⑵ 바뀐 것이 없는데 저장해 버전을
// 늘리거나 ⑶ 공개 중·읽기 권한을 통과시키거나 ⑷ 저장 인자(keepVersion ·
// same-user-ok)가 append_to_map 과 다르면 사용자는 그것을 겪는다. DB 없이
// 도는 것이 목적이라 서버 판정(권한·잠금·버전)은 여기서 **흉내만** 낸다 —
// 진짜 판정은 MapsService 의 것이고 e2e210 이 append 로 이미 재 봤다.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §9.12

import { emmToSnapshot } from '../dist/mcp/emm-to-doc.js';
import { findByPath } from '../dist/mcp/append-to-map.js';
import { McpToolsService } from '../dist/mcp/mcp-tools.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

const MD = [
  '# easymindmap 할 일', '',
  '## 0단계 · 실측', '',
  '### 데이터스토어 구성', '', '- [ ] 완료', '',
  '### 이웃 VM 자원 점유', '', '- [ ] 완료', '',
  '## 1단계 · 스키마', '',
  '### maps.owner_id CASCADE 제거', '', '- [ ] 완료', '',
  '### FK 를 RESTRICT 로', '',
].join('\n');
const MAP_ID = '11111111-2222-4333-8444-555555555555';
const USER = 'u1';

/** 가짜 서비스 한 벌 — 문서 하나를 들고 저장 호출을 기록한다 */
function harness(over = {}) {
  const snap = emmToSnapshot(MD, 'easymindmap 할 일');
  const state = {
    doc: snap, published: false, role: 'owner', version: 3, saves: [],
  };
  const maps = {
    async getDocument(userId, mapId) {
      if (mapId !== MAP_ID) { const e = new Error('없음'); e.response = { message: '맵을 찾을 수 없습니다' }; throw e; }
      return { doc: state.doc, title: 'easymindmap 할 일', mapId, updatedAt: new Date(), published: state.published, role: state.role };
    },
    async saveDocument(userId, mapId, doc, title, keepVersion, _a, _b, client, opts) {
      state.saves.push({ mapId, keepVersion, client, opts });
      state.doc = doc;
      state.version += 1;
      return { version: state.version };
    },
    async getOne() { return { title: 'easymindmap 할 일' }; },
  };
  // 선택 노드는 **이 harness 의 문서**에서 골라야 한다 — 파서 id 가 시각
  // 기반이라 다른 harness 에서 파싱한 id 와는 어긋난다(처음 그렇게 썼다가 실패).
  state.focus = over.focus ?? null;
  const focus = { get: () => state.focus };
  const svc = new McpToolsService(maps, {}, focus);
  return {
    svc, state,
    textOf: (path) => findByPath(state.doc.map, path).node.text,
    idOf: (path) => findByPath(state.doc.map, path).node.id,
    select: (path) => { state.focus = { mapId: MAP_ID, nodeId: findByPath(state.doc.map, path).node.id, path: [path], at: Date.now() }; },
  };
}

// ── ① 이름 둘 → 체크 2 · 저장 1(버전) · 저장 인자는 append 와 같다 ─────
{
  const h = harness();
  const r = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['데이터스토어 구성', 'maps.owner_id CASCADE 제거'] });
  check('성공(isError 없음)', r.isError, undefined);
  check('문장: 2개 체크 · 버전 4', [/체크박스 2개를 체크했습니다/.test(r.content[0].text), /히스토리 버전 4/.test(r.content[0].text)], [true, true]);
  check('노드별 줄', /"0단계 · 실측 > 데이터스토어 구성": 체크 1개/.test(r.content[0].text), true);
  check('저장 1회 · keepVersion · MCP 클라이언트 · same-user-ok',
    h.state.saves.map((s) => [s.keepVersion, s.client.platform, s.opts.lockPolicy]), [[true, 'MCP', 'same-user-ok']]);
  check('문서에 반영', [h.textOf('데이터스토어 구성'), h.textOf('이웃 VM 자원 점유')], ['데이터스토어 구성\n- [x] 완료', '이웃 VM 자원 점유\n- [ ] 완료']);
  check('스냅샷 껍데기(v·editor) 유지', [h.state.doc.v, h.state.doc.editor.layoutType], [2, 'radial-bidirectional']);
}

// ── ② 바뀐 것이 없으면 저장하지 않는다 ─────────────────────────────
{
  const h = harness();
  const r = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['FK 를 RESTRICT 로'] });
  check('체크박스 없는 노드 → isError · 저장 0', [r.isError, h.state.saves.length], [true, 0]);
  check('체크박스 있는 노드를 알려 준다', /체크박스가 있는 노드:\n- "0단계 · 실측 > 데이터스토어 구성": \[ \] 완료/.test(r.content[0].text), true);
  await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['데이터스토어 구성'] });
  const r2 = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['데이터스토어 구성'] });
  check('이미 체크 → isError · 저장은 첫 번째 1회뿐', [r2.isError, /이미 체크된 것 1개/.test(r2.content[0].text), h.state.saves.length], [true, true, 1]);
}

// ── ③ "current" · "selected" — 앱이 알려 준 자리 ────────────────────
{
  const h = harness();
  h.select('maps.owner_id CASCADE 제거');
  const r = await h.svc.call(USER, 'check_items', { map_id: 'current', nodes: ['selected'] });
  check('current + selected → 그 노드', [r.isError, /"1단계 · 스키마 > maps.owner_id CASCADE 제거": 체크 1개/.test(r.content[0].text)], [undefined, true]);
  const h2 = harness();
  const r2 = await h2.svc.call(USER, 'check_items', { map_id: 'current', nodes: ['x'] });
  check('열린 맵 없음 → isError', [r2.isError, /열어 둔 맵이 없습니다/.test(r2.content[0].text)], [true, true]);
  const h3 = harness({ focus: { mapId: MAP_ID, nodeId: null, path: [], at: Date.now() } });
  const r3 = await h3.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['selected'] });
  check('선택 없음 → isError', [r3.isError, /선택한 노드가 없습니다/.test(r3.content[0].text)], [true, true]);
}

// ── ④ 공개 중 · 읽기 권한 → 거절, 저장 0 ───────────────────────────
{
  const h = harness();
  h.state.published = true;
  const r = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['데이터스토어 구성'] });
  check('공개 중 → isError', [r.isError, /공개\(퍼블리싱\) 중/.test(r.content[0].text), h.state.saves.length], [true, true, 0]);
  const h2 = harness();
  h2.state.role = 'viewer';
  const r2 = await h2.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['데이터스토어 구성'] });
  check('읽기 권한 → isError("체크할 수 없습니다")', [r2.isError, /체크할 수 없습니다/.test(r2.content[0].text)], [true, true]);
}

// ── ⑤ 인자 모양 — checked:false · nodes 문자열 하나 · 빈 nodes · 틀린 id ─
{
  const h = harness();
  await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: '데이터스토어 구성' });
  check('nodes 문자열 하나도 받는다', h.textOf('데이터스토어 구성'), '데이터스토어 구성\n- [x] 완료');
  const r = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['데이터스토어 구성'], checked: false });
  check('checked:false → 해제 문장', [/1개를 체크 해제했습니다/.test(r.content[0].text), h.textOf('데이터스토어 구성')], [true, '데이터스토어 구성\n- [ ] 완료']);
  const r2 = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: [] });
  check('빈 nodes → isError', [r2.isError, /비어 있습니다/.test(r2.content[0].text)], [true, true]);
  const r3 = await h.svc.call(USER, 'check_items', { map_id: 'abc', nodes: ['x'] });
  check('UUID 아님 → isError', [r3.isError, /UUID/.test(r3.content[0].text)], [true, true]);
  const r4 = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['없는 것', '데이터스토어 구성'] });
  check('못 찾은 것은 건너뛰고 나머지 진행', [r4.isError, /"없는 것": 건너뜀/.test(r4.content[0].text), /체크박스 1개를 체크/.test(r4.content[0].text)], [undefined, true, true]);
}

// ── ⑥ 회귀 — append_to_map 은 공통 함수로 옮긴 뒤에도 그대로 ───────
{
  const h = harness();
  const r = await h.svc.call(USER, 'append_to_map', { map_id: MAP_ID, parent: '1단계 · 스키마', markdown: '- 새 항목\n  - [ ] 완료' });
  check('append 성공 문장', [r.isError, /"1단계 · 스키마" 아래에 노드 1개\(바로 아래 1개\)를 붙였습니다\. \(히스토리 버전 4\)/.test(r.content[0].text)], [undefined, true]);
  check('append 저장 인자 같다', h.state.saves.map((s) => [s.keepVersion, s.opts.lockPolicy]), [[true, 'same-user-ok']]);
  const r2 = await h.svc.call(USER, 'check_items', { map_id: MAP_ID, nodes: ['새 항목'] });
  check('붙인 노드의 체크 줄도 체크된다', [r2.isError, h.textOf('새 항목')], [undefined, '새 항목\n- [x] 완료']);
  h.state.published = true;
  const r3 = await h.svc.call(USER, 'append_to_map', { map_id: MAP_ID, parent: '', markdown: '- x' });
  check('append: 공개 중 거절 그대로', [r3.isError, /공개\(퍼블리싱\) 중/.test(r3.content[0].text)], [true, true]);
  h.state.published = false; h.state.role = 'viewer';
  const r4 = await h.svc.call(USER, 'append_to_map', { map_id: MAP_ID, parent: '', markdown: '- x' });
  check('append: 읽기 권한 문장 그대로("붙일 수 없습니다")', /붙일 수 없습니다/.test(r4.content[0].text), true);
}

console.log(failed === 0 ? '\n모두 통과' : `\n실패 ${failed}건`);
process.exit(failed === 0 ? 0 : 1);
