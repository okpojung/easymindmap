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
import {
  PRO,
  PRO_FEATURE_CATALOG,
  PRO_INSTALLED,
  type ProContract,
  type ProFeature,
} from './pro.contract';

/** 유료 모듈이 이 기능을 아예 언급하지 않았을 때 */
const UNKNOWN_REASON =
  '설치된 유료 모듈이 이 기능을 알지 못합니다. 모듈이 코어보다 오래된 판일 수 있습니다.';

@Controller('features')
export class ProController {
  constructor(
    @Inject(PRO) private readonly pro: ProContract,
    @Inject(PRO_INSTALLED) private readonly installed: boolean,
  ) {}

  /**
   * 무엇이 켜져 있고 **왜 꺼져 있는지** — 로그인 없이 답한다.
   * 화면이 메뉴를 그릴지 정하는 데 쓰므로 로그인 전에도 알아야 한다.
   *
   * **목록의 뼈대는 코어의 카탈로그다.** 유료 모듈은 그 위에 상태만 얹는다.
   * 유료 모듈이 통째로 답하게 두면, 모듈이 코어보다 오래된 판일 때 **새
   * 기능이 목록에서 통째로 사라진다** — 화면은 그것을 "그런 기능이 원래
   * 없다"로 읽고 자리조차 그리지 않는다. 그러면 사용자는 **살 수 있는
   * 기능이 있는 줄도 모른다.**
   *
   * 유료 모듈이 카탈로그에 없는 id 를 주면 **그것도 뒤에 붙인다** — 코어보다
   * 새 모듈이 먼저 나올 수 있고, 그때 기능이 감춰지면 같은 문제가 반대
   * 방향으로 생긴다.
   */
  @Get()
  async list() {
    const fromImpl = new Map<string, ProFeature>();
    for (const f of await this.pro.features()) fromImpl.set(f.id, f);

    const features: ProFeature[] = PRO_FEATURE_CATALOG.map((c) => {
      const got = fromImpl.get(c.id);
      fromImpl.delete(c.id);
      // 이름은 **코어 것을 쓴다** — 화면 문구의 주인은 코어다.
      return got
        ? { ...got, id: c.id, name: c.name }
        : { ...c, enabled: false, reason: UNKNOWN_REASON };
    });

    return { installed: this.installed, features: [...features, ...fromImpl.values()] };
  }
}
