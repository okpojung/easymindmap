// /v1/features — 유료 확장점의 **유일한** 바깥문 (2026-08-16).
//
// 코어가 가진 유료 관련 경로는 이것 하나뿐이다. 기능별 경로(협업·번역 …)는
// **유료 모듈이 자기가 가져온다** — 그래야 유료 기능이 늘어도 공개 코어에
// 커밋이 생기지 않는다 (open-core-boundary.md §4.1).
//
// 첫 설계(2026-08-15)에서는 기능별 경로를 코어에 두라고 적었다. 이유는
// "모듈이 없을 때 404 가 *원래 없다*인지 *유료라서 없다*인지 구분되지
// 않는다"였는데, **이 경로가 그 일을 대신하므로** 이유가 사라졌다.

import { Controller, Get, Inject } from '@nestjs/common';
import { PRO, PRO_INSTALLED, type ProContract } from './pro.contract';

@Controller('features')
export class ProController {
  constructor(
    @Inject(PRO) private readonly pro: ProContract,
    @Inject(PRO_INSTALLED) private readonly installed: boolean,
  ) {}

  /**
   * 무엇이 켜져 있고 **왜 꺼져 있는지** — 로그인 없이 답한다.
   * 화면이 메뉴를 그릴지 정하는 데 쓰므로 로그인 전에도 알아야 한다.
   */
  @Get()
  async list() {
    return { installed: this.installed, features: await this.pro.features() };
  }
}
