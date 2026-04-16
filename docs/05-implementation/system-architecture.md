# easymindmap — 전체 시스템 아키텍처

문서 버전: v1.2  
기준: **ESXi 7.0.3 + Docker Compose + Supabase Self-hosted**  
변경: 2026-03-27 — PostgreSQL/MinIO/Auth → Supabase Self-hosted 통합  
변경: 2026-04-16 — 협업 레이어 Supabase Realtime vs Redis Pub/Sub 역할 분리 명시, 번역 워커 레이어 추가, Redmine 연동 레이어 추가

---

## 1. 아키텍처 개요

easymindmap은 아래 6개 계층으로 설계합니다.

```
[Frontend SPA]
      ↓  HTTPS / WSS
[Edge Layer]          Nginx / TLS / Rate Limit                   (VM-01)
      ↓
[App Layer]           REST API + Auth                             (VM-02)
      ↓
[Realtime Layer]      WebSocket Gateway + Redis Pub/Sub           (VM-02, V1~)
      │               Supabase Realtime: Presence / Cursor
      │               Redis Pub/Sub: Map patch / Soft Lock / 번역 완료
      ↓
[Worker Layer]        AI / Translation(BullMQ) / Export / Redmine (VM-05)
      ↓
[Data Layer]          Supabase Self-hosted + Redis                (VM-03 + VM-04)
```

### 협업 실시간 통신 역할 분리

| 채널 | 담당 | 주 용도 |
|------|------|---------|
| **Supabase Realtime** | Presence / Cursor / Selection | 일시적 UI 상태 — DB 저장 불필요 |
| **Redis Pub/Sub** | Map patch broadcast / Soft Lock / Translation Ready / Dashboard refresh | 문서 무결성 보장 — API 서버 경유 필수 |

> 상세: `docs/04-extensions/collaboration/25-map-collaboration.md` §14

---

## 2. VM 구성 (최종 5대)

```
VM-01  Edge       Nginx, TLS, Reverse Proxy, Rate Limit, Static Publish
VM-02  App        Frontend(React) + Backend API(NestJS) + WS Gateway
VM-03  Supabase   PostgreSQL 16 + Auth + Storage + Realtime (Docker Compose)
VM-04  Redis      Redis 7 (Cache, BullMQ Queue, Presence)
VM-05  Worker     AI / Export / Translation Workers
```

### 기존 vs 변경 VM 비교

| VM | 기존 | 변경 후 |
|----|------|---------|
| VM-01 | Nginx | Nginx (동일) |
| VM-02 | Frontend + NestJS | Frontend + NestJS (동일) |
| VM-03 | **PostgreSQL 직접** | **Supabase All-in-One** |
| VM-04 | Redis | Redis (동일) |
| VM-05 | Workers | Workers (동일) |
| ~~VM-06~~ | ~~WS Gateway~~ | VM-02에 통합 |
| ~~VM-07~~ | ~~MinIO~~ | **Supabase Storage로 대체** |

---

## 3. 전체 시스템 구성도

