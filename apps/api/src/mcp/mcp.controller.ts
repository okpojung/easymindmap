import {
  All, Body, Controller, HttpCode, Logger, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpToolsService } from './mcp-tools';
import {
  RPC, initializeResult, isNotification, isValidRpc, rpcError, rpcResult,
  type RpcRequest, type RpcResponse,
} from './jsonrpc';

/**
 * `/v1/mcp` — 원격 MCP 서버(Streamable HTTP).
 * 설계: docs/04-extensions/ai/mcp-connector.md §4 (기존 API 안에 붙인다)
 *
 * 이 컨트롤러가 하는 일은 **JSON-RPC 봉투를 여닫는 것뿐**이다. 실제 일은
 * McpToolsService 가 하고, 그것은 다시 MapsService 를 부른다. 라우트가
 * 이렇게 한 폴더에 모여 있으면 1단계가 쓸모없다고 판정될 때 **폴더째
 * 지우는 것으로 끝난다** (§7 "1단계에서 멈출 수 있어야 한다").
 */
@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  private readonly log = new Logger(McpController.name);

  constructor(private readonly tools: McpToolsService) {}

  /**
   * Streamable HTTP 의 본선. 한 요청에 JSON-RPC **한 덩어리 또는 배열**이
   * 온다. 응답은 언제나 `application/json` 이다 — SSE 스트림은 열지
   * 않는다(우리 도구는 서버가 먼저 말을 걸 일이 없다).
   *
   * 전역 ValidationPipe 는 여기를 건드리지 않는다: `@Body()` 에 DTO 클래스를
   * 붙이지 않았으므로 검사 대상이 아니다. JSON-RPC 본문은 **모양이
   * 메서드마다 다르므로** DTO 로 묶을 수 없고, 검증은 아래에서 직접 한다.
   */
  @Post()
  @HttpCode(200)
  async rpc(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const batch = Array.isArray(body) ? body : [body];
    if (batch.length === 0) {
      res.status(400).json(rpcError(null, RPC.INVALID_REQUEST, '빈 요청입니다.'));
      return;
    }

    const out: RpcResponse[] = [];
    for (const msg of batch) {
      if (!isValidRpc(msg)) {
        out.push(rpcError(null, RPC.INVALID_REQUEST, 'JSON-RPC 2.0 형식이 아닙니다.'));
        continue;
      }
      const reply = await this.handle(user.id, msg);
      if (reply) out.push(reply);
    }

    // 통지만 온 요청 — 돌려줄 것이 없다. 규격이 정한 응답은 **202 + 빈 본문**
    if (out.length === 0) { res.status(202).end(); return; }
    res.status(200).json(Array.isArray(body) ? out : out[0]);
  }

  /**
   * POST 말고 다른 메서드 — Streamable HTTP 는 GET(서버→클라이언트 SSE)과
   * DELETE(세션 종료)도 **선택 사항**으로 둔다. 우리는 세션을 들고 있지
   * 않으므로 둘 다 없다. 규격이 정한 대로 **405** 로 분명히 답한다 —
   * 404 로 두면 클라이언트가 "주소가 틀렸나" 를 의심하며 붙지 못한다.
   */
  @All()
  @HttpCode(405)
  notAllowed(@Req() req: Request, @Res() res: Response): void {
    res.setHeader('Allow', 'POST');
    res.status(405).json(
      rpcError(null, RPC.INVALID_REQUEST,
        `${req.method} 은 지원하지 않습니다 — JSON-RPC 요청을 POST 로 보내 주세요.`),
    );
  }

  /** 한 덩어리 처리. 통지면 null(= 응답 없음) */
  private async handle(userId: string, msg: RpcRequest): Promise<RpcResponse | null> {
    const id = msg.id ?? null;
    const params = (msg.params ?? {}) as Record<string, unknown>;

    switch (msg.method) {
      case 'initialize':
        return rpcResult(id, initializeResult(params.protocolVersion, INSTRUCTIONS));

      // 클라이언트가 준비를 마쳤다는 통지 — 받아 두기만 한다
      case 'notifications/initialized':
      case 'notifications/cancelled':
        return null;

      case 'ping':
        return isNotification(msg) ? null : rpcResult(id, {});

      case 'tools/list':
        return rpcResult(id, { tools: this.tools.list() });

      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : '';
        if (!name) return rpcError(id, RPC.INVALID_PARAMS, 'params.name 이 없습니다.');
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        try {
          return rpcResult(id, await this.tools.call(userId, name, args));
        } catch (err) {
          // 여기까지 온 것은 **도구가 예상하지 못한 실패**다(도구가 다룰 수
          // 있는 실패는 isError 결과로 이미 돌아갔다). 안쪽 사정을 그대로
          // 내보내지 않는다 — 로그에 남기고 대화에는 한 줄만 준다.
          this.log.error(`MCP tools/call 실패 (tool=${name}, user=${userId})`, err as Error);
          return rpcError(id, RPC.INTERNAL_ERROR, '서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      }

      default:
        if (isNotification(msg)) return null;
        return rpcError(id, RPC.METHOD_NOT_FOUND, `지원하지 않는 메서드입니다: ${msg.method}`);
    }
  }
}

/**
 * `initialize` 응답에 실어 보내는 안내 — AI 가 **대화 시작 전에** 읽는다.
 * 도구 설명(mcp-tools.ts)이 "이 도구를 어떻게 부르나" 라면, 이쪽은
 * "이 서버가 무엇이고 언제 쓰나" 다.
 */
const INSTRUCTIONS =
  'EasyMindMap — 대화 내용을 마인드맵으로 저장하고, 문서함의 맵을 읽어 오는 도구입니다. ' +
  '사용자가 "맵으로 저장해줘" 처럼 요청하면 create_map 을 부르세요. ' +
  '넘기는 마크다운은 `# 중심 주제` 로 시작하고 `##`·`###` 로 깊이를 만드는 ' +
  '견출 구조여야 합니다. 기존 맵을 읽거나 이어 쓰려면 list_maps 로 맵 id 를 찾고 ' +
  'get_map 으로 내용을 EMM 마크다운으로 받으세요. 답변을 기존 맵의 어느 노드 아래에 ' +
  '붙이려면 append_to_map(parent: 노드 이름 또는 "가지 > 하위")을, 새 맵으로 만들려면 ' +
  '사용자가 "지금 열려 있는 맵" · "선택한 노드 아래에" 라고 하면 map_id:"current" · parent:"selected" 를 쓰세요(get_open_map 이 그 자리를 알려 줍니다). ' +
  'create_map 을 쓰세요. 맵이나 노드를 지우거나 있는 노드를 바꾸는 도구는 없습니다. ' +
  '도구에 넣은 마크다운을 대화에 다시 쓰지 마세요 — 도구가 돌려준 결과 문장만 짧게 전하면 됩니다 ' +
  '(넣은 내용은 도구 호출에 남아 있어 이 대화 안에서 계속 참고할 수 있고, 다음 대화에서는 get_map 으로 읽으면 됩니다).';
