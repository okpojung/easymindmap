// 협업이 **꽂혀 있지 않을 때**의 구현 (2026-08-15).
//
// 이것이 공개판의 **정상 동작**이다 — 오류 상태가 아니다. 공개 코어를
// 받아 쓰는 사람에게는 이게 제품이고, 협업은 유료 확장이다.
//
// 다만 **조용히 성공하지 않는다.** 빈 세션을 돌려주면 화면은 협업이
// 켜진 것처럼 굴다가 아무 일도 일어나지 않는다 — 그게 제일 나쁘다.

import { Injectable, NotFoundException } from '@nestjs/common';
import type { CollabContract, CollabSession, CollabStatus } from './collab.contract';

export const COLLAB_OFF_REASON =
  '협업은 유료 기능입니다. 이 서버에는 협업 모듈이 설치돼 있지 않습니다.';

@Injectable()
export class CollabStub implements CollabContract {
  status(): CollabStatus {
    return { enabled: false, reason: COLLAB_OFF_REASON, features: [] };
  }

  join(): Promise<CollabSession> {
    return Promise.reject(new NotFoundException(COLLAB_OFF_REASON));
  }
}
