# easymindmap — 전체 시스템 아키텍처

> 문서 버전: v1.0  
> 기준: ESXi + Docker Compose 초기 배포 환경

---

## 1. 아키텍처 개요

easymindmap은 아래 6개 계층으로 설계합니다.

```
[Frontend SPA]
      ↓  HTTPS / WSS
[Edge Layer]          Nginx / TLS / Rate Limit
      ↓
[App Layer]           REST API + Auth
      ↓
[Realtime Layer]      WebSocket Gateway
      ↓
[Worker Layer]        AI / Translation / Export / Publish
      ↓
[Data Layer]          PostgreSQL + Redis + MinIO
```

---

## 2. 전체 시스템 구성도

```
사용자 브라우저
 ├── Editor SPA (React)
 ├── Viewer / Published Page
 └── WebSocket Client

         │ HTTPS / WSS
         ▼

Edge Layer
 ├── Nginx / Traefik
 ├── TLS termination
 ├── rate limit
 ├── static publish serving
 └── access logging

         ▼

App Layer
 ├── Frontend static hosting
 ├── Backend API (NestJS)
 ├── Auth / JWT
 ├── Map / Node / Tag / Media CRUD
 ├── Autosave patch ingest
 ├── Collaboration session API
 └── Export / AI / Translation job submit

         ▼

Realtime Layer
 ├── WebSocket Gateway
 ├── presence
 ├── cursor / selection sync
 ├── room broadcast
 └── future CRDT/Yjs adapter

         ▼

Worker Layer
 ├── AI generation worker
 ├── Translation worker (DeepL + LLM)
 ├── Export worker (Markdown / HTML)
 ├── Publish worker
 ├── Thumbnail worker
 └── Cleanup / reindex worker

         ▼

Data Layer
 ├── PostgreSQL 16   (primary store)
 ├── Redis 7         (cache / queue / presence)
 ├── MinIO / NAS     (file / export / publish storage)
 └── Backup Storage

         ▼

Ops Layer
 ├── monitoring (uptime / API error / queue depth)
 ├── logs (access / app / audit / AI / export)
 ├── alerts
 └── daily backup / restore
```

---

## 3. Frontend 아키텍처

### 3.1 기술 스택

```
React + TypeScript
Zustand             (상태관리)
React Query         (서버 상태 / API 호출)
React Router        (라우팅)
SVG 렌더링 + HTML Overlay 혼합
```

### 3.2 디렉토리 구조

```
src/
 ├── app/
 │   ├── router
 │   ├── providers
 │   └── boot
 ├── editor/
 │   ├── canvas
 │   ├── node-renderer
 │   ├── edge-renderer
 │   ├── layout-engine-adapter
 │   ├── command-dispatcher
 │   ├── inspector-panels
 │   ├── dialogs
 │   └── collaboration
 ├── stores/
 │   ├── documentStore       (맵 원본 데이터)
 │   ├── editorUiStore       (패널/모달/active tool)
 │   ├── viewportStore       (zoom/pan/bounds)
 │   ├── interactionStore    (drag/selection/editing draft)
 │   └── autosaveStore       (dirty/pending patches/save status)
 ├── services/
 │   ├── apiClient
 │   ├── websocketClient
 │   ├── exportClient
 │   ├── aiClient
 │   └── authClient
 ├── selectors/
 ├── commands/
 ├── history/
 ├── components/
 └── pages/
```

### 3.3 5-Store 구조 (핵심 원칙)

```
Document Store     = 실제 mindmap 원본 (노드 트리, 맵 메타)
Editor UI Store    = 패널 / 모달 / active tool 상태
Viewport Store     = zoom / pan / canvas bounds
Interaction Store  = drag / selection / 편집 중 draft
Autosave Store     = dirty flag / pending patches / save status
```

> ⚠️ 협업 / autosave / undo-redo / AI 삽입이 한 store에 섞이면 바로 깨짐.
> 반드시 5개 store 분리 유지.

### 3.4 렌더링 전략

| 대상 | 방식 |
|------|------|
| Edge / connector / selection box | SVG |
| Node 본문 / rich text / input | HTML Overlay |
| Popover / indicator / badge | HTML Overlay |
| 대형 맵 최적화 | Viewport culling |

