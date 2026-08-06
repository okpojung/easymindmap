# 백엔드 Phase 1 — 걷는 뼈대(맵 저장)

> 상태: 구현·검증 완료 (2026-07). 위치: `apps/api`.
> 다음 단계 로드맵은 문서 하단 참조.
> 최종 업데이트: 2026-08-04 — Phase 4c 이후 완료 항목(B8 히스토리·B9
> 첨부/쿼터·문서함·편집 잠금) 추가, 코드 현행에 맞춰 표·설명 정정.

프론트가 지금까지 100% 클라이언트(localStorage) 전용이었던 것에서, **서버에
맵을 저장**하는 첫 수직 슬라이스를 붙였다. 스펙(NestJS + Supabase +
Postgres 16 + ltree)의 구조를 따르되, **무거운 조각(Supabase 전체 스택·
Redis)은 뒤로 미루고 실제로 돌아가는 최소 단위**부터 세웠다.

## 무엇이 들어갔나

- **NestJS 앱** (`apps/api/src`): ConfigModule(환경검증) + 전역
  ValidationPipe + `/v1` 프리픽스 + CORS.
- **DatabaseService** (`database/`): `pg` Pool 기반 raw SQL. ORM 미사용 —
  `schema.sql`/ltree 등 DB 고유 기능을 그대로 쓰고 Supabase(=Postgres)
  전환 시에도 접속 방식 동일.
- **인증 스텁** (`common/auth`): `DevAuthGuard` + `@CurrentUser()`.
  `AUTH_MODE=dev` 에서 헤더 `x-user-id` 또는 `DEV_USER_ID` 로 사용자 지정
  (로그인 없이 개발). `AUTH_MODE=supabase` 는 명시적으로 막아 둠 → Phase 3
  에서 Supabase JWT 검증 가드로 **국소 교체**.
  **→ Phase 3 에서 실제로 `AuthGuard`(`common/auth/auth.guard.ts`) 로
  교체됨** — dev 스텁 동작은 `AUTH_MODE=dev` 분기로 그대로 흡수.
- **Health** (`GET /v1/health`): DB 연결 + **필수 테이블·컬럼(스키마 최신
  여부)까지 확인** — `map_documents`·`map_document_versions`·`attachments`·
  `map_edit_locks`·`maps.folder_id`·`users.quota_bytes` 등이 빠지면
  `status: degraded` 로 알려 준다 (배포 시 스키마 적용 누락 조기 발견).
