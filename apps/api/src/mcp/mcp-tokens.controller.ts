import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import type { AppEnv } from '../config/env.validation';
import { ApiTokenService } from './api-token.service';
import { IssueTokenDto } from './dto/issue-token.dto';

/**
 * `/v1/mcp-tokens` — 내 MCP 토큰 발급·목록·폐기 (앱 화면이 부른다).
 *
 * MCP 본선(`/v1/mcp`)과 **가드가 다르다.** 이쪽은 로그인한 사람이 앱에서
 * 부르므로 평소의 `AuthGuard`(GoTrue JWT)를 쓴다. 토큰으로 토큰을 발급할
 * 수는 없다 — 새어 나간 토큰 하나가 새 토큰을 무한히 찍어내면 폐기가
 * 의미를 잃는다.
 *
 * 폐기가 발급과 **같은 화면**에 있어야 한다는 요건(mcp-connector.md §3)은
 * 여기 세 엔드포인트가 한 화면(McpTokensView)에 묶여 충족된다.
 */
@Controller('mcp-tokens')
@UseGuards(AuthGuard)
export class McpTokensController {
  constructor(
    private readonly tokens: ApiTokenService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /**
   * 내 토큰 목록 + **왜 못 쓰는지**.
   *
   * 화면이 발급 버튼만 보여 주고 눌러야 실패를 알려 주면, 사용자는 자기
   * 잘못인지 서버 사정인지 구분할 수 없다. 그래서 막힐 이유를 **두 가지
   * 다 미리** 준다.
   *   available:false — `AUTH_MODE=dev` 배포다. MCP 본선이 열리지 않는다(§3)
   *   ready:false     — 델타 SQL(`api_tokens`)이 아직 적용되지 않았다
   */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    const { ready, tokens } = await this.tokens.list(user.id);
    return {
      available: this.config.get('AUTH_MODE', { infer: true }) !== 'dev',
      ready,
      tokens,
    };
  }

  /** 발급 — 응답의 `token` 이 **원문이고 다시 볼 수 없다**(화면이 그렇게 안내한다) */
  @Post()
  @HttpCode(201)
  issue(@CurrentUser() user: AuthUser, @Body() dto: IssueTokenDto) {
    return this.tokens.issue(user.id, dto.name);
  }

  @Delete(':id')
  revoke(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tokens.revoke(user.id, id);
  }
}
