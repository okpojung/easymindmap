# apps/api — easymindmap Backend

> NestJS + TypeScript + Supabase Self-hosted + Redis + BullMQ

---

## 디렉토리 구조

```
apps/api/
├── database/
│   ├── schema.sql              ← DB 초기화 스크립트 (설계 문서 기준)
│   └── functions/
│       └── move_node_subtree.sql  ← ltree 기반 노드 이동 PostgreSQL 함수
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── supabase/               ← Supabase Client 싱글톤
│   ├── auth/                   ← Supabase Auth 래핑
│   ├── modules/
│   │   ├── node/               ← 노드 CRUD + 계층 이동
│   │   ├── maps/               ← 맵 CRUD + 메타
│   │   ├── autosave/           ← Patch 기반 자동 저장
│   │   └── ...
│   └── common/
└── package.json
```

---

## 핵심 설계 결정

| 항목 | 결정 |
|------|------|
| 계층 저장 | Flat (parent_id) + ltree path |
| subtree 조회 | `path <@ $ancestor` (GIST 인덱스) |
| 노드 이동 | `move_node_subtree` PostgreSQL 함수 (단일 트랜잭션) |
| order_index | FLOAT (중간 삽입 O(1)) |
| 좌표 | `manual_position JSONB` (freeform 전용, DB 저장) |
| computedX/Y | 클라이언트 Layout Engine 계산, DB 미저장 |
| 노드 삭제 | hard-delete + ON DELETE CASCADE |
| 맵 삭제 | soft-delete (deleted_at) + 30일 후 배치 삭제 |
| 인증 | Supabase Auth(GoTrue) 발급 JWT 를 **로컬 검증**(HS256, `SUPABASE_JWT_SECRET`) — `common/auth/auth.guard.ts` |
| 모듈 형식 | **CommonJS** (`tsconfig module=commonjs`, package.json 에 `type` 없음) |

### ⚠️ 의존성 규칙 — ESM 전용 패키지 금지 (2026-08-01 배포 실패로 확정)

이 앱은 **CommonJS 로 빌드**된다. ESM 전용 패키지(예: `jose` v5+)를
top-level `import` 하면 TS 가 `require()` 로 컴파일하고, **낮은 Node
런타임에서 `ERR_REQUIRE_ESM` 으로 기동 즉시 죽는다**. 빌드는 성공하기
때문에 배포 단계에서야 드러난다.

| 하지 말 것 | 대신 |
|---|---|
| `import { jwtVerify } from 'jose'` (ESM 전용) | `import * as jwt from 'jsonwebtoken'` (CJS 네이티브) |

- 이 사고에서 채택한 수정: **jose 제거 → `jsonwebtoken@9`**.
  (동적 `await import()` 는 TS 가 commonjs 타겟에서 `require` 로
  다운레벨링해 같은 문제가 재발할 수 있어 채택하지 않았다.)
- 개발 환경 Node 22.12+ 는 `require(ESM)` 을 **기본 허용**하므로 로컬
  에서는 재현되지 않는다. 재현하려면:
  ```bash
  npm run build && node --no-experimental-require-module dist/main.js
  ```
- CI 가 `AUTH_MODE=supabase` **부팅 스모크**로 상시 검증한다
  (`.github/workflows/ci.yml` — 빌드 성공만으로는 이 문제가 잡히지
  않기 때문에 추가됨).

---

## 개발 환경 실행 (Phase 1 — 걷는 뼈대)

현재 단계는 **NestJS + 순정 PostgreSQL**로 실행되는 걷는 뼈대다.
인증은 개발 스텁(`AUTH_MODE=dev`), 맵 CRUD가 동작한다. Supabase Auth/
Storage·Redis 는 다음 단계에서 얹는다.

```bash
# 1. 의존성 설치
npm install

# 2. 개발용 DB 기동 (Postgres 16 + ltree, ltree shim·schema 자동 로드)
docker compose -f docker-compose.dev.yml up -d
#   접속: postgres://emm:emm@localhost:5432/easymindmap
#   (도커가 없으면 로컬 postgres 에 database/dev/*.sql 와 schema.sql 을
#    순서대로 psql 로 직접 로드해도 된다)

# 3. 환경변수
cp .env.example .env      # 기본값이면 그대로 사용 가능

# 4. 개발 서버 시작 (hot reload)
npm run start:dev
#   → http://localhost:3000/v1

# 5. (선택) 스모크 테스트 — 맵 CRUD 왕복
npm run smoke             # 기본 API_URL=http://localhost:3000
```