- **Maps CRUD** (`maps/`): 아래 표. 응답은 `api-spec.md` 계약(camelCase).

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/v1/maps` | 생성 → `{mapId,title,folderId,kind,currentVersion,createdAt}` |
| GET | `/v1/maps` | 목록(소유 기준, `?deleted=&page=&limit=&folder=&sort=&order=`) |
| GET | `/v1/maps/:id` | 단건(+`nodes[]` — Phase 2 이후 **실제 노드 배열 반환**, depth·orderIndex 순 정렬) |
| PATCH | `/v1/maps/:id` | 메타 수정(title·viewMode·refreshIntervalSeconds·layout·folderId·kind) |
| DELETE | `/v1/maps/:id` | 소프트 삭제(`deleted_at`), 204 |

- `?folder=root|<uuid>` 폴더별 조회, `?sort=title|updatedAt&order=asc|desc`
  정렬은 문서함(2026-08-02)에서 추가됐다.

- **소유권 격리**: 모든 쿼리가 `owner_id = 현재 사용자`. 다른 사용자
  헤더로는 남의 맵이 보이지 않음(검증됨).

## 로컬 실행/검증

- DB: `docker compose -f apps/api/docker-compose.dev.yml up -d`
  (Postgres 16 + ltree, `dev/*.sql`·`schema.sql` 자동 로드).
- 서버: `npm run start:dev` → `http://localhost:3000/v1`.
- 스모크: `npm run smoke` (맵 CRUD 왕복 10항목).

### 순정 Postgres 호환 shim

`schema.sql` 은 Supabase 전용 요소(RLS `auth.uid()`, `supabase_realtime`
퍼블리케이션, `auth.users`)를 포함한다. 로컬/CI의 순정 Postgres에서 이걸
**수정 없이** 로드하기 위해 `database/dev/00-supabase-shim.sql` 이 해당
객체를 최소한으로 흉내 낸다. **로컬/CI 전용**이며 실제 Supabase 배포엔
쓰지 않는다.

## CI

`.github/workflows/ci.yml` 의 **backend 잡**: 임시 Postgres 16 서비스
컨테이너를 띄워 → 스키마 로드 → API 기동 → `npm run smoke`(맵 CRUD 왕복)
까지 매 PR에서 자동 실행. 즉 백엔드가 **실제 DB와 함께** 검증된다.

## Phase 2 — 노드 CRUD + ltree 이동 + autosave (완료)

맵 안의 **노드 트리**를 서버에 저장·조작한다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/v1/maps/:mapId/nodes` | 노드 생성 — parentId 없으면 루트(`path='root'`), 있으면 `parent.path || 'n_'+uuid8`, depth=부모+1 |
| PATCH | `/v1/maps/:mapId/nodes` | **autosave** — 배치 patch(add/update/delete/move), 트랜잭션 |
| PATCH | `/v1/nodes/:id` | 속성 수정(text·style→style_json·collapsed·shape·layout·manualPosition) |
| DELETE | `/v1/nodes/:id` | subtree cascade 삭제(204) |
| PATCH | `/v1/nodes/:id/move` | `move_node_subtree` RPC — 부모 변경 + subtree ltree path 일괄 재작성, 순환 차단 |
| PATCH | `/v1/nodes/:id/layout` | layout_type 변경(Edge 타입은 클라이언트 자동 결정) |

핵심 설계:
- **ltree path/​depth**: 앱에서 노드 id 를 먼저 생성해 `n_+uuid8` 레이블로
  path 계산(`node-path.util.ts`). depth=부모+1. 이동은 DB 함수가 subtree
  전체 path 를 원자적으로 재작성.
- **autosave 동시성**: 트랜잭션에서 맵을 `FOR UPDATE` 잠금 →
  `baseVersion !== currentVersion` 이면 `409 VERSION_CONFLICT` →
  동일 `patchId` 는 `409 DUPLICATE_PATCH`(멱등, `map_revisions.patch_id`
  UNIQUE) → 패치 순차 적용 → `current_version+1` + `map_revisions` 기록 →
  `{ newVersion, conflicts:[] }`.
- **루트 유일성**: 맵당 parent_id NULL 노드는 1개(중복 생성 시 400).
- **직접 노드 엔드포인트는 버전 미증가** — autosave 가 버전/이력 경로.

검증(smoke, CI backend 잡에서 매 PR 실행): 루트/자식 생성·중복 루트 거부·
맵 로드·수정·레이아웃·이동(depth 2·path 재작성)·순환 차단·autosave
newVersion·중복·버전충돌·반영·cascade 삭제 전 항목 통과.

## Phase 4a — 프론트엔드 연결 (클라우드 문서 저장, 완료)

프론트가 지금까지 인메모리(파일 내보내기/불러오기)뿐이던 것에, **서버에
문서를 저장·복원**하는 첫 연결을 붙였다. 임베드 이미지가 이 제품의 핵심
차별점이라 **손실 없는 전체 문서 스냅샷** 방식으로 저장한다.

- **백엔드**: `map_documents(map_id PK, doc JSONB, updated_at)` 테이블 + RLS.
  - `PUT /v1/maps/:id/document` — 문서 스냅샷 upsert(+title 갱신)
  - `GET /v1/maps/:id/document` — 조회
  - 임베드 이미지(data URL)로 커질 수 있어 JSON 바디 한도 **25mb**.
- **프론트**: `services/cloud/apiClient.ts`(fetch 래퍼) + `stores/cloudStore.ts`
  (현재 문서↔서버 맵 연결 정보 localStorage 영속) + TopToolbar **☁ 클라우드**
  메뉴(저장 / 열기 목록 모달). 스냅샷 = `{ v, map, kanban }`, 열기 시
  `documentStore.loadMap(doc.map)`.
  - 인증은 현재 개발 모드(단일 개발 사용자). 실제 로그인은 Phase 3.
- **정규화 노드 vs 스냅샷**: Phase 2의 정규화 노드/autosave 는 세밀 동기화·
  협업용으로 유지하고, 첫 클라우드 저장은 **전체 스냅샷**(손실 0)으로 간다.

검증: 백엔드 smoke(문서 저장·손실 없는 왕복·404) + **풀스택 E2E**
(루트 편집→저장→새로고침 리셋→목록→열기→마커 복원, JS 오류 0).

### Phase 4b — 클라우드 사용성 (완료)

- **자동 저장**(`hooks/useCloudAutosave.ts`): 문서가 서버 맵에 연결된
  상태에서 주기(기본 5분)·미저장 편집 50개·탭 전환/창 닫기 시점에 스냅샷을 자동 저장. 상태는
  상단 툴바 배지(`useAutosaveStore`: dirty→saving→saved/error)로 표시.
- **안전장치**: `cloudStore` 를 **세션 한정(비영속)** 으로 — cloudMapId 를
  새로고침 후에도 유지하면 인메모리 기본 문서가 서버 맵을 덮어써 유실될
  수 있어, 재접속은 명시적 "열기"로만. 열기(loadMap) 직후 1건은
  자동저장에서 제외(방금 불러온 문서 되쓰기 방지).
- **목록 관리**: 열기 모달의 각 맵에 **이름변경(✏, PATCH /maps/:id)**·
  **삭제(🗑, DELETE /maps/:id)**. 연결된 맵 삭제 시 링크 해제.

검증: 풀스택 E2E(e2e-cloud2) — 자동저장이 수동 저장 없이 서버에 반영·
이름변경 반영·삭제 후 목록 비움·JS 오류 0.

## Phase 3 — Supabase Auth(JWT) 인증 (코드 완료, 2026-08-01)

> 앱 코드는 완료 — **활성화는 서버에 Supabase 스택(GoTrue) 배포 후**
> 환경변수만 켜면 된다 (아래 "활성화 절차").

> ⚠️ **CJS 제약 (2026-08-01 배포 실패에서 확정)** — api 는
> `tsconfig module=commonjs` 로 빌드된다. **ESM 전용 패키지를
> import 하면 낮은 Node 에서 런타임에 `ERR_REQUIRE_ESM` 으로 죽는다**
> (초기 구현이 jose v6 을 썼다가 컨테이너 기동 실패 → 롤백). 인증
> 라이브러리는 **CJS 네이티브 `jsonwebtoken`** 을 쓴다.
> 로컬 재현법: `node --no-experimental-require-module dist/main.js`
> (Node 22.12+ 는 require(ESM) 을 기본 허용하므로, 이 플래그가 없으면
> 낮은 Node 환경의 결함이 로컬에서 드러나지 않는다.)
> CI 가 `AUTH_MODE=supabase` 부팅 스모크로 이를 상시 검증한다.

- **API — `AuthGuard`**(`common/auth/auth.guard.ts`, DevAuthGuard 대체):
  - `AUTH_MODE=dev`: 기존 스텁 그대로 (x-user-id / DEV_USER_ID).
  - `AUTH_MODE=supabase`: `Authorization: Bearer <JWT>` 를
    `SUPABASE_JWT_SECRET`(HS256, GoTrue 서명·`aud=authenticated`·exp)으로
    검증(**jsonwebtoken** — 이 앱은 CommonJS 빌드라 ESM 전용
    패키지 금지, 2026-08-01 배포 실패 원인), `sub` = 사용자 id. **JIT 프로비저닝** — 첫 요청 시
    `auth.users`/`public.users` 행을 만들어 FK 성립 (프로세스 캐시로
    요청당 오버헤드 없음). 미검증/만료/위조/aud 불일치 = 401.
  - 환경변수 검증: supabase 모드에서 `SUPABASE_JWT_SECRET`(≥16자) 필수.
- **프런트 — 이메일/비밀번호 로그인** (`VITE_SUPABASE_URL` 설정 시 활성):
  - `services/cloud/supabaseAuth.ts`: GoTrue REST(가입/로그인/갱신/
    로그아웃 — SDK 없이 4개 엔드포인트 직접 호출, 번들 절약).
  - `stores/authStore.ts`: 세션 localStorage 영속(새로고침 유지),
    만료 60초 전 자동 refresh, 실패 시 세션 해제(재로그인 유도).
  - `apiClient`: 모든 클라우드 호출에 Bearer 자동 첨부. 비로그인 호출
    은 즉시 "로그인이 필요합니다".
  - **로그인 UI 정리(2026-08-02)**: 비로그인 → 소개+로그인 화면만
    (`WelcomeScreen`, 에디터 완전 차단) / 계정 메뉴는 우상단 아바타
    (`UserMenu`) / 상단은 ☁ 저장 · ✕ 맵 닫기(`MapActions`) / 맵 열기는
    좌측 '서버 맵 불러오기' 하나 / 다른 맵은 **브라우저 새 탭**
    (`?map=<id>`). 상세: [auth-session-ui.md](../04-extensions/auth-session-ui.md).
    `VITE_SUPABASE_URL` 미설정(개발 모드)이면 게이트 없이 기존 그대로.
  - frontend Dockerfile 에 `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
    빌드 ARG 추가.
- **활성화 절차 (서버)** — 현재 dev 서버는 **순정 PostgreSQL 16**
  (Supabase 미설치)이므로 두 경로가 있다:
  - **경로 A (권장, 가벼움)**: **GoTrue 단독 컨테이너**를 Coolify에
    추가하고 기존 PG16 인스턴스에 **전용 데이터베이스**(`gotrue`)만
    만들어 쓴다 — 같은 DB에 넣으면 shim `auth.users`와 GoTrue
    마이그레이션이 충돌하며, API의 JIT 프로비저닝이 앱 DB 사용자 행을
    만들어 주므로 분리해도 동작한다. GoTrue 단독은 **루트 경로**로
    서비스하므로 frontend 빌드 변수 `VITE_SUPABASE_AUTH_PREFIX=`(빈 값)
    로 지정한다. **단계별 절차: dev-server-coolify.md §5.5**.
  - **경로 B**: 전체 Supabase Self-hosted 스택(Coolify compose,
    docker-compose-spec.md) — Realtime·Storage 등 다른 기능까지 쓸 때.
    Kong 게이트웨이 경유라 접두사는 기본(`/auth/v1`) 그대로.
  - 공통 마무리: ① api 환경변수 `AUTH_MODE=supabase` +
    `SUPABASE_JWT_SECRET=<GoTrue JWT_SECRET>` ② frontend 빌드 변수
    `VITE_SUPABASE_URL`(GoTrue 주소)/`VITE_SUPABASE_ANON_KEY` ③ 재배포.
- **검증**: API 단위 8단언(무토큰/위조/만료/aud 401 · 유효 토큰 CRUD ·
  JIT 생성 · 사용자별 목록 분리) + 풀스택 e2e78 9단언(mock GoTrue 가
  실 HS256 JWT 발급 → 로그인 폼/오류/가입 즉시 로그인/저장/새로고침
  세션 유지/열기/로그아웃/계정 분리) ALL PASS. dev 모드 회귀
  e2e-cloud·e2e-cloud2 ALL PASS (기존 동작 불변).

## Phase 4c 이후 — 완료 항목 (2026-08-02 ~ 2026-08-04)

| 항목 | 내용 |
|---|---|
| **문서함(폴더)** | `map_folders` 테이블 + `/v1/folders` CRUD 4종. 맵에 `folder_id`/`kind`('solo'\|'collab') 추가, 같은 폴더 안 제목 중복은 API 검사(409). `GET /maps` 에 `folder/sort/order` 쿼리 |
| **B8 히스토리 버전** | `map_document_versions` 테이블(+`layout_type`/`node_count`/`attach_bytes`/`attach_count` 상세 컬럼). `PUT /maps/:id/document` 의 `keepVersion` 으로 명시적 저장·맵 닫기 때만 버전 적재(무변경 시 skip), `GET /maps/:id/versions`·`/versions/:version` 조회 |
| **B9 첨부/쿼터** | `attachments` 테이블 + `users.quota_bytes`(기본 1GB). `/v1/attachments` 업로드(multipart, 기본 200MB — `ATTACHMENT_MAX_MB`)·다운로드(`?access_token=` 폴백)·삭제·`/quota` 조회. 파일 원본은 `StorageService`(local 드라이버, `STORAGE_LOCAL_DIR`)에 저장. 쿼터 초과는 413 |
| **B9-2 청크 업로드** | 8MB 초과 파일용 `/v1/attachments/uploads` 5종(시작·조각 PUT·상태·완료·취소). 조각을 **스트림 그대로** 디스크에 흘려 서버 메모리가 파일 크기와 무관하다 — 상한 **1GB**(`ATTACHMENT_CHUNK_MAX_MB`). 조각 PUT 은 **멱등**, 쿼터는 시작 시점에 **사전 예약**, 미완성 세션은 24시간 뒤 GC. 완료 시에만 `attachments` INSERT (`attachment-storage.md` §12) |
| **편집 잠금(단일 세션)** | `map_edit_locks` 테이블. `GET /document?editSession=` 로 잠금 시도(`editLock: 'acquired'\|'busy'`), 저장 시 다른 세션 잠금이면 409, `POST /maps/:id/edit-heartbeat`(25초 주기, TTL 60초)·`edit-release` |

## 다음 단계

| Phase | 내용 |
|---|---|
| **3 활성화** | 서버에 GoTrue(또는 Supabase 스택) 배포 후 위 "활성화 절차" — 이후 RLS 실사용 |
| **4c 잔여** | 스냅샷↔정규화 노드 동기(협업 준비) — 첨부 오브젝트 스토리지는 B9 로컬 디스크 드라이버로 1차 해결(S3 호환 드라이버는 후속) |
| **5** | 배포 — ✅ 개발 서버(Ubuntu 22.04 + Coolify) 구축 완료(2026-08-01), 프로덕션은 동일 구성 복제. `../90-architecture/dev-server-coolify.md` 기준 |
| **기타** | B13(제목 유니크 인덱스 승격), 30일 휴지통 자동 정리 배치(미구현) |

관련: `backend-architecture.md`, `api-spec.md`, `../02-domain/schema.sql`,
`../90-architecture/ci-cd-github-actions.md`.
