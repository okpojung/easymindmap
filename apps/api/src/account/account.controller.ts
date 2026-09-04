import {
  Body, Controller, Delete, Get, HttpCode, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { AccountService } from './account.service';
import {
  DeleteAccountDto, LoginEventDto, ResetConfirmDto, ResetStartDto, ResetVerifyDto,
  SaveAiKeyDto, SaveProfileDto, SendEmailCodeDto, VerifyEmailCodeDto,
} from './dto/account.dto';
import { AuditLogService } from '../common/audit-log.service';
import { LoginEventsService } from '../common/login-events.service';
import {
  browserFromUa, clientIpOf, platformFromUa, sanitizeLabel,
} from '../common/client-info';
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
    private readonly audit: AuditLogService,
    private readonly logins: LoginEventsService,
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

  // ── AI API 키 보관 (2026-09-04) — 본인 것만, 암호화 저장 ──────────
  /** 내 키 전부 (복호화해서) — `enabled:false` 면 브라우저 보관으로 되돌아간다 */
  @Get('ai-keys')
  @UseGuards(AuthGuard)
  getAiKeys(@CurrentUser() user: AuthUser) {
    return this.account.getAiKeys(user.id);
  }

  /** 키 등록/교체/삭제(빈 문자열) */
  @Put('ai-keys')
  @UseGuards(AuthGuard)
  saveAiKey(@CurrentUser() user: AuthUser, @Body() dto: SaveAiKeyDto) {
    return this.account.saveAiKey(user.id, dto.provider, dto.key);
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

  /**
   * **내 로그인 기록** (2026-08-13). 남의 것은 볼 수 없다 —
   * 토큰의 주인 id 로만 조회한다(경로에 id 를 받지 않는 이유다).
   */
  /**
   * 로그인 직후 프런트가 한 번 부른다 → **그때의 접속 IP·기기를 남긴다**
   * (2026-08-14 사용자 요청).
   *
   * GoTrue 감사 로그가 IP 를 남기지 않아 우리가 채운다. 토큰이 있어야
   * 부를 수 있으므로 **자기 것만** 남길 수 있다 — 남의 계정에 접속 기록을
   * 심을 방법이 없다. 같은 사람의 기록은 60초 안에 두 번 남기지 않는다
   * (새로고침·재시도가 로그인 횟수를 부풀리지 않도록).
   */
  @Post('login-event')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  recordLogin(
    @CurrentUser() user: AuthUser,
    @Body() dto: LoginEventDto,
    @Req() req: Request,
  ) {
    const ua = String(req.headers['user-agent'] ?? '');
    return this.logins.record(user.id, {
      // IP 는 **서버만** 정한다 — 본문으로 받지 않는다
      ip: clientIpOf(req),
      platform: sanitizeLabel(dto.platform) ?? platformFromUa(ua),
      browser: sanitizeLabel(dto.browser) ?? browserFromUa(ua),
    });
  }

  @Get('logins')
  @UseGuards(AuthGuard)
  myLogins(@CurrentUser() user: AuthUser) {
    return this.audit.forUser(user.id, 50);
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
