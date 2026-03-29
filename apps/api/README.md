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
| 인증 | Supabase Auth (JWT 검증: `supabase.auth.getUser()`) |

---

## 개발 환경 실행

```bash
# 1. 의존성 설치
npm install

# 2. Supabase 로컬 실행 (개발용)
npx supabase start
# API: http://localhost:54321
# Studio: http://localhost:54323

# 3. DB 초기화
npx supabase db push
# 또는 직접 실행:
# psql $DATABASE_URL -f database/schema.sql
# psql $DATABASE_URL -f database/functions/move_node_subtree.sql

# 4. 개발 서버 시작 (hot reload)
npm run start:dev
```

---

## 환경변수

```bash
SUPABASE_URL=https://supabase.mindmap.ai.kr
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # 서버 전용, 절대 클라이언트 노출 금지

REDIS_HOST=VM-04-IP
REDIS_PORT=6379
REDIS_PASSWORD=...

AI_PROVIDER=openai
AI_API_KEY=...
AI_MODEL_GENERATE=gpt-4o
```

전체 환경변수: `docs/05-implementation/env-spec.md` 참조

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
