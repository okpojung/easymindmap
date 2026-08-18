// 레이트 리밋 가드 — "한 사람이 정해진 시간 안에 부를 수 있는 최대 횟수".
//
// 왜 필요한가 · 무엇을 막고 무엇을 못 막는가 · 한도를 어떻게 정했는가는
// docs/05-implementation/rate-limit.md 에 초보자 기준으로 정리했다.
//
// 여기서는 기본 ThrottlerGuard 에 **세 가지**를 얹는다.
//   1. 스위치 — RATE_LIMIT_ENABLED=false 면 통째로 끈다
//   2. 예외 — /health 는 세지 않는다 (감시 도구가 자주 부른다)
//   3. 세는 단위 — IP 가 아니라 **사람에 가깝게** 센다 (아래 getTracker)

import { createHash } from 'node:crypto';
import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
  type ThrottlerLimitDetail,
} from '@nestjs/throttler';
import type { AppEnv } from '../../config/env.validation';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: ConfigService<AppEnv, true>,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * **세는 단위(tracker)** — 이 값이 같으면 같은 바구니에 담긴다.
   *
   * 흔히 IP 로만 세는데, 그러면 **같은 회사·학교에서 접속한 사람들이
   * 전부 한 바구니**에 묶인다. 우리 사내망 사용자는 모두 같은 공인 IP
   * 로 나가므로, 한 사람이 많이 쓰면 옆 사람이 막힌다.
   *
   * 그래서 로그인한 요청은 **토큰**을 기준으로 센다. 토큰은 사람마다
   * 다르므로 IP 가 같아도 바구니가 나뉜다. 토큰 값 자체를 메모리에
   * 남기지 않으려고 해시해서 쓴다.
   *
   * 로그인 전(토큰 없음)에는 어쩔 수 없이 IP 로 센다.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const authz = String(req?.headers?.authorization ?? '');
    if (authz.startsWith('Bearer ')) {
      const h = createHash('sha256').update(authz.slice(7)).digest('hex');
      return 'u:' + h.slice(0, 32);
    }
    // Express 의 req.ip 는 'trust proxy' 설정이 있어야 실제 클라이언트
    // IP 가 된다 (main.ts 참고) — 없으면 전원이 프록시 IP 하나로 묶인다.
    const ip = (Array.isArray(req?.ips) && req.ips.length ? req.ips[0] : req?.ip) ?? 'unknown';
    return 'ip:' + String(ip);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (!this.config.get('RATE_LIMIT_ENABLED', { infer: true })) return true;

    const req = context.switchToHttp().getRequest<{ originalUrl?: string; url?: string }>();
    const path = String(req?.originalUrl ?? req?.url ?? '');
    // 헬스체크는 세지 않는다 — 배포·감시 도구가 주기적으로 부르는데,
    // 그것 때문에 한도가 차면 **정작 장애일 때 상태를 못 본다.**
    if (path.startsWith('/v1/health')) return true;

    // **밖에서 들어오는 통지도 세지 않는다** (2026-08-18).
    // 결제 PG 의 결제완료 통지가 여기로 온다. IP 로 세는데 PG 재전송이
    // 몰리면 **429** 가 나가고, PG 는 그것을 실패로 보고 재전송을
    // 소진한다 — **돈은 빠져나갔는데 원장은 미결제**로 남는다.
    //
    // 헬스체크와 같은 이유다: **정작 중요할 때 막히면 안 되는 길**이다.
    // 이 경로가 열려 있어도 안전한 이유는 레이트 리밋이 아니라
    // **경로 시크릿·발신 IP·금액 교차검증·멱등성**이 지키기 때문이다
    // (유료 모듈이 그 경로를 가져온다 — open-core-boundary.md §4).
    if (path.startsWith('/v1/pg/')) return true;

    return super.shouldSkip(context);
  }

  /**
   * 한도를 넘겼을 때 **사용자에게 무엇을 하라고 말한다.**
   *
   * 기본 메시지는 `ThrottlerException: Too Many Requests` 인데, 이건
   * 라이브러리 내부 사정이지 사용자가 할 수 있는 일이 아니다. 화면에
   * 그대로 뜨면 "알 수 없는 오류"와 다를 게 없다.
   *
   * `Retry-After` 헤더는 라이브러리가 이미 붙여 준다 — 본문에도 몇 초
   * 뒤에 다시 오면 되는지 적어, 헤더를 못 읽는 화면에서도 알 수 있게 한다.
   */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const sec = Math.max(1, Math.ceil((detail?.timeToBlockExpire ?? 0) || 1));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message: `요청이 너무 잦습니다. ${sec}초 뒤에 다시 시도해 주세요.`,
        retryAfterSec: sec,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
