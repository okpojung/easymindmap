// 유료 확장점 — **여기서 갈린다** (2026-08-16).
//
//   유료 모듈이 있으면  → 그것을 통째로 등록 (자기 경로·자기 표까지)
//   없으면              → 스텁 (MVP 공개판의 정상 동작)
//
// 설계: docs/04-extensions/open-core-boundary.md §4
//
// **이음매는 하나다.** 기능마다 구멍을 뚫으면 유료 기능이 8개일 때 코어에
// 거의 똑같은 모듈이 8개 생기고, 기능이 하나 늘 때마다 공개 코어를 고쳐야
// 한다. 그러면 확장점을 만든 의미가 없다 — 확장점의 값어치는 **코어를
// 다시 뜯지 않아도 되는 것**이다.
//
// **정적 import 를 쓸 수 없다.** `import '@easymindmap/pro'` 라고 쓰면
// 그 패키지가 없는 공개 저장소에서 **빌드가 깨진다.** 그래서 require 를
// try 로 감싼다 — 없는 것이 정상인 의존성을 다루는 방법이다.

import {
  Inject,
  Injectable,
  Logger,
  Module,
  type DynamicModule,
  type OnModuleInit,
} from '@nestjs/common';
import { PRO, PRO_INSTALLED, type ProContract } from './pro.contract';
import { ProController } from './pro.controller';
import { ProStub } from './pro.stub';

/** 유료 패키지 이름 — private 저장소(okpojung/easymindmap-pro)가 이 이름으로 배포한다 */
const IMPL_PACKAGE = '@easymindmap/pro';

/**
 * **기동 로그에 어느 쪽인지 한 줄 남긴다.** 운영에서 "왜 이 기능이 안 되지"를
 * 로그 한 줄로 끝내기 위해서다. 켜진 기능까지 같이 적어야 "설치는 됐는데
 * 라이선스가 없다"와 "설치가 안 됐다"가 구분된다.
 */
@Injectable()
class ProStartupLogger implements OnModuleInit {
  private readonly log = new Logger('ProModule');

  constructor(
    @Inject(PRO) private readonly pro: ProContract,
    @Inject(PRO_INSTALLED) private readonly installed: boolean,
  ) {}

  async onModuleInit() {
    if (!this.installed) {
      this.log.log(`유료 모듈: 없음(스텁) — MVP 공개판입니다 (${IMPL_PACKAGE} 미설치)`);
      return;
    }
    const on = (await this.pro.features()).filter((f) => f.enabled).map((f) => f.id);
    this.log.log(
      `유료 모듈: 설치됨 (${IMPL_PACKAGE}) · 켜진 기능: ${on.length ? on.join(', ') : '없음'}`,
    );
  }
}

@Module({})
export class ProModule {
  static register(): DynamicModule {
    let paid: { ProModule?: unknown } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      paid = require(IMPL_PACKAGE);
    } catch {
      // 없는 것이 정상이다 — 공개판이다
    }

    // 유료 모듈은 **자기 NestJS 모듈을 통째로** 준다. 그 안에서 PRO 토큰을
    // 제공하고(문자열 토큰이라 코어 것을 import 하지 않아도 이어진다),
    // 자기 컨트롤러·서비스·표 검사를 스스로 들고 온다.
    if (paid?.ProModule) {
      const impl = paid.ProModule as NonNullable<DynamicModule['imports']>[number];
      return {
        module: ProModule,
        imports: [impl],
        controllers: [ProController],
        providers: [{ provide: PRO_INSTALLED, useValue: true }, ProStartupLogger],
        exports: [PRO_INSTALLED],
      };
    }

    return {
      module: ProModule,
      controllers: [ProController],
      providers: [
        { provide: PRO, useClass: ProStub },
        { provide: PRO_INSTALLED, useValue: false },
        ProStartupLogger,
      ],
      exports: [PRO, PRO_INSTALLED],
    };
  }
}
