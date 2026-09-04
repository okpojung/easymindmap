import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppEnv } from '../config/env.validation';
import type { AuthUser } from '../common/auth/current-user.decorator';
import { ApiTokenService } from './api-token.service';

/**
 * MCP 전용 인증 — `Authorization: Bearer emm_…`(PAT)만 받는다.
 * 설계: docs/04-extensions/ai/mcp-connector.md §3
 *
 * ★ **`AUTH_MODE=dev` 에서는 이 문이 아예 열리지 않는다** (§3).
 *   dev 는 헤더 하나(`x-user-id`)로 아무 사용자나 되는 모드다
 *   (`common/auth/auth.guard.ts`). 그 배포에 MCP 를 열면 **토큰 없이도
 *   남의 문서함에 맵을 만들 수 있다.** 그래서 여기서 막는다 —
 *   "dev 에서는 아무도 안 부르겠지"에 기대지 않는다.
 *
 * AuthGuard 를 재사용하지 않는 이유: AuthGuard 는 GoTrue JWT 를 본다.
 * MCP 클라이언트는 그 JWT 를 얻을 길이 없다(그래서 PAT 이다). 반대로
 * PAT 이 `/v1` 의 다른 엔드포인트를 열어서도 안 된다 — **PAT 으로 갈 수
 * 있는 곳은 MCP 도구가 감싼 자리뿐**이어야 삭제·계정 API 가 노출되지
 * 않는다(§2-3). 그래서 두 가드는 서로 다른 문이다.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly tokens: ApiTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get('AUTH_MODE', { infer: true }) === 'dev') {
      throw new ForbiddenException(
        'MCP 커넥터는 인증을 켠 배포에서만 동작합니다 (AUTH_MODE=dev 에서는 열지 않습니다).',
      );
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const authz = req.header('authorization') ?? '';
    const raw = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!raw) {
      // MCP 규격은 401 에 이 헤더를 요구한다 — 클라이언트가 "인증이
      // 필요하다"를 401 본문이 아니라 이 헤더로 판정한다
      req.res?.setHeader('WWW-Authenticate', 'Bearer realm="EasyMindMap MCP"');
      throw new UnauthorizedException(
        'EasyMindMap 액세스 토큰이 필요합니다 — 앱의 [계정 ▸ AI 커넥터(MCP)] 에서 발급하세요.',
      );
    }

    const userId = await this.tokens.userIdFor(raw);
    if (!userId) {
      req.res?.setHeader('WWW-Authenticate', 'Bearer realm="EasyMindMap MCP", error="invalid_token"');
      throw new UnauthorizedException('토큰이 유효하지 않거나 폐기되었습니다. 새로 발급해 주세요.');
    }

    req.user = { id: userId };
    return true;
  }
}