```
사용자 브라우저
 ├── Editor SPA (React)
 ├── Viewer / Published Page
 └── WebSocket Client

         │ HTTPS / WSS
         ▼

VM-01: Edge Layer
 ├── Nginx
 ├── TLS termination (Let's Encrypt)
 ├── Rate limiting
 ├── Static published page serving (/published)
 └── Reverse Proxy → VM-02(App), VM-03(Supabase Studio)

         ▼

VM-02: App Layer
 ├── Frontend static hosting (React build)
 ├── Backend API (NestJS)
 │   ├── Auth Guard (Supabase JWT 검증)
 │   ├── Map / Node / Tag / Media CRUD
 │   ├── Autosave patch ingest
 │   ├── Collaboration session API (초대/탈퇴/scope/소유권 이양)
 │   ├── Dashboard API (view-mode/refresh-interval/external data update)
 │   ├── Redmine 연동 API (connect/sync/status/logs)
 │   └── Export / AI / Translation job submit
 └── WebSocket Gateway (V1~)
     ├── presence (Supabase Realtime 경유)
     ├── cursor / selection sync (Supabase Realtime 경유)
     ├── map patch broadcast (Redis Pub/Sub 경유)
     ├── soft lock 이벤트 (Redis Pub/Sub 경유)
     └── translation:ready / dashboard:refresh (Redis Pub/Sub 경유)

         ↓ BullMQ via Redis

VM-05: Worker Layer
 ├── worker-ai           AI generation / expand (BullMQ, solo-only 정책)
 ├── worker-translation  DeepL + LLM fallback (V2~, BullMQ 'translation' 큐)
 │   └── 완료 시 Redis PUBLISH → WS Gateway → 클라이언트 translation:ready 이벤트
 ├── worker-export       Markdown / HTML export (BullMQ 'export' 큐)
 ├── worker-core         Cleanup / reindex
 ├── worker-publish      Publish to Supabase Storage
 └── worker-redmine      Redmine Issue 동기화 (BullMQ, Exponential Backoff 재시도 3회)
                         └── sync_status: pending → synced/error/failed

         ↓

VM-03: Supabase (Data Layer — PostgreSQL 16)
 ├── PostgreSQL 16       primary store (nodes, maps, revisions...)
 ├── Supabase Auth       JWT 발급 / 검증 / 회원가입
 ├── Supabase Storage    파일 / export / publish 저장
 │   └── 버킷: uploads / attachments / exports / published / media
 ├── Supabase Realtime   V1 협업 기반 (Presence / Cursor / Selection 채널)
 ├── Supabase Kong       API Gateway (내부)
 └── Supabase Studio     관리 대시보드

VM-04: Redis
 ├── BullMQ Queue        (AI / Export / Translation / Redmine 작업 큐)
 ├── Cache               (Snapshot 캐시, 번역 캐시 Sliding TTL, 채팅 번역 캐시 24h)
 ├── Pub/Sub             (map:{mapId}, dashboard:{mapId} 채널 — V1~)
 └── Soft Lock           (lock:node:{nodeId}, TTL 5초 — 협업 Soft Lock)
```

---

## 4. Frontend 아키텍처

### 4.1 기술 스택

```
React + TypeScript
Zustand             상태관리 (5-Store)
React Query         서버 상태 / API 호출
React Router        라우팅
Supabase JS Client  Auth / Realtime 클라이언트
SVG + HTML Overlay  렌더링 (Edge=SVG, Node=HTML)
```

### 4.2 디렉토리 구조

```
src/
 ├── app/
 │   ├── router/
 │   ├── providers/        # QueryClient, SupabaseProvider, AuthProvider
 │   └── boot/             # 토큰 복원, locale 설정
 ├── editor/
 │   ├── canvas/           # SVG viewport, pan/zoom
 │   ├── node-renderer/    # 노드 SVG + HTML Overlay
 │   ├── edge-renderer/    # curve-line / tree-line
 │   ├── layout-engine-adapter/
 │   ├── command-dispatcher/
 │   ├── inspector-panels/
 │   ├── dialogs/
 │   └── collaboration/    # presence, cursor (V1~)
 ├── stores/
 │   ├── documentStore.ts           # [핵심] mindmap 원본 (DB 저장 대상)
 │   ├── editorUiStore.ts           # UI 상태
 │   ├── viewportStore.ts           # zoom/pan
 │   ├── interactionStore.ts        # drag/selection/draft
 │   ├── autosaveStore.ts           # dirty flag/save status
 │   ├── collabStore.ts             # [V3.3] Presence/SoftLock/Permission
 │   └── translationStore.ts        # [V2] 번역 캐시
 ├── commands/
 ├── history/
 ├── layout/
 │   └── strategies/
 │       ├── RadialStrategy.ts
 │       ├── TreeStrategy.ts
 │       ├── HierarchyStrategy.ts
 │       ├── ProcessStrategy.ts
 │       └── FreeformStrategy.ts
 ├── services/
 │   ├── apiClient.ts
 │   ├── supabaseClient.ts  # Supabase JS Client (Anon Key)
 │   ├── websocketClient.ts
 │   └── authClient.ts      # Supabase Auth 래핑
 └── pages/
     ├── LoginPage.tsx
     ├── DashboardPage.tsx
     ├── EditorPage.tsx
     └── PublishedPage.tsx
```

