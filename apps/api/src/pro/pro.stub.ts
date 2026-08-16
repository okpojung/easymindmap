// 유료 모듈이 **꽂혀 있지 않을 때**의 구현 (2026-08-16).
//
// 이것이 공개판의 **정상 동작**이다 — 오류 상태가 아니다. 공개 코어를
// 받아 쓰는 사람에게는 MVP 가 제품이고, 그 이상은 유료 확장이다.
//
// 다만 **빈 목록을 돌려주지 않는다.** 비어 있으면 화면은 "그런 기능이
// 원래 없다"로 읽고 자리조차 그리지 않는다. 목록은 그대로 주고
// **전부 꺼져 있다고 + 왜 꺼졌는지** 말한다.

import { Injectable } from '@nestjs/common';
import {
  PRO_FEATURE_CATALOG,
  type ProContract,
  type ProFeature,
} from './pro.contract';

export const PRO_OFF_REASON =
  '유료 기능입니다. 이 서버에는 유료 모듈이 설치돼 있지 않습니다.';

@Injectable()
export class ProStub implements ProContract {
  features(): ProFeature[] {
    return PRO_FEATURE_CATALOG.map((f) => ({
      ...f,
      enabled: false,
      reason: PRO_OFF_REASON,
    }));
  }
}
