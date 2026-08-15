// 협업 확장점 — **여기서 갈린다** (2026-08-15).
//
//   유료 모듈이 있으면  → 그 구현을 등록
//   없으면              → 스텁 (공개판의 정상 동작)
//
// 설계: docs/04-extensions/open-core-boundary.md §4
//
// **정적 import 를 쓸 수 없다.** `import '@easymindmap/collab'` 이라고
// 쓰면 그 패키지가 없는 공개 저장소에서 **빌드가 깨진다.** 그래서 require
// 를 try 로 감싼다 — 없는 것이 정상인 의존성을 다루는 방법이다.

import { Logger, Module, type DynamicModule, type Type } from '@nestjs/common';
import { COLLAB, type CollabContract } from './collab.contract';
import { CollabController } from './collab.controller';
import { CollabStub } from './collab.stub';

/** 유료 패키지 이름 — private 저장소가 이 이름으로 배포한다 */
const IMPL_PACKAGE = '@easymindmap/collab';

@Module({})
export class CollabModule {
  static register(): DynamicModule {
    const log = new Logger('CollabModule');
    let impl: Type<CollabContract> = CollabStub;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const mod = require(IMPL_PACKAGE) as { CollabService?: Type<CollabContract> };
      if (mod?.CollabService) impl = mod.CollabService;
    } catch {
      // 없는 것이 정상이다 — 공개판이다
    }
    // **기동 로그에 어느 쪽인지 남긴다.** 운영에서 "왜 협업이 안 되지"를
    // 로그 한 줄로 끝내기 위해서다.
    log.log(impl === CollabStub
      ? `협업 모듈: 없음(스텁) — 유료 기능입니다 (${IMPL_PACKAGE} 미설치)`
      : `협업 모듈: 설치됨 (${IMPL_PACKAGE})`);

    return {
      module: CollabModule,
      controllers: [CollabController],
      providers: [{ provide: COLLAB, useClass: impl }],
      exports: [COLLAB],
    };
  }
}
