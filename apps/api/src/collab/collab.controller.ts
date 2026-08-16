// /v1/collab — 협업 확장점의 바깥문 (2026-08-15).
//
// **경로는 공개 코어에 둔다.** 유료 모듈이 경로까지 만들면, 모듈이 없을 때
// 404 가 "그런 기능이 원래 없다"인지 "유료라서 없다"인지 구분되지 않는다.
// 여기 두면 **꺼져 있어도 왜 꺼졌는지 답할 수 있다.**

import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth/auth.guard';
import { CurrentUser, type AuthUser } from '../common/auth/current-user.decorator';
import { COLLAB, type CollabContract } from './collab.contract';

@Controller('collab')
export class CollabController {
  constructor(@Inject(COLLAB) private readonly collab: CollabContract) {}

  /**
   * 협업이 켜져 있는가 — **로그인 없이도 답한다.**
   * 화면이 메뉴를 그릴지 말지 정하는 데 쓰므로, 로그인 전에도 알아야 한다.
   */
  @Get('status')
  status() {
    return this.collab.status();
  }

  /** 협업 세션 참가 — 구현이 없으면 404 (스텁이 그렇게 답한다) */
  @Post('maps/:mapId/join')
  // 세션은 우리가 URL 로 노출하는 자원이 아니다 — 이 저장소 관례대로 200
  // (login/start·login/verify 와 같다). NestJS 기본값은 201 이다.
  @HttpCode(200)
  @UseGuards(AuthGuard)
  join(@Param('mapId') mapId: string, @CurrentUser() user: AuthUser) {
    return this.collab.join(mapId, user.id);
  }
}
