# 셀프호스트 Docker 배포 — 설계

> **문서 상태: 설계(초안).** 이 문서만 보고 오늘 바로 띄울 수는 없다 —
> **API 이미지를 만드는 `Dockerfile` 이 저장소에 아직 없다**(§2).
> 무엇이 있고 무엇이 없는지를 §2 에 그대로 적어 두었고, 막는 것들을
> §9 에 순서대로 정리했다.
>
> 작성: 2026-08-28

---

## 0. 한 줄

**남이 자기 서버에 easymindmap 을 통째로 올려 쓰는 구성.**
클라우드(mindmap.ai.kr)와 **같은 코드, 다른 조립**이다.

---

## 1. 왜 필요한가 — 세 가지 요구

| 요구 | 클라우드로 되나 | 근거 문서 |
|---|---|---|
| **내 지식 저장소를 내 디스크에** — 맵이 `.md` 파일로 쌓이고 Obsidian 이 같은 폴더를 본다 | ❌ 사용자의 디스크가 없다 | [`../04-extensions/vault-mirror.md`](../04-extensions/vault-mirror.md) §2 |
| **온프레미스 납품** — 공공·금융은 자료가 밖으로 나가는 것을 허락하지 않는다 | ❌ | [`../00-project-overview/emm-strategy.md`](../00-project-overview/emm-strategy.md) |
| **화이트라벨** — 파트너가 자기 브랜드·도메인으로 판다 | ❌ | [`../00-project-overview/glossary.md`](../00-project-overview/glossary.md) §5.5 |

> vault 문서의 표현이 정확하다 — 셀프호스트를 쓸 진짜 이유는 "마인드맵
> 앱을 도커로 띄운다"가 아니라 **"내 지식 저장소를 내 NAS 에 둔다"** 다.

---

## 2. 지금 있는 것과 없는 것

**이 표가 이 문서에서 가장 중요하다.** 없는 것을 있는 것처럼 적으면
받아 본 사람이 30분을 버리고 나서야 알게 된다.

| 조각 | 상태 | 실체 |
|---|---|---|
| 프런트엔드 이미지 | ✅ 있다 | [`apps/frontend/Dockerfile`](../../apps/frontend/Dockerfile) — 빌드 컨텍스트는 **저장소 루트**여야 한다(`packages/emm-parser` 를 함께 COPY) |
| **API 이미지** | ❌ **없다** | `apps/api` 에 `Dockerfile` 이 없다. 지금은 Coolify 가 소스에서 직접 빌드한다 |
| 셀프호스트용 compose | ❌ 없다 | `apps/api/docker-compose.dev.yml` 은 **개발용 DB 한 대**뿐이다 |
| 스키마 적용 | ✅ 있다 | `npm run db:apply` — **몇 번 실행해도 안전하다**(모든 DDL 이 `IF NOT EXISTS`/`DROP-CREATE`) |
| 첨부 저장 | ✅ 있다 | `STORAGE_LOCAL_DIR` 디렉터리에 파일로 쌓인다. **드라이버는 로컬 디스크 하나뿐**이다 — 코드가 `LocalDiskStorage` 로 고정돼 있고 S3 호환은 아직 없다 |
| vault 미러 | ✅ 있다 | `VAULT_DIR` 을 주면 켜진다. 비어 있으면 **아무것도 하지 않는다** |
| 인증 | △ 절반 | API 는 `AUTH_MODE=dev`(단독)·`supabase`(GoTrue JWT 검증) 둘 다 **구현돼 있다.** GoTrue 컨테이너를 셀프호스트 구성에 어떻게 넣을지는 안 정했다 |
| 이미지 배포(레지스트리) | ❌ 없다 | 태그·퍼블리시 절차가 없다. 오픈코어 경계 문서 §7 이 유료판 빌드만 다룬다 |

**그래서 이 문서는 "실행 절차서"가 아니라 "설계와 남은 일"이다.**
절차서는 §9 가 끝나야 쓸 수 있다.

---

## 3. 구성은 둘로 나눈다

한 벌로 다 덮으려 하면 평가하려는 사람에게는 무겁고, 팀으로 쓰는 곳에는
모자란다.

### 3.1 최소 구성 — 혼자 쓰거나 평가해 보는 사람

```
web (nginx + 정적 번들)  ──▶  api (NestJS)  ──▶  db (PostgreSQL 16)
                                   │
                                   ├─▶ 볼륨: 첨부 (STORAGE_LOCAL_DIR)
                                   └─▶ 볼륨: vault (VAULT_DIR)
```