### 4.3 Store 구조 (핵심 원칙)

```
[핵심 5-Store]
Document Store     = 실제 mindmap 원본 (노드 트리, 맵 메타) — DB 저장 유일 대상
Editor UI Store    = 패널 / 모달 / active tool 상태
Viewport Store     = zoom / pan / canvas bounds
Interaction Store  = drag / selection / 편집 중 draft
Autosave Store     = dirty flag / pending patches / save status

[기능 확장 Store]
collabStore        = Presence / Soft Lock / 협업자 목록 / 내 권한 캐시 (V3.3~)
translationStore   = 번역 캐시 / pending nodeId 목록 / 열람자 언어 (V2~)
```

> ⚠️ 협업 / autosave / undo-redo / AI 삽입이 한 store에 섞이면 바로 깨짐.  
> 핵심 5개 store 분리 유지 필수. 기능 확장 store는 핵심 store에 병합 금지.  
> 상세: `docs/03-editor-core/state-architecture.md`

### 4.4 렌더링 전략

| 대상 | 방식 |
|------|------|
| Edge / connector / selection box | SVG |
| Node 본문 / rich text / input | HTML Overlay |
| Popover / indicator / badge | HTML Overlay |
| 대형 맵 최적화 | Viewport culling |

### 4.5 편집 파이프라인

```
사용자 입력
    │
    ▼
Command 생성
    │
    ▼
Reducer → Document Store 업데이트
    │
    ▼
Layout Engine (Derived 계산)
    │
    ▼
SVG/HTML 렌더링
    │
    ▼
Autosave Store → debounce → PATCH /maps/:id/document
```

---

## 5. Backend 아키텍처

### 5.1 기술 스택

```
NestJS + TypeScript
Supabase JS Client (Service Key)   DB / Auth / Storage 접근
BullMQ + Redis                     작업 큐
WebSocket Gateway (V1~)
```

### 5.2 모듈 구조

```
Backend (NestJS)
 ├── Auth Module          (Supabase Auth 래핑 + JWT Guard)
 ├── User / Workspace Module
 ├── Map Module
 ├── Node Module
 ├── Autosave Module      (patch ingest, clientId/patchId 멱등성)
 ├── Snapshot Module      (Dashboard 경량 API, Redis 캐시)
 ├── Tag Module
 ├── Media Module         (Supabase Storage 연동)
 ├── Export Module        (BullMQ 'export' 큐)
 ├── Publish Module       (Supabase Storage HTML 업로드)
 ├── AI Module            (BullMQ, solo-only 정책)
 ├── Translation Module   (V2~, DeepL + LLM fallback, BullMQ 'translation' 큐)
 ├── Collaboration Module (V1~, 초대/scope/Soft Lock/소유권 이양)
 ├── Dashboard Module     (V3~, view-mode/refresh-interval/외부 API update)
 ├── Redmine Module       (V1 WBS~, BullMQ 'redmine' 큐, AES-256-GCM)
 ├── Search Module
 ├── Revisions Module
 └── Audit Module
```

> 상세 모듈별 파일 구조: `docs/05-implementation/backend-architecture.md`

### 5.3 핵심 API

```
POST   /auth/signup
POST   /auth/login
POST   /auth/refresh

GET    /maps
POST   /maps
GET    /maps/:id
DELETE /maps/:id
PATCH  /maps/:id/document          (autosave patch)
GET    /maps/:id/snapshot          (dashboard refresh용 경량 API)

POST   /nodes
PATCH  /nodes/:id
DELETE /nodes/:id
PATCH  /nodes/:id/move

POST   /maps/:id/export/markdown
POST   /maps/:id/export/html
POST   /maps/:id/publish

POST   /ai/generate
POST   /ai/expand/:nodeId
```

---

## 6. Data Layer — Supabase

### 6.1 Supabase가 제공하는 것

| 기능 | 설명 | 대체 |
|------|------|------|
| PostgreSQL 16 | 메인 DB | VM-03 직접 설치 대체 |
| Supabase Auth | 회원가입/로그인/JWT | NestJS JWT 구현 대체 |
| Supabase Storage | 파일 저장 (S3 호환) | MinIO VM-07 대체 |
| Supabase Realtime | DB 변경 이벤트 구독 | V1 협업 기반 |
| Row Level Security | 사용자별 데이터 격리 | 직접 구현 대체 |

