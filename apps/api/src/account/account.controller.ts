import {
  Body, Controller, Get, HttpCode, Post, Put, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { AccountService } from './account.service';
import {
  SaveProfileDto, SendEmailCodeDto, VerifyEmailCodeDto,
} from './dto/account.dto';
import type { AppEnv } from '../config/env.validation';

/**
 * /v1/account — 가입 이메일 인증과 회원 프로필.
 *
 * 인증번호 두 엔드포인트는 **로그인 전**에 부르므로 무인증이다
 * (가입하려는 사람에게는 아직 토큰이 없다). 대신 이메일당 재발송
 * 간격·시간당 횟수·시도 횟수로 남용을 막는다 — account.service.ts 참조.
 */
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Post('email-code')
  @HttpCode(200)
  sendEmailCode(@Body() dto: SendEmailCodeDto) {
    const devMode = this.config.get('AUTH_MODE', { infer: true }) === 'dev';
    return this.account.sendEmailCode(dto.email, devMode);
  }

  @Post('email-code/verify')
  @HttpCode(200)
  verifyEmailCode(@Body() dto: VerifyEmailCodeDto) {
    return this.account.verifyEmailCode(dto.email, dto.code);
  }

  @Get('profile')
  @UseGuards(AuthGuard)
  getProfile(@CurrentUser() user: AuthUser) {
    return this.account.getProfile(user.id);
  }

  @Put('profile')
  @UseGuards(AuthGuard)
  saveProfile(@CurrentUser() user: AuthUser, @Body() dto: SaveProfileDto) {
    return this.account.saveProfile(user.id, user.email ?? '', dto);
  }
}