### 3.5 편집 파이프라인

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
Autosave Store → debounce → API 저장
```

---

## 4. Backend 아키텍처

### 4.1 기술 스택

```
NestJS + TypeScript
REST API + JWT Auth
BullMQ (Queue)
WebSocket Gateway
```

### 4.2 모듈 구조

```
Backend
 ├── Auth Module
 ├── User / Workspace Module
 ├── Map Module
 ├── Node Module
 ├── Layout / Render Metadata Module
 ├── Tag Module
 ├── Media Module
 ├── Export Module
 ├── Publish Module
 ├── AI Module
 ├── Translation Module
 ├── Collaboration Module
 ├── Search Module
 ├── Audit / History Module
 └── Admin / Billing Ready Module
```

### 4.3 핵심 API

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

## 5. Database 아키텍처

### 5.1 메인 DB: PostgreSQL 16

- JSONB 활용 (revision patch, AI result, metadata)
- revision / audit / workspace / ACL 구조 설계에 강함
- 추후 full-text search (`pg_trgm`) 확장 용이

### 5.2 핵심 테이블 목록

```
users                  사용자
workspaces             워크스페이스
workspace_members      워크스페이스 멤버십

maps                   맵 메타 (view_mode, refresh_interval 포함)
map_revisions          서버 버전 히스토리

nodes                  노드 (node_type, text_lang, text_hash 포함)
node_order             형제 노드 순서
edges                  확장 연결선

tags                   태그
node_tags              노드-태그 관계
node_notes             노드 노트 (1:1)
node_links             노드 링크 (1:N)
node_attachments       노드 첨부파일 (1:N)
node_media             노드 배경이미지 (1:1)

exports                Export 작업 이력
published_maps         퍼블리시된 맵

ai_jobs                AI 작업 이력
translation_jobs       번역 작업 큐
node_translations      번역 캐시

presence_sessions      실시간 접속 세션
audit_logs             감사 로그
```

---

## 6. Redis 역할

Redis는 단순 캐시가 아닌 **실시간성과 비동기 작업의 중심**입니다.

```
1. autosave patch queue
2. WebSocket presence cache
3. AI job queue
4. Translation queue
5. Export queue
6. short-lived cache (번역 캐시 hot tier)
7. lock / debounce / coalescing
```

---

## 6a. Map Snapshot 캐시 전략

`GET /maps/:id/snapshot` API는 Dashboard 모드에서 빈번하게 호출됩니다. DB 직접 조회를 줄이기 위해 Redis 캐시를 적용합니다.

```
GET /maps/:id/snapshot 요청
        │
        ▼
Redis 캐시 조회 (key: snapshot:{mapId})
        │
   ┌────┴────┐
 Hit          Miss
   │          │
   ▼          ▼
즉시 반환     PostgreSQL 조회
              nodes WHERE map_id = :id
              → Redis 캐시 SET (TTL: refresh_interval × 0.8)
              → 응답 반환

노드 UPDATE 시:
  → Redis DEL snapshot:{mapId}  (즉시 무효화)
```

**캐시 TTL 전략:**
- `refresh_interval_seconds = 30` → TTL = 24초 (80%)
- 노드 변경 시 즉시 무효화 (cache-aside 패턴)

---

## 7. Object Storage (MinIO/NAS)

DB에 파일을 넣지 않고, 반드시 외부 저장소로 분리합니다.

권장 솔루션:
```
MinIO   (자체 호스팅 S3 호환, ESXi 환경에 적합)
또는
NAS mount + object-like 구조
```

### 버킷 구조

```
uploads/              사용자 업로드 원본
attachments/          노드 첨부파일
media/                노드 배경이미지
exports/              export 결과물
published/            퍼블리시 HTML
thumbnails/           맵 썸네일
preset-assets/        테마/프리셋 자산
```

### 경로 규칙

```
/workspaces/{workspaceId}/maps/{mapId}/exports/
/workspaces/{workspaceId}/maps/{mapId}/attachments/
/published/{publishId}/index.html
```

---

## 8. WebSocket / 협업 아키텍처

### Phase 1 (V1): Lightweight Realtime

```
presence
cursor
selected node
map changed notification
patch broadcast
```

### Phase 2 (V2+): Advanced Collaboration

```
optimistic merge
remote patch ordering
Yjs / CRDT adapter
```

### WebSocket 이벤트 목록

```
room:join / room:leave
presence:update
cursor:update
selection:update
map:patch
map:version
node:editing:start / node:editing:end
translation:ready
dashboard:refresh          (대시보드 맵 갱신 알림)
export:completed
publish:completed
```

> ⚠️ WebSocket 서버는 문서 원본 저장소가 되면 안 됨.
> 원본은 PostgreSQL + API가 진실. WS는 실시간 전달 계층.

---

## 9. AI 아키텍처

### AI 기능 목록

```
1. prompt → mindmap outline 생성
2. document (PDF/Markdown) → mindmap 변환
3. node expand (선택 노드 하위 자동 확장)
4. summary node (노드 내용 요약)
5. multilingual translation
6. tag suggestion
7. structure cleanup
```

### AI 처리 파이프라인

```
사용자 요청
    → API
    → ai_jobs enqueue
    → AI Worker 처리
    → outline / Markdown 생성
    → node tree 변환 (Markdown → Node Tree)
    → patch 생성
    → map 반영
    → WebSocket notify
