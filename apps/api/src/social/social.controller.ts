import { Controller, Get, Headers, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.validation';
import { bearerToken, naverToStandard, type NaverProfileResponse } from './naver-userinfo';

const NAVER_ME = 'https://openapi.naver.com/v1/nid/me';

/**
 * /v1/auth — 소셜 로그인 보조 (2026-11-28).
 *
 * 둘 다 **로그인 전**에 불리므로 무인증이다.
 *  · GET social         — 앱이 버튼을 켤지 정하는 값. 구글·카카오는 GoTrue /settings 가 알려 주지만
 *                          네이버(커스텀 공급자)는 거기 나오지 않아 여기서 알린다.
 *  · GET naver/userinfo — GoTrue 가 네이버 토큰으로 사용자정보를 물을 때 부른다(naver-userinfo.ts).
 *    토큰은 넘겨받아 네이버에만 쓰고 저장·기록하지 않는다.
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
}
