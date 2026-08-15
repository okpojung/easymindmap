# 오픈코어 경계 — 무엇이 공개이고 무엇이 유료인가 (2026-08-15 사용자 결정)

> **결정**: 저장소는 **공개(Apache-2.0)로 그대로 둔다.** 유료 기능(협업 등)의
> **구현만 별도 private 저장소**에서 개발한다. **설계 문서는 공개 저장소에
> 그대로 남긴다** — 로드맵이 보이는 편이 신뢰에 낫다.
>
> 이 문서는 그 경계를 정하고, **공개 코어에 어떤 구멍(확장점)을 뚫어 둘지**를
> 적는다. 지금 뚫어 두지 않으면 나중에 코어를 다시 뜯어야 한다.

---

## 1. 왜 저장소를 나누나 — 법이 아니라 사고 방지다

**법적으로는 나눌 필요가 없다.** Apache-2.0 은 허용적(permissive) 라이선스라
**파생물을 독점으로 만들어 파는 것을 명시적으로 허용**한다. GPL/AGPL 같은
"가져다 쓰면 너도 공개하라"가 없고, SaaS 로 제공할 때의 공개 의무(네트워크
카피레프트)도 없다. 코어가 Apache-2.0 이어도 **유료 모듈을 비공개로 두는 데
아무 문제가 없다.**

나누는 이유는 하나다.

> **git 저장소는 통째로 public 이거나 private 이다.** "이 폴더만 비공개"는
> 불가능하고, 실수로 한 번 커밋되면 **되돌릴 수 없다** — 지우고 force-push
> 해도 이미 클론·포크된 사본과 GitHub 캐시에는 남는다.

저장소를 나누는 것이 **실수를 구조적으로 막는 유일한 방법**이다.

> ⚠️ Apache-2.0 은 **경쟁자가 우리 코어로 자기 SaaS 를 만드는 것도 허용**한다.
> 그것이 문제가 되면 **앞으로의 버전**에 AGPL·BSL 을 적용하는 방법이 있다
> (저작권을 한 사람이 갖고 있으므로 가능하다). 다만 **이미 공개한 스냅샷은
> 영원히 Apache-2.0 이다.** 별개 결정이므로 여기서 정하지 않는다.

## 2. 저장소 배치

| 저장소 | 공개 | 라이선스 | 담는 것 |
|---|---|---|---|
| `okpojung/easymindmap` | **public** | Apache-2.0 | 코어 전부 + **확장점** + **설계 문서(협업 포함)** |
| `okpojung/easymindmap-collab` | **private** | 독점 | 협업 **구현** (서버 모듈 + 화면) |

배포는 private 쪽에서 둘을 합쳐 빌드한다(§6).

**세 번째 저장소(deploy)는 만들지 않는다.** 지금 배포는 Coolify 가 저장소
하나를 보고 도는 구조이고, 유료판은 private 저장소 하나가 코어를 의존성으로
당겨 오면 충분하다. 저장소가 늘면 "어느 것이 진짜인가"를 매번 따져야 한다.

## 3. 경계 — 무엇을 어디에 두나

| | 공개 코어 | private 유료 |
|---|---|---|
| 협업 **설계 문서** | ✅ 그대로 | — |
| 협업 **구현**(CRDT·Presence·잠금·채팅) | ❌ | ✅ |
| 확장점 **인터페이스** | ✅ | — |
| 확장점 **스텁**(유료 모듈이 없을 때의 응답) | ✅ | — |
| 협업 전용 **DB 표** | ❌ | ✅ (자기 델타 SQL 로) |
| 협업 표식(`maps.kind = 'collab'`) | ✅ 이미 있다 | — |
| 화면의 "협업" 자리 + `준비 중` 배지 | ✅ | — |
| 협업 화면 구현 | ❌ | ✅ |

**"자리와 규칙은 공개, 알맹이는 비공개"** 가 원칙이다.

> 이 패턴은 이미 쓰고 있다 — 관리자 콘솔의 **결제관리 탭이 `준비 중` 자리만
> 차지**하고 있는 것(`AdminPage.tsx` 의 `TABS[].soon`)이 정확히 그것이다.

## 4. 서버 확장점 — NestJS 동적 모듈

지금 `app.module.ts` 는 모듈을 **정적으로 import** 한다. 유료 모듈은 있을
수도 없을 수도 있으므로, **있으면 진짜를 등록하고 없으면 스텁을 등록하는**
자리를 코어에 만든다.

```
apps/api/src/collab/
  collab.module.ts      ← 이 자리에서 갈린다 (공개)
  collab.contract.ts    ← 인터페이스 (공개)
  collab.stub.ts        ← 유료 모듈이 없을 때 (공개)
```

```ts
// collab.module.ts (공개 코어)
@Module({})
export class CollabModule {
  static register(): DynamicModule {
    // **선택 의존성**이다 — 없으면 스텁으로 간다.
    // require 를 try 로 감싸는 이유: 번들러가 없는 패키지를 찾다 빌드를
    // 깨뜨리지 않게 하려면 정적 import 를 쓸 수 없다.
    let impl: Type<CollabContract> = CollabStub;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      impl = require('@easymindmap/collab').CollabService;
    } catch { /* 유료 모듈이 없다 — 스텁으로 간다 */ }
    return {
      module: CollabModule,
      providers: [{ provide: COLLAB, useClass: impl }],
      exports: [COLLAB],
    };
  }
}
```

**스텁이 하는 일은 "없다"고 정직하게 답하는 것**이다. 조용히 성공하면
사용자가 협업이 되는 줄 안다.

