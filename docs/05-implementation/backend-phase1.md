# 백엔드 Phase 1 — 걷는 뼈대(맵 저장)

> 상태: 구현·검증 완료 (2026-07). 위치: `apps/api`.
> 다음 단계 로드맵은 문서 하단 참조.

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
- **Health** (`GET /v1/health`): DB 연결까지 확인.
- **Maps CRUD** (`maps/`): 아래 표. 응답은 `api-spec.md` 계약(camelCase).

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/v1/maps` | 생성 → `{mapId,title,currentVersion,createdAt}` |
| GET | `/v1/maps` | 목록(소유 기준, `?deleted=&page=&limit=`) |
| GET | `/v1/maps/:id` | 단건(+`nodes[]`, 현재 빈 배열) |
| PATCH | `/v1/maps/:id` | 메타 수정(title·viewMode·refreshIntervalSeconds·layout) |
| DELETE | `/v1/maps/:id` | 소프트 삭제(`deleted_at`), 204 |

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
  상태에서 편집이 멈추면 1.5s 디바운스 후 스냅샷을 자동 저장. 상태는
  상단 툴바 배지(`useAutosaveStore`: dirty→saving→saved/error)로 표시.
- **안전장치**: `cloudStore` 를 **세션 한정(비영속)** 으로 — cloudMapId 를
  새로고침 후에도 유지하면 인메모리 기본 문서가 서버 맵을 덮어써 유실될
  수 있어, 재접속은 명시적 "열기"로만. 열기(loadMap) 직후 1건은
  자동저장에서 제외(방금 불러온 문서 되쓰기 방지).
- **목록 관리**: 열기 모달의 각 맵에 **이름변경(✏, PATCH /maps/:id)**·
  **삭제(🗑, DELETE /maps/:id)**. 연결된 맵 삭제 시 링크 해제.

검증: 풀스택 E2E(e2e-cloud2) — 자동저장이 수동 저장 없이 서버에 반영·
이름변경 반영·삭제 후 목록 비움·JS 오류 0.

## 다음 단계

| Phase | 내용 |
|---|---|
| **3** | Supabase Auth(JWT 검증)로 인증 스텁 교체, RLS 실사용 |
| **4c** | 사진 별도 스토리지(object storage), 스냅샷↔정규화 노드 동기(협업 준비) |
| **5** | 배포 — **개발 서버(Ubuntu 22.04 + Coolify, 프로덕션 패리티)** 구축 후 프로덕션 복제. `../90-architecture/dev-server-coolify.md` 기준 (CI 품질 게이트는 GitHub Actions 유지) |

관련: `backend-architecture.md`, `api-spec.md`, `../02-domain/schema.sql`,
`../90-architecture/ci-cd-github-actions.md`.
