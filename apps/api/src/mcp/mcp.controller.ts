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
/** 로그 한 줄에 넣을 클라이언트 표식 — User-Agent 앞 60자 (토큰·본문은 절대 안 적는다) */
function clientOf(req: Request): string {
  const ua = (req.get('user-agent') ?? '').replace(/\s+/g, ' ').trim();
  return ua ? `[${ua.slice(0, 60)}]` : '[UA 없음]';
}

/** JSON-RPC 한 덩어리를 `method` 또는 `tools/call:도구이름` 으로 */
function describe(msg: RpcRequest): string {
  if (msg.method !== 'tools/call') return msg.method;
  const name = (msg.params as { name?: unknown } | undefined)?.name;
  return `tools/call:${typeof name === 'string' ? name : '?'}`;
}

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
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const batch = Array.isArray(body) ? body : [body];
    if (batch.length === 0) {
      res.status(400).json(rpcError(null, RPC.INVALID_REQUEST, '빈 요청입니다.'));
      this.log.warn(`MCP ${clientOf(req)} ← (빈 요청) → 400`);
      return;
    }

    const out: RpcResponse[] = [];
    const seen: string[] = [];
    for (const msg of batch) {
      if (!isValidRpc(msg)) {
        out.push(rpcError(null, RPC.INVALID_REQUEST, 'JSON-RPC 2.0 형식이 아닙니다.'));
        seen.push('(형식 오류)');
        continue;
      }
      seen.push(describe(msg));
      const reply = await this.handle(user.id, msg);
      if (reply) out.push(reply);
    }

    // 통지만 온 요청 — 돌려줄 것이 없다. 규격이 정한 응답은 **202 + 빈 본문**
    const status = out.length === 0 ? 202 : 200;
    // ★ 한 줄은 남긴다 (2026-09-22) — ChatGPT 가 "액션이 없다" 고 할 때 tools/list 가
    //   왔는지조차 알 길이 없었다(§12.7). 본문·토큰은 적지 않는다.
    this.log.log(`MCP ${clientOf(req)} ← ${seen.join(', ')} → ${status}`);
    if (status === 202) { res.status(202).end(); return; }
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
    // GET 은 Streamable HTTP 클라이언트가 SSE 를 열어 보는 것 — 405 를 견디는지가
    // 클라이언트마다 다르므로 **누가** 그랬는지 남긴다 (§12.7).
    this.log.log(`MCP ${clientOf(req)} ← ${req.method} (JSON-RPC 아님) → 405`);
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
  '"emm"·"EMM"·"이엠엠" 은 EasyMindMap 의 준말입니다 — "emm 으로 작성해 줘"·"emm 맵으로 저장" 은 create_map, "emm 맵에 붙여 줘" 는 append_to_map 입니다. ' +
  '사용자가 "맵으로 저장해줘" 처럼 요청하면 create_map 을 부르세요. ' +
  '맵 모양은 template 인자로 — 짧은 ID(TP=트리-진행트리맵(기본) · PT=진행트리-트리맵 · RB=방사형 양쪽 · HR=계층형 · KB=칸반 · TM=시간배치)나 한글 이름을 그대로 넣습니다. ' +
  '넘기는 마크다운은 `# 중심 주제` 로 시작하고 `##`·`###` 로 깊이를 만드는 ' +
  '견출 구조여야 합니다. 기존 맵을 읽거나 이어 쓰려면 list_maps 로 맵 id 를 찾고 ' +
  'get_map 으로 내용을 mmd 마크다운으로 받으세요. 답변을 기존 맵의 어느 노드 아래에 ' +
  '붙이려면 append_to_map(parent: 노드 이름 또는 "가지 > 하위")을, 새 맵으로 만들려면 ' +
  '사용자가 "지금 열려 있는 맵" · "선택한 노드 아래에" 라고 하면 map_id:"current" · parent:"selected" 를 쓰세요(get_open_map 이 그 자리를 알려 줍니다). ' +
  'create_map 을 쓰세요. 맵이나 노드를 지우거나 있는 노드의 글을 바꾸는 도구는 없습니다 — 예외는 check_items 하나로, 노드의 체크박스(`- [ ] 완료` 줄 · 체크리스트 노트)만 체크/해제합니다. ' +
  '사용자가 "현재 맵에서 완료된 항목은 완료 체크에 체크해 줘" 라고 하면: 대화에서 끝난 것으로 확인된 항목의 노드 이름을 모아 check_items(map_id:"current", nodes:[…]) 를 부르세요. ' +
  '무엇이 끝났는지 대화에 없으면 짐작해서 체크하지 말고 get_map 으로 체크 줄(`- [ ]`)이 있는 노드를 보여 주고 어느 것을 체크할지 물으세요. ' +
  '표·코드·문단은 기본적으로 노드 내용이 됩니다. 사용자가 "코드는 노트코드로 첨부해줘" 라고 하면 code_to_note:true, ' +
  '"긴 문장(또는 N자 이상)은 노트 문단으로" 라고 하면 long_text_to_note:N(말이 없으면 300)을 넣으세요 — 말이 없으면 둘 다 비웁니다. ' +
  '사용자가 오류 메시지를 붙이고 "그 절차 노드 아래에 해결 방법을 추가해 줘" 라고 하면: get_map(map_id:"current" 또는 이름)으로 그 절차 노드의 이름을 확인한 뒤 ' +
  'append_to_map(parent: 그 이름)으로 "오류 → 원인 → 해결" 가지를 붙이세요. 오류 원문과 명령은 코드블록으로 넣습니다. ' +
  '사진은 마크다운 `![설명](data:image/png;base64,…)` 로 넣으면 노드 사진이 됩니다(한 장 2.5MB 까지) — 파일 경로를 받아 바이트를 읽을 수 있을 때만, `base64 -w0 파일` 의 출력을 나누지 말고 한 번에 그대로 넣으세요. ' +
  '수십 KB 를 넘는 캡처는 base64 를 다시 쓰는 데 오래 걸리니 사용자에게 "앱에서 그 노드를 골라 Ctrl+V 로 붙여 넣으라" 고 안내하고, 대화에 붙여 넣은 이미지는 바이트를 꺼낼 수 없으니 보이는 내용을 글로 옮겨 적으세요. ' +
  'GitHub 저장소의 문서를 맵으로 만들려면 import_github_docs(repo:"owner/repo") 를 부르세요 — "OOO 저장소 문서를 emm 새 맵으로 만들어 줘". 문서 폴더(docs/)를 자동으로 찾고, 폴더 트리·문서 제목·GitHub 링크·문서 안 2레벨 목차·표를 맵으로 옮깁니다. ' +
  '그렇게 만든 맵은 "OOO 맵을 업데이트 해줘" 라고 하면 update_map_from_github(map_id) 로 저장소 변경(추가·수정·삭제)을 반영하고, "OOO 맵의 OOO 노드를 업데이트 해줘" 면 node:"그 노드 이름"(폴더·문서·문서 안의 절), "현재 선택한 노드의 내용을 업데이트 해줘" 면 map_id:"current", node:"selected" 입니다. ' +
  '도구에 넣은 마크다운을 대화에 다시 쓰지 마세요 — 도구가 돌려준 결과 문장만 짧게 전하면 됩니다 ' +
  '(넣은 내용은 도구 호출에 남아 있어 이 대화 안에서 계속 참고할 수 있고, 다음 대화에서는 get_map 으로 읽으면 됩니다).';
