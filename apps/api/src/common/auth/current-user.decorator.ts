import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  id: string;
}

/**
 * 컨트롤러 파라미터에서 현재 인증 사용자를 꺼낸다.
 *   handler(@CurrentUser() user: AuthUser) { ... }
 * DevAuthGuard(또는 향후 Supabase 가드)가 req.user 를 채워 둔다.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    return req.user as AuthUser;
  },
);
