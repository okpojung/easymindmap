# easymindmap — 전체 시스템 아키텍처

문서 버전: v1.1  
기준: **ESXi 7.0.3 + Docker Compose + Supabase Self-hosted**  
변경: 2026-03-27 — PostgreSQL/MinIO/Auth → Supabase Self-hosted 통합

---

## 1. 아키텍처 개요

easymindmap은 아래 6개 계층으로 설계합니다.

```
[Frontend SPA]
      ↓  HTTPS / WSS
[Edge Layer]          Nginx / TLS / Rate Limit          (VM-01)
      ↓
[App Layer]           REST API + Auth                    (VM-02)
      ↓
[Realtime Layer]      WebSocket Gateway                  (VM-02, V1~)
      ↓
[Worker Layer]        AI / Translation / Export          (VM-05)
      ↓
[Data Layer]          Supabase + Redis                   (VM-03 + VM-04)
```

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
 │   ├── Collaboration session API
 │   └── Export / AI / Translation job submit
 └── WebSocket Gateway (V1~)
     ├── presence
     ├── cursor / selection sync
     └── room broadcast

         ↓ BullMQ via Redis

VM-05: Worker Layer
 ├── worker-ai           AI generation / expand
 ├── worker-translation  DeepL + LLM fallback (V2~)
 ├── worker-export       Markdown / HTML export
 ├── worker-core         Cleanup / reindex
 └── worker-publish      Publish to Supabase Storage

         ↓

VM-03: Supabase (Data Layer — PostgreSQL 16)
 ├── PostgreSQL 16       primary store (nodes, maps, revisions...)
 ├── Supabase Auth       JWT 발급 / 검증 / 회원가입
 ├── Supabase Storage    파일 / export / publish 저장
 ├── Supabase Realtime   V1 협업 기반 (채널 구독)
 ├── Supabase Kong       API Gateway (내부)
 └── Supabase Studio     관리 대시보드

VM-04: Redis
 ├── BullMQ Queue        (AI / Export / Translation 작업 큐)
 ├── Cache               (Snapshot, Translation 캐시)
 └── Presence            (WebSocket presence, V1~)
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
 │   ├── documentStore.ts
 │   ├── editorUiStore.ts
 │   ├── viewportStore.ts
 │   ├── interactionStore.ts
 │   └── autosaveStore.ts
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

### 4.3 5-Store 구조 (핵심 원칙)

```
Document Store     = 실제 mindmap 원본 (노드 트리, 맵 메타)
Editor UI Store    = 패널 / 모달 / active tool 상태
Viewport Store     = zoom / pan / canvas bounds
Interaction Store  = drag / selection / 편집 중 draft
Autosave Store     = dirty flag / pending patches / save status
```

> ⚠️ 협업 / autosave / undo-redo / AI 삽입이 한 store에 섞이면 바로 깨짐.  
> 반드시 5개 store 분리 유지.

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
 ├── Autosave Module      (patch ingest)
 ├── Snapshot Module      (Dashboard 경량 API)
 ├── Tag Module
 ├── Media Module         (Supabase Storage 연동)
 ├── Export Module
 ├── Publish Module       (Supabase Storage 업로드)
 ├── AI Module
 ├── Translation Module   (V2~)
 ├── Collaboration Module (V1~)
 ├── Search Module
 ├── Revisions Module
 └── Audit Module
```

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
users                  사용자 (auth.users 연동)
workspaces             워크스페이스
workspace_members      멤버십

maps                   맵 메타 (view_mode, refresh_interval 포함)
map_revisions          서버 버전 히스토리

nodes                  노드 (node_type, text_lang, text_hash 포함)
node_order             형제 노드 순서
edges                  확장 연결선

tags                   태그
node_tags              노드-태그 관계
node_notes             노드 노트
node_links             하이퍼링크
node_attachments       첨부파일
node_media             배경이미지

exports                Export 작업 이력
published_maps         퍼블리시된 맵

ai_jobs                AI 작업 이력
translation_jobs       번역 작업 큐 (V2~)
node_translations      번역 캐시 (V2~)

field_registry         대시보드 편집 가능 필드 메타 (V3~)
```

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
