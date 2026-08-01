import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { jwtVerify } from 'jose';
import type { AppEnv } from '../../config/env.validation';
import { DatabaseService } from '../../database/database.service';
import type { AuthUser } from './current-user.decorator';

/**
 * 인증 가드 — AUTH_MODE 에 따라 두 방식으로 동작한다 (Phase 3).
 *
 *  - AUTH_MODE=dev      : 요청 헤더 `x-user-id` 가 있으면 그 사용자로,
 *                         없으면 DEV_USER_ID 로 인증 처리(로그인 없이 개발).
 *                         ⚠️ 절대 프로덕션에서 쓰지 않는다.
 *  - AUTH_MODE=supabase : `Authorization: Bearer <JWT>` 를
 *                         SUPABASE_JWT_SECRET(HS256, GoTrue 서명)으로 검증.
 *                         sub 클레임 = 사용자 id. 최초 요청 시 auth.users 에
 *                         행을 만들어(JIT) public.users FK 를 성립시킨다
 *                         (schema.sql 의 on_auth_user_created 트리거가
 *                         public.users 를 자동 생성).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  // JIT 프로비저닝을 이미 마친 사용자 id 캐시 (프로세스 생존 동안)
  private readonly knownUsers = new Set<string>();
  private secretKey: Uint8Array | null = null;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const mode = this.config.get('AUTH_MODE', { infer: true });

    if (mode === 'dev') {
      const headerUser = req.header('x-user-id');
      const userId =
        headerUser && headerUser.trim()
          ? headerUser.trim()
          : this.config.get('DEV_USER_ID', { infer: true });
      req.user = { id: userId };
      return true;
    }

    // ── AUTH_MODE=supabase — Bearer JWT 검증 ────────────────────────
    const authz = req.header('authorization') ?? '';
    const token = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
    if (!token) {
      throw new UnauthorizedException('로그인이 필요합니다. (Authorization: Bearer <token>)');
    }

    if (!this.secretKey) {
      this.secretKey = new TextEncoder().encode(
        this.config.get('SUPABASE_JWT_SECRET', { infer: true }),
      );
    }

    let sub: string;
    let email: string | undefined;
    try {
      // GoTrue 액세스 토큰: HS256, aud='authenticated' (exp 는 jwtVerify 가 검사)
      const { payload } = await jwtVerify(token, this.secretKey, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      });
      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new Error('sub 없음');
      }
      sub = payload.sub;
      email = typeof payload.email === 'string' ? payload.email : undefined;
    } catch {
      throw new UnauthorizedException('세션이 유효하지 않습니다. 다시 로그인해 주세요.');
    }

    await this.ensureUser(sub, email);
    req.user = { id: sub, email };
    return true;
  }

  /**
   * JIT 사용자 프로비저닝 — 검증된 토큰의 사용자가 DB 에 없으면 만든다.
   * Supabase 스택(GoTrue)이 API 와 같은 DB 를 쓰면 이미 존재하므로
   * no-op 이고, 분리 배포(다른 DB)여도 FK 가 깨지지 않게 하는 안전망.
   */
  private async ensureUser(id: string, email?: string): Promise<void> {
    if (this.knownUsers.has(id)) return;
    try {
      await this.db.query(
        `INSERT INTO auth.users (id, email) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [id, email ?? null],
      );
      // 트리거가 없는 환경(진짜 Supabase 는 자체 트리거 구성) 대비 —
      // public.users 도 명시적으로 보장한다.
      await this.db.query(
        `INSERT INTO public.users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
        [id],
      );
      this.knownUsers.add(id);
    } catch (err) {
      this.logger.error(`사용자 JIT 생성 실패 (id=${id})`, err as Error);
      throw new UnauthorizedException('사용자 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }
}