컨테이너 **3개**. `AUTH_MODE=dev` 로 두면 로그인 화면이 아예 뜨지 않고
(`VITE_SUPABASE_URL` 이 없으면 프런트가 인증을 끈다) 모든 요청이
`DEV_USER_ID` 한 사람의 것이 된다.

> ⚠️ **`AUTH_MODE=dev` 는 인증이 없는 것이지 "약한 인증"이 아니다.**
> 이 구성을 인터넷에 그대로 노출하면 **누구나 그 계정의 자료를 본다.**
> 개인 서버·사내망·평가용으로만 쓴다.

### 3.2 인증 포함 구성 — 여러 사람이 쓰는 곳

여기에 **GoTrue(9999)** 가 더해진다. `AUTH_MODE=supabase` + `SUPABASE_JWT_SECRET`
(GoTrue 와 **같은 값**, HS256)이 필수이고, 프런트는 `VITE_SUPABASE_URL` ·
`VITE_SUPABASE_ANON_KEY` 를 **빌드할 때** 받는다(§9 ②).

| | 최소 | 인증 포함 |
|---|---|---|
| 컨테이너 | 3 | 4 |
| 로그인 화면 | 없음 | 있음 |
| 계정 분리 | ❌ 한 사람 | ✅ |
| 회원탈퇴가 로그인 계정까지 지움 | 해당 없음 | `GOTRUE_URL` 을 채워야 한다 |
| 관리자 콘솔 | `ADMIN_EMAILS` 로 연다 | 같음 |

---

## 4. 컨테이너와 볼륨

| 컨테이너 | 이미지 | 포트 | 하는 일 |
|---|---|---|---|
| `web` | 저장소의 `apps/frontend/Dockerfile` 로 빌드 | 80 | 정적 번들 + SPA 폴백. `index.html` 은 캐시하지 않는다 |
| `api` | **아직 없다**(§9 ①) | 3000 | REST API. 첨부·vault·스키마 검사 |
| `db` | `postgres:16` | 5432 | 정본. **ltree 확장**을 쓴다 |
| `auth` (3.2) | GoTrue | 9999 | 로그인. API 는 JWT 만 검증한다 |

**볼륨은 셋이고, 셋 다 사라지면 안 되는 것이다.**

| 볼륨 | 무엇 | 없으면 |
|---|---|---|
| DB 데이터 | 맵·노드·버전·계정 | 전부 잃는다 |
| `STORAGE_LOCAL_DIR` | 첨부 파일 실체 | 맵은 남고 **사진이 전부 깨진다** |
| `VAULT_DIR` | `.md` 미러 | 다시 만들 수 있다(DB 가 정본) |

> ⚠️ **vault 로 줄 폴더는 반드시 빈 폴더여야 한다.** 이미 파일이 있으면
> 서버가 **거절한다** — 남의 폴더를 덮어쓰는 사고를 막기 위해서다.
> 정상이면 그 폴더에 마커 파일 `.easymindmap-vault` 와 안내용 `README.md`
> 가 생긴다. 마커가 없는 폴더에는 **아무것도 쓰지 않는다**
> ([`../04-extensions/vault-mirror.md`](../04-extensions/vault-mirror.md) §7).

---

## 5. compose 초안

