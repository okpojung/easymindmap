import {
  Body, Controller, Delete, Get, HttpCode, Post, Put, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { AccountService } from './account.service';
import {
  DeleteAccountDto, ResetConfirmDto, ResetStartDto, ResetVerifyDto,
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

  // ── 비밀번호 재설정 (2026-08-13) ─────────────────────────────
  // 로그인하지 못하는 사람이 쓰는 길이라 **셋 다 무인증**이다.
  // 대신 인증번호 규칙(재발송 간격·시간당 횟수·시도 횟수)이 막는다.

  @Post('password-reset/start')
  @HttpCode(200)
  resetStart(@Body() dto: ResetStartDto) {
    const devMode = this.config.get('AUTH_MODE', { infer: true }) === 'dev';
    return this.account.resetStart(dto.email, devMode);
  }

  @Post('password-reset/verify')
  @HttpCode(200)
  resetVerify(@Body() dto: ResetVerifyDto) {
    return this.account.resetVerify(dto.email, dto.code);
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  resetConfirm(@Body() dto: ResetConfirmDto) {
    return this.account.resetConfirm(dto.resetToken, dto.password);
  }

  /** 탈퇴 확인 화면 — 무엇이 사라지는지 숫자로 보여 주기 위한 조회 */
  @Get('delete-preview')
  @UseGuards(AuthGuard)
  deletePreview(@CurrentUser() user: AuthUser) {
    return this.account.deletePreview(user.id);
  }

  /**
   * 회원탈퇴. **되돌릴 수 없다** — 맵·히스토리·첨부가 모두 사라진다.
   * DELETE 지만 본문(확인 문구)을 받는다 — 확인 없이 지우지 않기 위해서다.
   */
  @Delete()
  @HttpCode(200)
  @UseGuards(AuthGuard)
  deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.account.deleteAccount(user.id, dto.confirm);
  }
}
