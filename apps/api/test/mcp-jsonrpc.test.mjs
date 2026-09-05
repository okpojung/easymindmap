// MCP JSON-RPC 계층 단위 테스트 (2026-09-04, MCP 1단계).
//
//   npm run build && npm run test:mcp
//
// 왜 시험하나: 이 계층이 틀리면 **Claude 가 서버에 붙지도 못한다.** 그때
// 사용자가 보는 것은 "연결할 수 없습니다" 한 줄이라, 무엇이 틀렸는지
// 알아낼 방법이 없다. 규격이 못 박은 자리 — 버전 협상 · 통지에는 응답을
// 보내지 않는 것 · 잘못된 봉투 판정 — 을 여기서 고정한다.
//
// 설계: docs/04-extensions/ai/mcp-connector.md §4

import {
  LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, RPC,
  isNotification, isValidRpc, negotiateProtocol, initializeResult, rpcError, rpcResult,
} from '../dist/mcp/jsonrpc.js';
import { TOOL_DEFS } from '../dist/mcp/mcp-tools.js';

let failed = 0;
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      받음 ${g}\n      기대 ${w}`}`);
}

// ── ① 버전 협상 — 아는 버전이면 **그대로 돌려준다** ────────────────
check('최신은 2025-06-18', LATEST_PROTOCOL_VERSION, '2025-06-18');
for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
  check(`아는 버전은 그대로: ${v}`, negotiateProtocol(v), v);
}
check('모르는 버전 → 우리 최신', negotiateProtocol('1999-01-01'), LATEST_PROTOCOL_VERSION);
check('버전이 없어도 죽지 않는다', negotiateProtocol(undefined), LATEST_PROTOCOL_VERSION);
check('문자열이 아니어도 죽지 않는다', negotiateProtocol({ x: 1 }), LATEST_PROTOCOL_VERSION);

// ── ② initialize 응답 — 없는 능력을 알리지 않는다 ───────────────────
{
  const r = initializeResult('2025-03-26', '안내');
  check('요청한 버전으로 답한다', r.protocolVersion, '2025-03-26');
  check('알리는 능력은 tools 뿐', Object.keys(r.capabilities), ['tools']);
  check('serverInfo 이름', r.serverInfo.name, 'easymindmap');
  check('instructions 를 싣는다', r.instructions, '안내');
}

// ── ③ 통지에는 응답을 보내지 않는다 (id 없음) ───────────────────────
check('id 없으면 통지', isNotification({ jsonrpc: '2.0', method: 'x' }), true);
check('id 가 null 이면 요청', isNotification({ jsonrpc: '2.0', id: null, method: 'x' }), false);
check('id 가 0 이어도 요청', isNotification({ jsonrpc: '2.0', id: 0, method: 'x' }), false);

// ── ④ 봉투 판정 ────────────────────────────────────────────────────
check('정상 봉투', isValidRpc({ jsonrpc: '2.0', id: 1, method: 'ping' }), true);
check('jsonrpc 없음', isValidRpc({ id: 1, method: 'ping' }), false);
check('1.0 은 거절', isValidRpc({ jsonrpc: '1.0', id: 1, method: 'ping' }), false);
check('method 없음', isValidRpc({ jsonrpc: '2.0', id: 1 }), false);
check('null 은 거절', isValidRpc(null), false);
check('문자열은 거절', isValidRpc('ping'), false);

// ── ⑤ 응답 모양 ────────────────────────────────────────────────────
check('result 봉투', rpcResult(7, { ok: 1 }), { jsonrpc: '2.0', id: 7, result: { ok: 1 } });
check('error 봉투', rpcError(null, RPC.METHOD_NOT_FOUND, '없음'),
  { jsonrpc: '2.0', id: null, error: { code: -32601, message: '없음' } });

// ── ⑥ 도구는 셋 — create_map(1단계) + list_maps·get_map(2단계, §7) ──
check('도구는 다섯', TOOL_DEFS.map((t) => t.name), ['create_map', 'list_maps', 'get_map', 'get_open_map', 'append_to_map']);
const byName = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t]));
check('get_open_map: 인자 없음', Object.keys(byName.get_open_map.inputSchema.properties), []);
check('create_map: markdown 은 필수', byName.create_map.inputSchema.required, ['markdown']);
check('create_map: 받는 인자는 여섯', Object.keys(byName.create_map.inputSchema.properties).sort(),
  ['block_placement', 'code_to_note', 'long_text_to_note', 'markdown', 'template', 'title']);
check('list_maps: 필수 인자 없음', byName.list_maps.inputSchema.required, undefined);
check('list_maps: 받는 인자는 셋', Object.keys(byName.list_maps.inputSchema.properties).sort(),
  ['folder', 'limit', 'query']);
check('get_map: map_id 만 필수', byName.get_map.inputSchema.required, ['map_id']);
check('append_to_map: map_id·markdown 필수', byName.append_to_map.inputSchema.required, ['map_id', 'markdown']);
check('append_to_map: 받는 인자는 여섯', Object.keys(byName.append_to_map.inputSchema.properties).sort(),
  ['block_placement', 'code_to_note', 'long_text_to_note', 'map_id', 'markdown', 'parent']);
// **지우거나 바꾸는 도구가 없다**(§2-3) — 이름으로 못 박는다. append 는 덧붙이기만이라 허용
check('삭제·수정 도구 없음', TOOL_DEFS.filter((t) => /delete|remove|update|replace|set_/.test(t.name)).length, 0);

console.log(failed ? `\n${failed}개 실패` : '\n전부 통과');
process.exit(failed ? 1 : 0);
