/**
 * MCP 의 JSON-RPC 2.0 계층 — **HTTP 와 무관한 순수 함수**로 둔다.
 * 그래야 서버를 띄우지 않고 표 하나로 검증할 수 있다(test/mcp-jsonrpc.test.mjs).
 *
 * ── 왜 공식 SDK(@modelcontextprotocol/sdk)를 쓰지 않나 ─────────────
 * 이 앱은 `tsconfig module=commonjs` 로 빌드된다. ESM 전용 패키지를
 * import 하면 런타임에 `ERR_REQUIRE_ESM` 으로 죽는다 — 2026-08-01 배포
 * 실패가 그것이었고, `@nestjs/config@12` 를 되돌린 이유도 같다
 * (apps/api/README.md). 우리가 쓰는 것은 메서드 네 개뿐이라, 의존을
 * 하나 더 지고 그 위험을 떠안는 것보다 여기에 적는 편이 싸다.
 * 3단계(OAuth) 때 다시 따진다.
 */

/** 우리가 말할 수 있는 프로토콜 버전 — 새것이 앞에 온다 */
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

export const SERVER_INFO = { name: 'easymindmap', version: '1' } as const;

/** JSON-RPC 표준 오류 코드 */
export const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

export type RpcId = string | number | null;

export interface RpcRequest {
  jsonrpc: '2.0';
  id?: RpcId;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: RpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function rpcResult(id: RpcId, result: unknown): RpcResponse {
  return { jsonrpc: '2.0', id, result };
}

export function rpcError(id: RpcId, code: number, message: string): RpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

/**
 * 한 덩어리가 **요청**인지 **통지**인지 가른다.
 * 통지(id 없음)에는 **응답을 보내지 않는다** — JSON-RPC 규칙이고,
 * 어기면 클라이언트가 짝 없는 응답을 받고 연결을 끊는다.
 */
export function isNotification(msg: RpcRequest): boolean {
  return msg.id === undefined;
}

export function isValidRpc(msg: unknown): msg is RpcRequest {
  const m = msg as RpcRequest | null;
  return !!m && typeof m === 'object' && m.jsonrpc === '2.0' && typeof m.method === 'string';
}

/**
 * 클라이언트가 요청한 버전에 맞춰 준다. 우리가 아는 버전이면 **그대로
 * 돌려주고**(그쪽이 그 버전으로 말한다), 모르는 버전이면 우리 최신을
 * 제안한다 — 그러면 클라이언트가 받아들일지 스스로 정한다.
 */
export function negotiateProtocol(asked: unknown): string {
  return typeof asked === 'string' && SUPPORTED_PROTOCOL_VERSIONS.includes(asked)
    ? asked
    : LATEST_PROTOCOL_VERSION;
}

export function initializeResult(asked: unknown, instructions: string): unknown {
  return {
    protocolVersion: negotiateProtocol(asked),
    // 1단계는 도구뿐이다 — resources·prompts 는 알리지 않는다.
    // 없는 능력을 알리면 클라이언트가 부르고 우리가 -32601 을 돌려준다.
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions,
  };
}