### 6.2 핵심 테이블 목록

```
users                  사용자 (auth.users 연동, ui_preferences_json 포함)
workspaces             워크스페이스
workspace_members      멤버십

maps                   맵 메타 (view_mode, refresh_interval, translation_policy_json,
                              is_collaborative, collab_owner_id 포함)
                       -- view_mode: 'edit' | 'dashboard' | 'kanban' | 'wbs'
                       -- refresh_interval_seconds: 0(off)/10/30/60/300/600
map_revisions          서버 버전 히스토리 (patch_id UNIQUE — 멱등성 보장)
map_collaborators      협업자 (role: creator/editor, scope_type: full/level/node,
                              scope_level, scope_node_id, status: pending/active/rejected/removed)
map_ownership_history  소유권 이양 이력 (V3.3~)

nodes                  노드 (node_type, text_lang, text_hash,
                              translation_mode, translation_override,
                              redmine_issue_id, sync_status, created_by 포함)
-- ※ node_order 컬럼 없음: 순서는 nodes.order_index FLOAT 컬럼으로 관리 (db-schema.md §2.5)
-- ※ edges 테이블 없음: 연결선은 nodes.parent_id + path(ltree) 관계로 표현
-- ※ childIds 필드는 DB 저장 안 함 — 로딩 시 parent_id 역전으로 런타임 구성 (state-architecture.md §5.1.3-A)

tags                   태그 (workspace_id 포함 — workspace 공유 태그 지원)
node_tags              노드-태그 관계
node_notes             노드 노트 (1:1, 물리 저장 테이블 — nodes.note 컬럼 없음)
node_links             하이퍼링크 (1:N)
node_attachments       첨부파일 (1:N)
node_media             오디오/비디오 미디어 (1:1, ※ 배경이미지 ≠ node_media)
                       -- 배경이미지는 nodes.background_image_path 컬럼에 저장 (V3.2~)
                       -- node_media.media_type: 'audio' | 'video' 만 허용

node_schedule          WBS 일정 (1:1, start_date/end_date/progress/is_milestone)
node_resources         리소스 할당 (1:N, WBS·Kanban 공통, Redmine 사용자 지원)

exports                Export 작업 이력
published_maps         퍼블리시된 맵

ai_jobs                AI 작업 이력 (job_type: generate/expand/summarize)
-- ※ translation_jobs 테이블 없음: 번역은 BullMQ worker 큐로 처리 (worker-translation)
node_translations      번역 캐시 (V2~, node_id + target_lang UNIQUE)
                       -- Redis Sliding TTL(2h base ±10min jitter) + PostgreSQL 영구 캐시 병행
chat_messages          협업 채팅 메시지 (node_id IS NULL: map-room, NOT NULL: node thread)
chat_message_translations 채팅 메시지 번역 캐시 (언어별 1건, V2~, Redis 24h TTL)
node_thread_ai_previews   AI Thread 요약/태스크 추출 Preview 저장 (approval_state 포함)

redmine_project_maps   맵 ↔ Redmine 프로젝트 연결 설정 (API Key AES-256-GCM 암호화)
                       -- sync_direction: pull_only/push_only/bidirectional
redmine_sync_log       Redmine 동기화 이력 (direction/action/status/http_status)

field_registry         대시보드 편집 가능 필드 메타 (V3~, entity_type/field_key/table_name 포함)
```

> 상세 DDL 및 인덱스: `docs/02-domain/db-schema.md`  
> 도메인 타입 정의: `docs/02-domain/domain-models.md`

---

## 7. Ops Layer

```
모니터링: Uptime / API 오류율 / Redis 큐 깊이
로깅:     access / app / audit / AI / export
알림:     Slack 또는 이메일
백업:
  - Supabase DB: pg_dump 매일 (Supabase CLI)
  - Redis: AOF 자동 + 정기 복사
  - Supabase Storage: 버킷 sync → NAS
  - ESXi VM 전체: 주간 스냅샷
```