**구성의 기준 스펙이지, 지금 돌아가는 파일이 아니다** — `api` 는 아직
없는 `Dockerfile` 을 가리킨다(§9 ①). 여러 VM 에 나눠 얹는 우리
운영 구성은 [`docker-compose-spec.md`](docker-compose-spec.md) 가 따로 있다.
이쪽은 **한 대에 다 올리는** 남의 서버용이다.

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: emm
      POSTGRES_PASSWORD: ${DB_PASSWORD:?}
      POSTGRES_DB: easymindmap
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U emm -d easymindmap']
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  api:
    build:
      context: .                       # 저장소 루트
      dockerfile: apps/api/Dockerfile  # ← §9 ① 아직 없다
    environment:
      DATABASE_URL: postgres://emm:${DB_PASSWORD:?}@db:5432/easymindmap
      CORS_ORIGIN: ${PUBLIC_URL:-http://localhost:8080}
      AUTH_MODE: dev                   # 3.2 는 supabase + SUPABASE_JWT_SECRET
      STORAGE_LOCAL_DIR: /data/attachments
      VAULT_DIR: /data/vault           # 비우면 vault 가 꺼진다
      TRUST_PROXY: 'loopback, linklocal, uniquelocal'
    volumes:
      - attachments:/data/attachments
      - ./vault:/data/vault            # 사용자가 자기 폴더를 물린다 (빈 폴더!)
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped

  web:
    build:
      context: .
      dockerfile: apps/frontend/Dockerfile
      args:
        VITE_API_URL: ${PUBLIC_API_URL:?}   # ★ 빌드 시점에 박힌다 (§9 ②)
    ports:
      - '${WEB_PORT:-8080}:80'
    depends_on: [api]
    restart: unless-stopped

volumes:
  db-data:
  attachments:
```

---

## 6. 환경변수 — 셀프호스트에서 실제로 봐야 하는 것

전체 목록과 근거는 [`../05-implementation/env-spec.md`](../05-implementation/env-spec.md),
검증 규칙은 `apps/api/src/config/env.validation.ts` 가 기준이다.
**서버는 필수 값이 없거나 형식이 틀리면 조용히 넘어가지 않고 즉시 죽는다.**

| 변수 | 기본값 | 셀프호스트에서의 의미 |
|---|---|---|
| `DATABASE_URL` | — | **필수.** 없으면 기동하지 않는다 |
| `CORS_ORIGIN` | `http://localhost:5173` | 프런트가 실제로 열리는 주소. 틀리면 화면은 뜨는데 **저장이 안 된다** |
| `AUTH_MODE` | `dev` | `dev` = 인증 없음(§3.1 경고) · `supabase` = GoTrue JWT 검증 |
| `SUPABASE_JWT_SECRET` | — | `AUTH_MODE=supabase` 면 **16자 이상 필수**, GoTrue 와 같은 값 |
| `STORAGE_LOCAL_DIR` | `./data/attachments` | 첨부 실체가 쌓이는 곳. **볼륨으로 물린다** |
| `VAULT_DIR` | (빈 값) | **비어 있으면 vault 가 꺼진다.** 켤 때는 빈 폴더 |
| `ATTACHMENT_MAX_MB` | 200 | 단일 요청 업로드 상한(메모리에 올라간다) |
| `ATTACHMENT_CHUNK_MAX_MB` | 1024 | 청크 업로드 상한(스트림이라 메모리와 무관) |
| `RATE_LIMIT_MAX` / `_WINDOW_MS` | 600 / 60000 | 사내망 단독 서버라면 넉넉하다. 근거는 [`../05-implementation/rate-limit.md`](../05-implementation/rate-limit.md) |
| `TRUST_PROXY` | `loopback, linklocal, uniquelocal` | 앞에 nginx·Traefik 을 두면 **이 값이 맞아야 접속 IP 가 진짜가 된다** |
| `SMTP_*` | (빈 값) | 비우면 메일 발송만 꺼진다. 앱은 죽지 않는다 |
| `ADMIN_EMAILS` | (빈 값) | **비우면 관리자 콘솔에 아무도 못 들어간다**(기동 로그에 경고) |
| `AI_KEY_SECRET` | (빈 값) | **비우면 AI API 키 계정 보관이 꺼진다**(키는 브라우저에만 남고 화면이 그 사실을 밝힌다). 16자 이상, 한 번 정하면 바꾸지 말 것 — 18-ai.md §키 보관 |
| `GOTRUE_URL` | (빈 값) | 인증 구성에서 회원탈퇴가 로그인 계정까지 지우려면 필요 |

---

## 7. 스키마는 따로 넣는다

앱은 **스키마를 자동으로 만들지 않는다.** 컨테이너를 처음 띄운 뒤 한 번
넣어야 한다.

```bash
# apps/api 에서 실행한다
DATABASE_URL=postgres://emm:...@db:5432/easymindmap npm run db:apply
```

- **몇 번 실행해도 안전하다** — "이미 있음" 계열 오류(42P07·42710 등)는
  정상으로 보고 넘어간다.
- 넣었는지 확인하는 자리는 **헬스체크**다. API 가 필수 테이블 목록을 들고
  있어서, 빠진 것이 있으면 **사용자가 저장 500 을 겪기 전에** 알려 준다.

> ⚠️ **순정 PostgreSQL 에는 `auth.users` 가 없다.** 스키마가 Supabase 를
> 전제로 쓰여 있어서, 개발용으로 `database/dev/00-supabase-shim.sql`
> (auth 스키마·`auth.users`·`auth.uid()` 를 최소한으로 흉내 낸다)이 있는데
> 그 파일에는 **"로컬/CI 전용, 실제 Supabase 에 절대 적용하지 말 것"**
> 이라고 적혀 있다. 셀프호스트가 순정 Postgres 로 갈지, Supabase 스택을
> 통째로 요구할지는 **아직 정하지 않았다**(§9 ③).

---

## 8. 유료 모듈은 들어가지 않는다

공개 저장소를 그대로 빌드하면 **유료 모듈이 없는 배포**가 된다. 그것이
오류가 아니라 **정상 동작**이다.

- `GET /v1/features` 가 기능 **목록은 그대로 주고**, 전부 꺼져 있다고 +
  "유료 기능입니다. 이 서버에는 유료 모듈이 설치돼 있지 않습니다" 라고 답한다.
- 빈 목록을 주지 않는 이유 — 비어 있으면 화면이 "그런 기능이 원래 없다"로
  읽고 자리조차 그리지 않는다.
- 재배포물에는 **코어의 `LICENSE`(와 `NOTICE`)를 함께 넣는다.**
  Apache-2.0 §4 의 조건이고, 빠뜨리면 허용된 결합이 침해가 된다.

경계 자체는 [`../04-extensions/open-core-boundary.md`](../04-extensions/open-core-boundary.md) 가 기준이다.

---

## 9. 아직 못 푼 것 — 막는 순서대로

절차서를 쓰려면 ①②③ 이 먼저다.

**① API `Dockerfile` 이 없다.** 프런트와 같은 이유로 빌드 컨텍스트는
저장소 루트여야 한다(`packages/emm-parser` 참조). `npm run build` →
`node dist/main.js` 가 실행 형태다.

**② 프런트엔드 설정이 빌드 시점에 박힌다.** `VITE_API_URL` ·
`VITE_SUPABASE_URL` 은 `import.meta.env` 라 **번들에 그대로 굳는다.**
그래서 지금 구조로는 **"이미지 하나 받아서 주소만 바꿔 쓰기"가 안 된다** —
받는 쪽이 자기 주소로 직접 빌드해야 한다. 이미지를 배포하려면 런타임에
설정을 읽는 자리(예: nginx 가 내주는 `config.js` 한 장)를 먼저 만들어야
한다. **이것이 화이트라벨의 실제 걸림돌이다.**

**③ 순정 Postgres 의 `auth.users` 를 어떻게 할지 정한다**(§7).
셀프호스트에 Supabase 스택 전체를 요구하는 것은 무겁다.

**④ 인증 구성의 GoTrue 를 어디까지 우리가 조립해 줄지** 정한다.
`SUPABASE_JWT_SECRET` 을 양쪽에 같게 넣는 일은 사람이 틀리기 쉽다.

**⑤ 업그레이드 절차.** 이미지를 올린 뒤 `db:apply` 를 다시 돌리는 순서와,
스키마가 앞서갈 때 앱이 어떻게 버티는지를 적어야 한다.

**⑥ 검증.** 실제로 빈 서버에서 띄워 보고 항목을 세어
[`../05-implementation/test-catalog.md`](../05-implementation/test-catalog.md) 에 남긴다.
**이 문서의 어떤 구성도 아직 그렇게 검증된 적이 없다.**

---

## 10. 백업 — 세 곳을 함께 잡는다

| 대상 | 방법 | 하나만 잡으면 |
|---|---|---|
| DB | `pg_dump` / PITR | 사진이 전부 깨진 맵이 복구된다 |
| 첨부(`STORAGE_LOCAL_DIR`) | 파일 복사 | 맵은 있는데 첨부가 없다 |
| vault(`VAULT_DIR`) | 안 잡아도 된다 | DB 에서 다시 만들어진다 |

용어(RPO/RTO·PITR·3-2-1)는 [`../00-project-overview/glossary.md`](../00-project-overview/glossary.md) §4,
우리 서버의 실제 계획은 [`infra-architecture.md`](infra-architecture.md) §18 에 있다.

> ⚠️ `rsync --delete` 는 백업이 아니라 **미러**다. 원본에서 지워진 것이
> 백업에서도 지워지므로 실수와 랜섬웨어가 그대로 전파된다.

---

## 11. 함께 보면 좋은 것

| 궁금한 것 | 문서 |
|---|---|
| vault 미러가 정확히 무엇을 쓰나 | [`../04-extensions/vault-mirror.md`](../04-extensions/vault-mirror.md) |
| 우리 서버(여러 VM)의 구성 | [`docker-compose-spec.md`](docker-compose-spec.md) |
| 지금 운영 중인 배포는 어떻게 도나 | [`dev-server-coolify.md`](dev-server-coolify.md) |
| 환경변수 전체 | [`../05-implementation/env-spec.md`](../05-implementation/env-spec.md) |
| 무엇이 공개이고 무엇이 유료인가 | [`../04-extensions/open-core-boundary.md`](../04-extensions/open-core-boundary.md) |
| 인프라·백업 용어 | [`../00-project-overview/glossary.md`](../00-project-overview/glossary.md) §4 |
