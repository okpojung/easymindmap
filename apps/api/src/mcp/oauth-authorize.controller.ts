import { Controller, Get, Logger, NotFoundException, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { AppEnv } from '../config/env.validation';
import { rewriteAuthorizeUrl } from './oauth';

/**
 * 인가 서버 겉면의 인가 엔드포인트 — `GET /v1/oauth/authorize` (2026-09-22).
 * 설계: oauth.ts "인가 서버 겉면" · docs/04-extensions/ai/mcp-connector.md §12.6
 *
 * 하는 일은 하나다: scope 에서 `openid` 를 떼고 **나머지는 그대로** GoTrue 의
 * `/oauth/authorize` 로 302 한다. 로그인·동의·코드 발급은 전부 GoTrue 와 우리
 * 동의 화면이 그대로 한다. 여기서 세션·쿠키를 만들지 않고 아무것도 저장하지
 * 않는다 — 인가 요청의 상태(state·PKCE)는 클라이언트와 GoTrue 사이에서 검증된다.
 *
 * **인증이 필요 없다** — 로그인 전 첫걸음이다.
 */
@Controller('oauth')
export class OAuthAuthorizeController {
  private readonly log = new Logger(OAuthAuthorizeController.name);
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  @Get('authorize')
  authorize(
    @Query() query: Record<string, string | string[] | undefined>,
    @Req() req: Request, @Res() res: Response,
  ) {
    const as = this.config.get('GOTRUE_PUBLIC_URL', { infer: true });
    if (!as) {
      throw new NotFoundException('OAuth 커넥터가 이 서버에 설정되지 않았습니다 (GOTRUE_PUBLIC_URL 미설정).');
    }
    // scope 만 남긴다 — state·PKCE·code 는 적지 않는다 (2026-09-24, §12.9)
    const scope = Array.isArray(query.scope) ? query.scope[0] : query.scope;
    this.log.log(`겉면 authorize [${(req.get('user-agent') ?? '').slice(0, 60) || 'UA 없음'}] scope="${scope ?? ''}" → GoTrue 302`);
    res.redirect(302, rewriteAuthorizeUrl(as, query));
  }
}
