import {
  Body, Controller, Get, Headers, HttpCode, HttpException, HttpStatus, Post, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import type { AppEnv } from '../config/env.validation';
import { AuthGuard } from '../common/auth/auth.guard';
import { bearerToken, naverToStandard, type NaverProfileResponse } from './naver-userinfo';
import { kakaoPhoneOf, naverPhoneOf, type PhoneHint } from './social-phone';

const NAVER_ME = 'https://openapi.naver.com/v1/nid/me';
const KAKAO_ME = 'https://kapi.kakao.com/v2/user/me';

/** 소셜 로그인 직후 휴대폰 번호 미리 채우기 — 공급자 토큰은 이 요청에만 쓰고 저장·기록하지 않는다 */
export class SocialPhoneDto {
  @IsIn(['kakao', 'naver'])
  provider!: 'kakao' | 'naver';

  @IsString()
  @MaxLength(2048)
  @Matches(/^[A-Za-z0-9\-._~+/]+=*$/)
  providerToken!: string;
}

/**
 * /v1/auth — 소셜 로그인 보조 (2026-11-28).
 *
 * 둘 다 **로그인 전**에 불리므로 무인증이다.
 *  · GET social         — 앱이 버튼을 켤지 정하는 값. 구글·카카오는 GoTrue /settings 가 알려 주지만
 *                          네이버(커스텀 공급자)는 거기 나오지 않아 여기서 알린다.
 *  · GET naver/userinfo — GoTrue 가 네이버 토큰으로 사용자정보를 물을 때 부른다(naver-userinfo.ts).
 *    토큰은 넘겨받아 네이버에만 쓰고 저장·기록하지 않는다.
 *  · POST social/phone  — (로그인 후) 카카오·네이버 휴대폰 번호 미리 채우기용 조회 (social-phone.ts).
 */
@Controller('auth')
export class SocialController {
  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  @Get('social')
  social() {
    return { naver: this.config.get('NAVER_LOGIN_ENABLED', { infer: true }) === true };
  }

  @Get('naver/userinfo')
  async naverUserinfo(@Headers('authorization') authorization?: string) {
    if (this.config.get('NAVER_LOGIN_ENABLED', { infer: true }) !== true) {
      throw new HttpException('naver login disabled', HttpStatus.NOT_FOUND);
    }
    const token = bearerToken(authorization);
    if (!token) throw new UnauthorizedException('missing bearer token');
    let raw: NaverProfileResponse;
    try {
      const res = await fetch(NAVER_ME, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
      if (res.status === 401 || res.status === 403) throw new UnauthorizedException('naver token rejected');
      if (!res.ok) throw new HttpException('naver profile unavailable', HttpStatus.BAD_GATEWAY);
      raw = (await res.json()) as NaverProfileResponse;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException('naver profile unavailable', HttpStatus.BAD_GATEWAY);
    }
    const info = naverToStandard(raw);
    if (!info) throw new UnauthorizedException('naver profile invalid');
    return info;
  }

  /**
   * POST social/phone — 카카오·네이버 로그인 직후 앱이 한 번 부른다(social-phone.ts).
   * EMM 로그인이 필요하다. 번호를 **돌려주기만** 하고 저장하지 않는다 — 저장은 사용자가
   * 가입 마무리 창·계정 프로필에서 [저장]할 때, 인증은 ARS 로만.
   * 공급자가 번호를 안 주면(동의 안 함·권한 없음·카카오톡 미사용) phone: null — 오류가 아니다.
   */
  @Post('social/phone')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async socialPhone(@Body() dto: SocialPhoneDto): Promise<{ phone: PhoneHint | null }> {
    if (dto.provider === 'naver' && this.config.get('NAVER_LOGIN_ENABLED', { infer: true }) !== true) {
      return { phone: null };
    }
    const url = dto.provider === 'kakao' ? KAKAO_ME : NAVER_ME;
    let me: unknown;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${dto.providerToken}` },
        signal: AbortSignal.timeout(6000),
        redirect: 'error',
      });
      if (!res.ok) return { phone: null };
      me = await res.json();
    } catch {
      return { phone: null };
    }
    return { phone: dto.provider === 'kakao' ? kakaoPhoneOf(me) : naverPhoneOf(me) };
  }
}
