import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppEnv } from '../../config/env.validation';
import type { AuthUser } from './current-user.decorator';

/**
 * 개발용 인증 가드 (MVP 걷는 뼈대 단계).
 *
 *  - AUTH_MODE=dev  : 요청 헤더 `x-user-id` 가 있으면 그 사용자로,
 *                     없으면 DEV_USER_ID 로 인증 처리(로그인 없이 개발).
 *  - AUTH_MODE=supabase : 아직 미구현 → 명시적으로 막는다.
 *                     (다음 단계에서 Supabase JWT 검증 가드로 교체)
 *
 * ⚠️ dev 모드는 절대 프로덕션에서 쓰지 않는다. 배포는 supabase 모드로.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const mode = this.config.get('AUTH_MODE', { infer: true });

    if (mode === 'supabase') {
      throw new UnauthorizedException(
        'Supabase 인증은 아직 구현되지 않았습니다(다음 단계). 개발은 AUTH_MODE=dev 로 진행하세요.',
      );
    }

    const headerUser = req.header('x-user-id');
    const userId = headerUser && headerUser.trim() ? headerUser.trim() : this.config.get('DEV_USER_ID', { infer: true });

    req.user = { id: userId };
    return true;
  }
}
