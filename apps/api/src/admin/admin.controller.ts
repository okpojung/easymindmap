import {
  Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { DatabaseService } from '../database/database.service';
import { AdminGuard, type AdminUser } from './admin.guard';
import { AdminService, PLANS } from './admin.service';
import { collectServerSettings } from './admin-settings';
import type { AppEnv } from '../config/env.validation';

class VerifyDto {
  @IsString() @Length(4, 10) code!: string;
}
class SetPlanDto {
  @IsIn(PLANS as unknown as string[], { message: '요금제 값이 올바르지 않습니다.' })
  plan!: string;
}
class ListQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
}

/**
 * /v1/admin — 관리자 콘솔 (2026-08-13).
 *
 * 로그인 두 경로만 **GoTrue 토큰**(AuthGuard)으로 열고, 나머지는 전부
 * **관리자 표**(AdminGuard)를 요구한다. 두 가드를 겹쳐 쓰지 않는 이유는
 * admin.guard.ts 주석 참조.
 */
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly db: DatabaseService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  // ── 2단계 로그인 ─────────────────────────────────────────────
  /** ① 비밀번호 로그인을 마친 사람이 부른다 → 인증번호 발송 */
  @Post('login/start')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  loginStart(@CurrentUser() user: AuthUser) {
    const devMode = this.config.get('AUTH_MODE', { infer: true }) === 'dev';
    return this.admin.loginStart(user.email, devMode);
  }

  /** ② 인증번호 확인 → 관리자 표 */
  @Post('login/verify')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  loginVerify(@CurrentUser() user: AuthUser, @Body() dto: VerifyDto) {
    return this.admin.loginVerify(user.email, dto.code);
  }

  /** 표가 아직 살아 있는지 — 새로고침했을 때 화면이 물어본다 */
  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() req: Request & { admin?: AdminUser }) {
    return { email: req.admin?.email };
  }

  // ── 회원관리 ─────────────────────────────────────────────────
  @Get('summary')
  @UseGuards(AdminGuard)
  summary() {
    return this.admin.summary();
  }

  @Get('users')
  @UseGuards(AdminGuard)
  users(@Query() q: ListQuery) {
    return this.admin.listUsers(q.q ?? '', 200);
  }

  @Patch('users/:id/plan')
  @UseGuards(AdminGuard)
  setPlan(
    @Param('id') id: string,
    @Body() dto: SetPlanDto,
    @Req() req: Request & { admin?: AdminUser },
  ) {
    return this.admin.setPlan(id, dto.plan, req.admin?.email ?? '?');
  }

  // ── 설정값 조회 (읽기 전용) ──────────────────────────────────
  @Get('settings')
  @UseGuards(AdminGuard)
  settings() {
    return collectServerSettings(this.config, this.db).then((groups) => ({ groups }));
  }
}