```ts
// collab.stub.ts
throw new NotFoundException(
  '협업은 유료 기능입니다. 이 서버에는 협업 모듈이 설치돼 있지 않습니다.',
);
```

**규칙 셋.**

1. **코어는 유료 모듈의 타입을 import 하지 않는다.** 계약(`collab.contract.ts`)
   만 보고, 구현은 런타임에 꽂힌다. 그래야 공개 저장소만으로 타입체크가 통과한다.
2. **스텁이 기본이다.** 유료 모듈이 없을 때가 **정상 동작**이지 오류 상태가
   아니다 — 공개판을 받아 쓰는 사람에게는 그게 제품이다.
3. **기동 로그에 어느 쪽인지 한 줄 남긴다.** `협업 모듈: 설치됨 / 없음(스텁)`.
   운영에서 "왜 협업이 안 되지"를 로그 한 줄로 끝내기 위해서다.

## 5. 프런트 확장점 — Vite 별칭

프런트는 번들러가 빌드 시점에 정하므로 **별칭(alias)** 이 맞다. 이 저장소는
이미 같은 패턴을 쓴다 — `@emm` → `packages/emm-parser/src`.

```ts
// vite.config.ts
alias: {
  '@emm': …,
  // 유료 UI 가 있으면 그쪽, 없으면 코어의 스텁으로
  '@collab': existsSync(collabUi) ? collabUi : './src/collab/stub',
}
```

```
apps/frontend/src/collab/
  contract.ts   ← 화면이 기대하는 모양 (공개)
  stub.tsx      ← "협업은 유료 기능입니다" 안내 (공개)
```

**메뉴 자리는 코어에 둔다.** 관리자 콘솔의 `TABS[].soon` 과 같은 방식으로,
협업 메뉴가 항상 보이되 스텁일 때는 안내를 띄운다. 자리까지 유료 모듈이
만들게 하면 **코어의 레이아웃을 유료 모듈이 알아야** 해서 경계가 무너진다.

## 6. DB 경계

| | 누가 소유하나 |
|---|---|
| `maps`·`map_documents`·`users` 등 | 코어 |
| `maps.kind = 'collab'` 표식 | 코어 (이미 있다) |
| `collab_*` (Presence·잠금·채팅 등) | **유료 모듈** — 자기 델타 SQL 로 만든다 |

**코어의 헬스체크(`REQUIRED_TABLES`)에 협업 표를 넣지 않는다.** 넣으면
공개판만 배포했을 때 영원히 `degraded` 가 된다. 유료 모듈은 자기 표를
자기가 확인한다.

## 7. 빌드·배포

private 저장소가 공개 코어를 **의존성으로 당겨 온다**(서브모듈이 아니라
npm 의존성 — 버전을 태그로 고정할 수 있어 "어느 코어 위에서 도는지"가
분명해진다).

```
easymindmap-collab/
  package.json        → "@easymindmap/core": "github:okpojung/easymindmap#v1.2.0"
  server/             → @easymindmap/collab   (NestJS 서비스)
  ui/                 → @easymindmap/collab-ui (React)
  Dockerfile          → 코어 + 유료 모듈을 함께 빌드
```

Coolify 는 **유료판 배포에서 private 저장소를 Source 로** 쓴다. 공개판을
따로 돌릴 일이 있으면 지금 설정을 그대로 두면 된다.

## 8. 공개 저장소에 남기면 안 되는 것

설계 문서는 남기기로 했지만(사용자 결정), 아래는 **절대 넘어가면 안 된다.**

- 유료 기능의 **구현 코드**(부분·미완성이라도)
- 유료 기능의 **e2e 스크립트와 카탈로그 항목** — 무엇을 어떻게 만들었는지가
  그대로 드러난다. 유료 쪽 검증은 private 저장소의 카탈로그에 적는다
- API 키·라이선스 키·서명 비밀값
- 유료 고객 명단·계약 조건

> **판단이 서지 않으면 private 에 둔다.** 나중에 공개로 옮기는 것은 언제든
> 되지만, 공개된 것을 비공개로 되돌리는 것은 **불가능하다.**

## 9. 라이선스 표기

- 공개 코어: `LICENSE`(Apache-2.0) 그대로. 기여자가 생기면 `NOTICE` 관리.
- private 모듈: 파일 머리에 **독점 표기**를 넣는다.
  ```
  Copyright (c) 2026 <상호>. All rights reserved.
  This file is NOT covered by the Apache-2.0 license of easymindmap core.
  ```
- 유료 모듈이 코어를 쓰는 것은 Apache-2.0 이 허용한다. **배포물에 코어의
  라이선스 사본과 NOTICE 를 포함**해야 한다(Apache-2.0 §4).

## 10. 지금 할 일 (첫 PR 체크리스트)

이 문서는 **설계까지**다. 구현은 아래 순서로 한다.

- [ ] `apps/api/src/collab/` — contract · stub · module (스텁이 404 를 주는지 e2e)
- [ ] `apps/frontend/src/collab/` — contract · stub + vite 별칭
- [ ] 메뉴 자리 + `준비 중` 배지 (관리자 콘솔 결제관리와 같은 방식)
- [ ] 기동 로그 한 줄 (`협업 모듈: 없음(스텁)`)
- [ ] private 저장소 `okpojung/easymindmap-collab` 생성

> **확장점만으로는 검증할 것이 적다** — 스텁이 정직하게 404 를 주는지,
> 유료 모듈이 없어도 앱이 정상 기동하는지 정도다. 그거면 충분하다.
> 확장점의 값어치는 **나중에 코어를 다시 뜯지 않아도 되는 것**이지
> 지금 무언가 동작하는 것이 아니다.