> **DB 초기화 순서**(docker-compose.dev.yml 이 자동 처리):
> `dev/00-supabase-shim.sql` → `schema.sql` → `functions/move_node_subtree.sql`
> → `dev/01-seed-dev-user.sql`.
> shim 은 순정 Postgres에서 Supabase 전용 객체(`auth.users`·`auth.uid()`·
> realtime 퍼블리케이션)를 흉내 내 실제 `schema.sql` 을 그대로 로드하기 위한
> **로컬 전용** 파일이다. 실제 Supabase Self-hosted 배포에는 쓰지 않는다.

### 엔드포인트

**맵 (Phase 1)**

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/v1/health` | 헬스체크(DB 연결 포함) |
| POST | `/v1/maps` | 맵 생성 |
| GET | `/v1/maps` | 내 맵 목록(`?deleted=&page=&limit=`) |
| GET | `/v1/maps/:id` | 맵 단건(+노드 트리) |
| PATCH | `/v1/maps/:id` | 메타 수정(title·viewMode·refreshIntervalSeconds·layout) |
| DELETE | `/v1/maps/:id` | 소프트 삭제(204) |
| PUT | `/v1/maps/:id/document` | **전체 문서 스냅샷 저장**(임베드 이미지·노트 포함, upsert) |
| GET | `/v1/maps/:id/document` | 저장된 문서 스냅샷 조회 |

**노드 · autosave (Phase 2)**

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/v1/maps/:mapId/nodes` | 노드 생성(parentId 없으면 루트, ltree path 자동) |
| PATCH | `/v1/maps/:mapId/nodes` | autosave — 배치 patch(add/update/delete/move) + 버전·멱등성 |
| PATCH | `/v1/nodes/:id` | 노드 속성 수정(text·style·collapsed·shape·layout·manualPosition) |
| DELETE | `/v1/nodes/:id` | 노드 삭제(subtree cascade, 204) |
| PATCH | `/v1/nodes/:id/move` | 노드 이동(`move_node_subtree` — 부모 변경 + subtree path 재작성) |
| PATCH | `/v1/nodes/:id/layout` | 노드 레이아웃 변경(Edge 타입은 클라이언트 자동 결정) |

> autosave 규칙: `baseVersion` 이 서버 `currentVersion` 과 다르면 `409
> VERSION_CONFLICT`, 동일 `patchId` 재수신은 `409 DUPLICATE_PATCH`(멱등),
> 성공 시 `{ newVersion, conflicts:[] }`. 직접 노드 엔드포인트(POST/PATCH/
> DELETE `/nodes`)는 버전을 올리지 않는다(autosave 가 버전 경로).

---

## 환경변수

**Phase 1 (현재) — 전체 예시는 `.env.example`:**

```bash
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgres://emm:emm@localhost:5432/easymindmap
AUTH_MODE=dev                        # dev | supabase(다음 단계)
DEV_USER_ID=00000000-0000-0000-0000-000000000001
```

**다음 단계에서 추가 (Supabase/Redis/AI):**

```bash
SUPABASE_URL=https://supabase.example.com
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 서버 전용, 절대 클라이언트 노출 금지
REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=...
AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL_GENERATE=gpt-4o
```

전체 환경변수: `docs/05-implementation/env-spec.md` 참조.
⚠️ 실제 값은 `.env`(gitignore)와 배포 Secrets 에만 둔다.

---

## 관련 설계 문서

| 주제 | 문서 |
|------|------|
| 백엔드 아키텍처 | `docs/05-implementation/backend-architecture.md` |
| DB 스키마 (설계 기준) | `docs/02-domain/schema.sql` |
| 노드 계층 저장 전략 | `docs/02-domain/node-hierarchy-storage-strategy.md` |
| API 명세 | `docs/05-implementation/api-spec.md` |
| Autosave 엔진 | `docs/03-editor-core/autosave-engine.md` |
| 상태 아키텍처 | `docs/03-editor-core/state-architecture.md` |
