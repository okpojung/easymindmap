import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
// ⚠️ CJS 전용 패키지만 쓸 것 — auth.guard.ts 머리말 참조(ERR_REQUIRE_ESM)
import * as jwt from 'jsonwebtoken';
import type { AppEnv } from '../config/env.validation';
import type { AuthUser } from '../common/auth/current-user.decorator';
import { ensureUserProvisioned } from '../common/auth/ensure-user';
import { DatabaseService } from '../database/database.service';
import { ApiTokenService } from './api-token.service';
import { requestOrigin, wwwAuthenticate } from './oauth';

/**
 * MCP 인증 — **문이 둘이다** (2026-09-06, 3단계).
 *
 *   ① PAT   `Authorization: Bearer emm_…`   ← 1단계. Claude Code 등이 쓴다
 *   ② OAuth `Authorization: Bearer <JWT>`   ← 3단계. claude.ai 커넥터가 쓴다
 *
 * 왜 둘 다 두나: claude.ai 의 커스텀 커넥터 화면에는 **헤더를 넣는 칸이
 * 없어** PAT 로는 붙을 수 없고(§9.2 ②-C), 반대로 Claude Code 는 헤더
 * 하나로 간단히 붙는다. 하나만 두면 한쪽이 못 쓴다.
 *
 * ★ **`AUTH_MODE=dev` 에서는 둘 다 열리지 않는다** (§3). dev 는 헤더
 *   하나로 아무 사용자나 되는 모드다.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly log = new Logger(McpAuthGuard.name);
  private secretKey = '';

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly tokens: ApiTokenService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get('AUTH_MODE', { infer: true }) === 'dev') {
      throw new ForbiddenException(
        'MCP 커넥터는 인증을 켠 배포에서만 동작합니다 (AUTH_MODE=dev 에서는 열지 않습니다).',
      );
    }

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const origin = requestOrigin(req, this.config.get('PUBLIC_API_URL', { infer: true }));
    const authz = req.header('authorization') ?? '';
    const raw = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';

    if (!raw) {
      // 규격의 핵심 자리 — 클라이언트는 401 **본문이 아니라 이 헤더**를
      // 보고 인가 서버를 찾아간다(RFC 9728 §5.1). 토큰이 아예 없을 때는
      // `error` 를 붙이지 않는다(RFC 6750 §3.1).
      this.challenge(req, wwwAuthenticate(origin));
      throw new UnauthorizedException(
        'EasyMindMap 인증이 필요합니다 — 커넥터를 연결하거나, '
        + '앱의 [계정 ▸ AI 커넥터(MCP)] 에서 토큰을 발급하세요.',
      );
    }

    // ── ① PAT ────────────────────────────────────────────────────
    // 접두어로 먼저 가른다. 우리가 발급한 토큰은 `emm_` 로 시작하므로
    // JWT 검증에 넣어 헛일할 필요가 없다.
    if (raw.startsWith('emm_')) {
      const userId = await this.tokens.userIdFor(raw);
      if (!userId) {
        this.challenge(req, wwwAuthenticate(origin, {
          error: 'invalid_token', description: 'The access token is revoked or unknown.',
        }));
        throw new UnauthorizedException('토큰이 유효하지 않거나 폐기되었습니다. 새로 발급해 주세요.');
      }
      req.user = { id: userId };
      return true;
    }

    // ── ② OAuth 액세스 토큰 (GoTrue 가 발급) ──────────────────────
    if (!this.config.get('GOTRUE_PUBLIC_URL', { infer: true })) {
      // 이 배포는 OAuth 문을 열지 않았다 — PAT 이 아닌 것은 받지 않는다
      this.challenge(req, wwwAuthenticate(origin, {
        error: 'invalid_token', description: 'OAuth is not configured on this server; use a personal access token.',
      }));
      throw new UnauthorizedException(
        '이 서버는 OAuth 커넥터가 설정되지 않았습니다 — [계정 ▸ AI 커넥터(MCP)] 의 토큰을 쓰세요.',
      );
    }
    if (!this.secretKey) {
      this.secretKey = this.config.get('SUPABASE_JWT_SECRET', { infer: true });
    }

    let sub: string; let email: string | undefined;
    try {
      const p = jwt.verify(raw, this.secretKey, {
        algorithms: ['HS256'],
        // GoTrue 는 **OAuth 로 발급한 액세스 토큰에도** 같은 aud 를 넣는다
        // (실측: tokens/service.go — `Audience: {user.Aud}`). §10.3 참조.
        audience: 'authenticated',
      }) as jwt.JwtPayload;
      if (typeof p.sub !== 'string' || !p.sub) throw new Error('sub 없음');

      // ★ **이 한 줄이 audience 검증을 대신한다** (§10.3).
      //   `client_id` 는 GoTrue 가 **OAuth 로 발급한 토큰에만** 넣는다.
      //   없으면 그냥 로그인 세션 토큰이라는 뜻이고, 그것으로 MCP 를
      //   열어 주면 **브라우저 세션 토큰이 곧 MCP 열쇠**가 된다.
      if (typeof p.client_id !== 'string' || !p.client_id) {
        throw new Error('OAuth 로 발급된 토큰이 아니다 (client_id 없음)');
      }
      sub = p.sub;
      email = typeof p.email === 'string' ? p.email : undefined;
    } catch (err) {
      this.challenge(req, wwwAuthenticate(origin, {
        error: 'invalid_token', description: 'The access token is invalid or expired.',
      }));
      this.log.debug?.(`MCP OAuth 토큰 거절: ${String((err as Error).message)}`);
      throw new UnauthorizedException('토큰이 유효하지 않거나 만료되었습니다. 다시 연결해 주세요.');
    }

    // 사용자를 만드는 규칙은 AuthGuard 와 **같은 한 자리**를 쓴다
    await ensureUserProvisioned(this.db, sub, email);
    req.user = { id: sub, email };
    return true;
  }

  private challenge(req: Request, value: string): void {
    req.res?.setHeader('WWW-Authenticate', value);
  }
}