```

### AI 서비스 내부 구조 (AI Gateway 포함)

```
AI Gateway (신규)
 ├── Model Router        (OpenAI / Claude / Local LLM 선택)
 ├── Token Manager       (모델별 토큰 사용량 추적 / 제한)
 └── Rate Limiter        (사용자/워크스페이스별 API 호출 제한)
         │
         ▼
AI Worker
 ├── Prompt Builder
 ├── Outline Parser
 ├── Node Tree Builder
 ├── Translation Engine (DeepL 1차 / LLM 2차)
 └── Safety / Validation
```

**AI Gateway 도입 이유:**
- 추후 Claude / Local LLM 등 멀티 모델 지원 시 교체 지점 명확화
- 모델별 비용/속도 트레이드오프에 따라 자동 라우팅
- 워크스페이스 플랜별 API 호출량 제한 (무료/유료 플랜 분기)

---

## 10. Layout Engine 아키텍처

### 엔진 구조

```
LayoutEngine
 ├── MeasureEngine          (노드 크기 계산)
 ├── StrategyResolver       (레이아웃 전략 선택)
 ├── RadialLayoutStrategy
 ├── TreeLayoutStrategy
 ├── HierarchyLayoutStrategy
 ├── ProcessLayoutStrategy
 ├── FreeformLayoutStrategy
 ├── CollisionResolver
 └── EdgeRouter
```

### 핵심 원칙

```
2-pass algorithm       (Measure Pass → Arrange Pass)
subtree 단위 계산
computedX / computedY  (레이아웃 계산값, 저장 안 함)
manualX / manualY      (사용자 지정 위치, DB 저장)
partial relayout       (변경 subtree만 재계산)
bounding box 기반 배치
```

### 지원 레이아웃 타입 (node.layout_type)

```
radial-bidirectional   방사형 양방향 (기본)
radial-right           방사형 오른쪽
radial-left            방사형 왼쪽
tree-up
tree-down
tree-right
tree-left
hierarchy-right
hierarchy-left
process-right
process-left
process-right-a
process-right-b
freeform               자유배치
```

### Edge 정책 (최종 확정)

```
radial-* 레이아웃  →  curve-line
그 외 레이아웃     →  tree-line
```

---

## 11. Autosave 아키텍처

### 기본 흐름

```
Document 변경
    → dirty = true
    → debounce (500ms~1500ms)
    → patch 생성
    → enqueue save
    → PATCH /maps/:id/document
    → version sync
    → dirty = false
```

### 저장 단위 (patch 기반)

```json
{
  "clientId": "cli_abc123",
  "patchId": "p_20260316_001",
  "baseVersion": 128,
  "timestamp": "2026-03-16T14:32:05.123Z",
  "patches": [
    { "op": "updateNodeText", "nodeId": "n1", "text": "AI 전략" },
    { "op": "moveNode", "nodeId": "n2", "parentId": "n5" }
  ]
}
```

> `clientId`: 동일 맵을 여러 탭/기기에서 열 때 충돌 식별  
> `patchId`: 중복 patch 제출 방지 (idempotency key)  
> `timestamp`: 충돌 발생 시 시간 기반 우선순위 결정

### 실패 처리

```
save failed
    → pending 유지
    → retry backoff (exponential)
    → UI warning 표시
    → manual retry 가능
```

---

## 12. Export / Publish 아키텍처

### Export 종류

```
Markdown export
Standalone HTML export    (오프라인 동작 가능)
Published HTML
PNG/SVG thumbnail
```

### Export 처리 흐름

```
사용자 요청
    → export_jobs enqueue
    → Export Worker 처리
    → MinIO 업로드
    → 결과 URL 반환
    → WebSocket notify
