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

## 다음 단계

| Phase | 내용 |
|---|---|
| **2** | 노드 CRUD + ltree 계층 이동(`move_node_subtree`), autosave(`PATCH /maps/:id/nodes`) |
| **3** | Supabase Auth(JWT 검증)로 인증 스텁 교체, RLS 실사용 |
| **4** | 스토리지(사진 별도 저장소), 프론트엔드 연결(로그인·클라우드 저장) |
| **5** | 배포(`deploy.yml`) — `ci-cd-github-actions.md` 순서대로 |

관련: `backend-architecture.md`, `api-spec.md`, `../02-domain/schema.sql`,
`../90-architecture/ci-cd-github-actions.md`.
