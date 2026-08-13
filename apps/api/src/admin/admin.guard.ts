// 관리자 가드 — `/v1/admin/*` 중 로그인 이후의 모든 경로에 건다.
//
// 일반 AuthGuard 와 **따로 둔다.** 일반 토큰으로는 여기를 통과할 수 없어야
// 하는데, 같은 가드를 쓰면 "이 엔드포인트는 관리자 전용인가"를 매번
// 사람이 기억해야 한다. 문을 따로 두면 잊을 수가 없다.
//
// 관리자 표는 **2단계 로그인을 마쳐야** 나온다(admin.service.ts).
// 헤더는 `X-Admin-Token` 을 쓴다 — Authorization 은 GoTrue 토큰이 이미
// 쓰고 있어서, 한 헤더에 둘을 섞으면 어느 쪽이 검증됐는지 헷갈린다.

import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminService } from './admin.service';

export interface AdminUser { email: string }

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly admin: AdminService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: AdminUser }>();
    const token = String(req.header('x-admin-token') ?? '').trim();
    if (!token) {
      throw new UnauthorizedException('관리자 로그인이 필요합니다.');
    }
    const email = this.admin.readAdminToken(token);
    if (!email) {
      throw new UnauthorizedException('관리자 세션이 만료되었습니다. 다시 로그인해 주세요.');
    }
    req.admin = { email };
    return true;
  }
}