```

---

## 13. 보안 정책

```
HTTPS only
JWT (access 15m / refresh 30d) + HttpOnly cookie
Workspace ACL (owner / admin / member / viewer)
Admin MFA
Rate limit (API / WebSocket)
Upload mime/extension 검사 + 사이즈 제한
Signed URL (private asset 접근)
Published HTML sanitize (XSS 방지)
Audit log (보안 이벤트 기록)
```

---

## 14. 운영 아키텍처 (ESXi 기준)

### 1차 MVP 구성 (5VM)

```
VM-01  Edge
         Nginx / TLS / rate limit / publish HTML 서빙
         2 vCPU / 4 GB RAM / 40 GB SSD

VM-02  App
         Frontend static + NestJS API
         4 vCPU / 8~12 GB RAM / 100 GB SSD

VM-03  PostgreSQL
         DB + WAL + backup
         4 vCPU / 16 GB RAM / 200 GB+ SSD

VM-04  Redis / Queue
         Redis + BullMQ
         2 vCPU / 4~8 GB RAM / 60 GB SSD

VM-05  Worker
         AI / Translation / Export / Thumbnail worker
         4 vCPU / 8~16 GB RAM / 100 GB SSD
```

### 2차 확장 구성 (+2VM)

```
VM-06  WebSocket / Collaboration
         WS Gateway + presence + room state

VM-07  Object Storage
         MinIO / NAS
```

### 네트워크 구조

```
[Internet]
    ↓
[Edge VM]
    ↓
[App VLAN]
 ├── App VM
 ├── Worker VM
 ├── WebSocket VM
 └── Redis VM
    ↓
[DB VLAN]
 └── PostgreSQL VM
    ↓
[Storage VLAN]
 └── MinIO / NAS
```

> 원칙:
> - DB는 외부 직접 접근 금지
> - Redis는 App/Worker만 접근
> - Object Storage는 내부망 우선
> - 관리 포트는 VPN 또는 사내 IP 제한

---

## 15. 관측성 (Observability)

### 핵심 지표

```
API latency / error rate
autosave success / fail rate
WebSocket connections / room count
DB CPU / disk / replication lag
Redis memory / queue depth
AI job success / fail rate
Translation job queue depth
Export job duration
```

### 로그 종류

```
access log     (Nginx)
app log        (NestJS)
audit log      (보안 이벤트)
export log
AI log
translation log
```

---

## 16. 서비스 간 연결 흐름

### 편집 / Autosave

```
Frontend Editor
    → PATCH /maps/:id/document
    → PostgreSQL 저장
    → map_revisions 기록
    → Redis invalidate
    → WebSocket notify (협업 참가자)
```

### 협업

```
Client join
    → WS Gateway
    → presence_sessions 갱신
    → cursor / selection broadcast
```

### AI 생성

```
Client 요청
    → API
    → ai_jobs insert
    → Redis queue
    → AI Worker
    → node patch 생성
    → DB 반영
    → WS notify
```

### 번역

```
Node 편집 확정 (Enter/blur)
    → text_hash 계산
    → Redis cache 확인
    │
    ├── Hit: 즉시 표시
    │
    └── Miss: translation_jobs enqueue
              → Translation Worker (DeepL 1차 / LLM 2차)
              → node_translations 갱신
              → Redis cache 세팅
              → WS broadcast (translation:ready)
```

### Dashboard 자동 갱신

```
외부 시스템 / API가 nodes.text UPDATE
    │
    ├── [V3 MVP] Polling
    │       클라이언트 setInterval 주기 도래
    │       → GET /maps/:id/snapshot
    │       → 변경된 노드 diff → 화면 업데이트
    │
    └── [V3+]  Redis Pub/Sub → WebSocket Push
                Backend가 nodes UPDATE 시 Redis publish
                → WS Gateway subscribe
                → dashboard:refresh 이벤트 클라이언트 push
                → 변경된 노드만 즉시 업데이트
                → Polling 완전 제거 (트래픽 대폭 절감)
```

> **Polling → Push 전환 이유:**  
> 대시보드 사용자 1,000명 × 30초 갱신 = 2,000 req/min  
> Redis Pub/Sub 전환 시 변경 있을 때만 Push → 트래픽 90% 이상 절감

### Export / Publish

```
Export 요청
    → exports row 생성 (status: queued)
    → Redis queue
    → Export Worker
    → MinIO 저장
    → exports row 업데이트 (status: completed)
    → WS notify (export:completed)
```
