# easymindmap — Codex Task Plan (AI 개발 작업 분해)

> AI(Claude/Codex)에게 개발을 지시할 때 사용하는 작업 단위 목록.  
> 각 Task는 독립적으로 실행 가능하고 검증 가능한 단위로 쪼개야 한다.

---

## 원칙

- Task 하나당 AI 호출 1~3회 이내로 완결 가능한 크기
- 각 Task에 **입력 문서**, **결과물**, **검증 방법** 명시
- PRD / API Spec 변경 시 해당 Task 재실행

---

## 로드맵 단계 요약

```
MVP   ── 편집기 코어 / Kanban / 자동저장 / AI 생성 / Export / Publish   [T-01~T-20]
V1    ── 협업 / WBS / Redmine 연동 / Obsidian 연동 / 버전 히스토리       [T-21~T-40]
V1.5  ── AI 실행형 절차 (AI Executable Workflow)                        [T-41~T-45]
V2    ── 다국어 번역 / 실시간 채팅 / 채팅 번역                            [T-46~T-55]
V3    ── Node Thread / AI 협업 요약 / 대시보드 맵                        [T-56~T-65]
```

> 로드맵 전체 기준: `docs/00-project-overview/roadmap.md`  
> 도메인 타입 기준: `docs/02-domain/domain-models.md`  
> DB 스키마 기준: `docs/02-domain/db-schema.md`

---

## Phase 1 — MVP

### [T-01] 프로젝트 초기 세팅

**입력 문서**: `05-implementation/frontend-architecture.md`, `backend-architecture.md`

**작업 지시 예시**:
```
React + TypeScript + Vite 기반 프론트엔드 프로젝트를 세팅해줘.
Zustand, shadcn/ui, react-router-dom 포함.
src/ 구조는 frontend-architecture.md의 디렉토리 구조 그대로 생성.
```

**결과물**: 실행 가능한 기본 프로젝트 구조

---

### [T-02] NestJS 백엔드 초기 세팅

**입력 문서**: `backend-architecture.md`, `api-spec.md`

**작업 지시 예시**:
```
NestJS + TypeScript 백엔드를 세팅해줘.
모듈: auth, users, maps, nodes, export, ai, publish.
PostgreSQL 연결 (TypeORM), JWT 인증 기본 구조 포함.
```

---

### [T-03] DB 마이그레이션 생성

**입력 문서**: `02-domain/db-schema.md`, `02-domain/domain-models.md`, `05-implementation/backend-architecture.md`

**작업 지시 예시**:
```
db-schema.md의 DDL 기준으로 Supabase PostgreSQL 마이그레이션 SQL을 생성해줘.
테이블 (schema.sql 기준 전체 목록 — db-schema.md §3~§14 기준):
  핵심: users, workspaces, workspace_members, maps, nodes
  노드 관계: node_notes, node_links, node_attachments, node_media, node_tags, node_translations
  맵 관련: map_revisions, published_maps, exports, field_registry
  AI/작업: ai_jobs, tags
  WBS/Redmine: node_schedule, node_resources, redmine_project_maps, redmine_sync_log
  협업: map_collaborators, map_ownership_history
  채팅: chat_messages, chat_message_translations, node_thread_ai_previews
RLS 정책도 함께 생성 (db-schema.md §RLS 섹션 참조)
```

**주의**: `nodes.note` 컬럼 없음 — `node_notes` 별도 테이블로 분리 (db-schema.md §3-1)  
`nodes.style_json` (JSONB), `nodes.size_cache` (JSONB), `nodes.manual_position` (JSONB) 컬럼명 확인

---

### [T-04] 인증 API 구현

**입력 문서**: `api-spec.md` (Auth 섹션)

**작업 지시 예시**:
```
api-spec.md의 Auth 섹션 기준으로 다음을 구현해줘:
- POST /auth/signup
- POST /auth/login
- POST /auth/refresh
JWT access token (1h) + refresh token (7d) 방식.
-- ※ api-spec.md §0.1 기준: Access Token 1시간, Refresh Token 7일
```

---

### [T-05] Map CRUD API 구현

**입력 문서**: `api-spec.md` (Maps 섹션)

---

### [T-06] Node CRUD API 구현

**입력 문서**: `05-implementation/api-spec.md` (Nodes 섹션), `02-domain/domain-models.md` (NodeObject 타입)

**주의**: `NodeObject` 타입은 `domain-models.md §5` 기준.  
`nodes.style_json` → `NodeStyle`, `nodes.manual_position` → `{ x, y } | null`, `nodes.size_cache` → `{ width, height } | null` 매핑 필수.  
`note` 필드는 `node_notes` 테이블을 통해 JOIN하여 응답 조립.

---

### [T-07] Zustand Store 5개 구현

**입력 문서**: `frontend-architecture.md` (State Management 섹션)

**작업 지시 예시**:
```
frontend-architecture.md의 5개 Store 정의 기준으로
Zustand store 파일을 각각 생성해줘.
DocumentStore, EditorUIStore, ViewportStore, InteractionStore, AutosaveStore
```

---

### [T-08] SVG 기반 기본 노드 렌더러

**입력 문서**: `02-domain/domain-models.md` (NodeObject, NodeStyle, ShapeType), `03-editor-core/node/06-node-rendering.md`

**작업 지시 예시**:
```
domain-models.md의 NodeObject를 받아서 SVG로 렌더링하는 기본 NodeRenderer 컴포넌트를 만들어줘.
도형(ShapeType): rounded-rectangle 기본 — rectangle / ellipse / pill / diamond / parallelogram / none 지원.
depth별 기본 fontSize: depth 0=20px, 1=16px, 2=14px, 3+=12px (domain-models.md §6 스타일 상속 규칙).
style_json → NodeStyle 타입으로 역직렬화.
```

---

### [T-09] Radial Layout 엔진 구현

**입력 문서**: `03-editor-core/layout/08-layout.md`, `02-domain/domain-models.md` (LayoutType)

**대상 레이아웃**: `radial-bidirectional` (기본값), `radial-right`, `radial-left`

---

### [T-10] Tree / Hierarchy / ProcessTree Layout 엔진 구현

**입력 문서**: `03-editor-core/layout/08-layout.md`, `02-domain/domain-models.md` (LayoutType)

**대상 레이아웃**: `tree-up/down/left/right`, `hierarchy-right/left`, `process-tree-right/left/right-a/right-b`, `freeform`

---

### [T-11] 노드 편집 기능 (인라인 텍스트 편집)

**입력 문서**: `03-editor-core/node/02-node-editing.md`, `02-domain/domain-models.md`

---

### [T-12] Drag & Drop 이동

**입력 문서**: `03-editor-core/node/02-node-editing.md`, `02-domain/domain-models.md` (freeform ↔ auto 전환 정책 §5.5)

---

### [T-13] Undo / Redo

**입력 문서**: `03-editor-core/history/12-history-undo-redo.md`

---

### [T-14] Autosave 매니저

**입력 문서**: `03-editor-core/save/14-save.md`, `05-implementation/frontend-architecture.md`, `05-implementation/api-spec.md`

**주의**: patch 기반 저장 — 텍스트 변경 800ms debounce, 구조 변경(추가/삭제/이동) 0ms 즉시 전송

---

### [T-15] Markdown Export

**입력 문서**: `04-extensions/import-export/20-export.md`, `05-implementation/api-spec.md` (Export 섹션)

---

### [T-16] Standalone HTML Export

**입력 문서**: `04-extensions/import-export/20-export.md`

---

### [T-17] AI 마인드맵 생성 패널

**입력 문서**: `04-extensions/ai/18-ai.md`, `05-implementation/api-spec.md`

---

### [T-18] Publish URL 생성

**입력 문서**: `04-extensions/publish/27-publish-share.md`, `05-implementation/api-spec.md` (Publish 섹션)

---

### [T-19] Node Indicator UI

**입력 문서**: `03-editor-core/node/03-node-indicator.md`, `02-domain/domain-models.md`

---

### [T-20] Tag 시스템

**입력 문서**: `03-editor-core/search/15-tag.md`, `02-domain/db-schema.md` (§6 tags, §3-2 node_tags)

---

## Phase 2 — V1 (협업 & WBS & 연동)

### [T-21] Workspace / Map 권한 관리 API

**입력 문서**: `05-implementation/api-spec.md`, `02-domain/db-schema.md` (§2-1 workspaces, workspace_members)

**작업 지시 예시**:
```
workspaces, workspace_members 테이블 기반으로
워크스페이스 CRUD + 멤버 초대/제거/역할변경 API를 NestJS로 구현해줘.
역할: owner | editor | viewer
```

---

### [T-22] 실시간 협업 — 초대/권한 관리 (COLLAB-01~05)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §13, §16, `02-domain/db-schema.md` §v3.3

**작업 지시 예시**:
```
25-map-collaboration.md §16.1~16.3 기준으로 협업자 초대/권한변경/소유권이양 API를 구현해줘.
map_collaborators 테이블, scope_type(full/level/node) 처리 포함.
AES 암호화는 불필요, 초대 토큰은 INVITE_TOKEN_SECRET 환경변수로 서명 (env-spec.md 참조)
```

---

### [T-23] WebSocket Gateway + Redis Pub/Sub 설정 (COLLAB-04~06)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §14, `05-implementation/system-architecture.md`

**작업 지시 예시**:
```
NestJS WebSocket Gateway를 구현해줘.
채널 구조:
  Supabase Realtime: presence:{mapId} — cursor/selection 공유
  Redis Pub/Sub: map:{mapId} — map patch 브로드캐스트
이벤트 상수는 coding-conventions.md §12 WS_EVENTS / WS_CLIENT_EVENTS 사용.
```

---

### [T-24] Soft Lock (COLLAB-08~09)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §4.4, §14.6

**주의**: Soft Lock TTL = **5초** (§14.6 소스 명세 우선). Redis Key: `lock:node:{nodeId}`

---

### [T-25] Presence / 커서 공유 (COLLAB-07, COLLAB-16~17)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §4.5, §14.4~14.5

**주의**: Presence 색상 팔레트 8색 (`PRESENCE_COLORS` 상수 사용, §14.5)

---

### [T-26] 버전 히스토리 / Diff Viewer

**입력 문서**: `03-editor-core/history/13-version-history.md`, `02-domain/db-schema.md` (§4 map_revisions)

---

### [T-27] WBS 모드 전환 + node_schedule API

**입력 문서**: `04-extensions/project/28-wbs.md`, `04-extensions/integrations/31-redmine-integration.md` §19 Phase 1, `02-domain/db-schema.md` (§11 node_schedule)

**작업 지시 예시**:
```
maps.view_mode = 'wbs' 전환 API + node_schedule CRUD API 구현.
NodeSchedule 타입: domain-models.md §8.1
isMilestone=true 시 startDate = endDate 강제 (DB 제약 chk_milestone_single_date 참조)
```

---

### [T-28] NodeWbsIndicator 컴포넌트

**입력 문서**: `04-extensions/integrations/31-redmine-integration.md` §15, `04-extensions/project/28-wbs.md`

**작업 지시 예시**:
```
31-redmine-integration.md §15 NodeWbsIndicator 컴포넌트 계층 기준으로 구현해줘.
하위 컴포넌트: MilestoneMarker, DateBadge, ProgressBar, ResourceAvatars, SyncStatusIcon
WBS 상태 판별 함수 getWbsStatus() 포함 (§14)
```

---

### [T-29] 리소스 할당 패널 + node_resources API

**입력 문서**: `04-extensions/project/29-resource.md`, `02-domain/db-schema.md` (§12 node_resources), `02-domain/domain-models.md` (NodeResource §8.2)

---

### [T-30] Redmine 연동 설정 API + AES-256-GCM 암호화

**입력 문서**: `04-extensions/integrations/31-redmine-integration.md` §4.1, §16, `05-implementation/coding-conventions.md` §15

**작업 지시 예시**:
```
redmine_project_maps 테이블 CRUD API 구현.
API Key 암호화: REDMINE_ENCRYPTION_KEY 환경변수로 AES-256-GCM 암호화.
저장 형식: base64(iv).base64(authTag).base64(ciphertext)
GET 응답에서 api_key_encrypted → '*****' 마스킹 필수.
```

---

### [T-31] Redmine Pull/Push 동기화 API

**입력 문서**: `04-extensions/integrations/31-redmine-integration.md` §5.2~5.3, §4.5

**노드 ↔ Redmine Issue 필드 매핑** (`31-redmine-integration.md §4.5`):
- `node.text` → `issue.subject`
- `node_schedule.start_date` → `issue.start_date`
- `node_schedule.progress` → `issue.done_ratio`
- `node_resources` (assignee) → `issue.assigned_to`

---

### [T-32] BullMQ RedmineSyncWorker 구현

**입력 문서**: `04-extensions/integrations/31-redmine-integration.md` §5.2, §18, `05-implementation/coding-conventions.md` §13

**작업 지시 예시**:
```
coding-conventions.md §13 기준으로 RedmineSyncWorker 구현.
Queue 이름: 'redmine-sync' (QUEUE_NAMES.REDMINE_SYNC)
재시도: 최대 3회, Exponential Backoff (1s → 2s → 4s)
성공: sync_status = 'synced' / 실패: 'error' → 3회 후 'failed' + redmine_sync_log INSERT
```

---

### [T-33] Tracker → Node 색상 매핑 (Pull 동기화)

**입력 문서**: `04-extensions/integrations/31-redmine-integration.md` §13

**주의**: `TRACKER_COLOR_MAP` 상수 사용 — Bug/Feature/Task/Epic/Milestone 색상 지정

---

### [T-34] Obsidian Import/Export 연동

**입력 문서**: `04-extensions/integrations/30-obsidian-integration.md`, `04-extensions/import-export/21-import.md`

---

### [T-35] Node Note (node_notes) API + UI

**입력 문서**: `03-editor-core/node/04-node-content.md`, `02-domain/db-schema.md` (§3-1 node_notes)

**주의**: `nodes.note` 컬럼 없음. API: `GET/PUT/DELETE /nodes/{nodeId}/note`

---

### [T-36] 노드 링크 / 첨부파일 / 미디어 (node_links, node_attachments, node_media)

**입력 문서**: `03-editor-core/node/04-node-content.md`, `02-domain/db-schema.md` (§3-3~§3-5)

**주의**: `node_media.media_type`은 `'audio' | 'video'`만 허용 — 이미지 배경은 `nodes.background_image_path`

---

### [T-37] Kanban 레이아웃 완성

**입력 문서**: `03-editor-core/canvas/09-kanban.md`, `02-domain/domain-models.md` (§5.4 kanban depth 규칙)

**주의**: depth 0=board / 1=column / 2=card, depth ≥ 3 금지 (`chk_nodes_kanban_depth` DB 제약)

---

### [T-38] Import (Markdown / Obsidian 호환)

**입력 문서**: `04-extensions/import-export/21-import.md`

---

### [T-39] 검색 기능 (텍스트/태그)

**입력 문서**: `03-editor-core/search/16-search.md`

---

### [T-40] 키보드 단축키 전체 구현

**입력 문서**: `03-editor-core/search/17-keyboard-shortcuts.md`

---

## Phase 3 — V1.5 (AI Executable Workflow)

### [T-41] AI Workflow — Workflow 생성 (WFLOW-01~02)

**입력 문서**: `04-extensions/ai/19-ai-workflow.md`, `02-domain/domain-models.md` §7 (AI Workflow 확장 필드)

**작업 지시 예시**:
```
19-ai-workflow.md 기준으로 사용자 자연어 요청 → step 기반 node tree 생성 기능 구현.
NodeObject의 workflowType, stepState, isExecutableStep, resolutionStatus 필드 활용.
```

---

### [T-42] AI Workflow — Step 상태 관리 (WFLOW-03~04)

**입력 문서**: `04-extensions/ai/19-ai-workflow.md`, `02-domain/domain-models.md` §7

**상태**: `not_started | in_progress | blocked | resolved | done`

---

### [T-43] AI Workflow — 오류 해결 (WFLOW-05~06)

**입력 문서**: `04-extensions/ai/19-ai-workflow.md`

---

### [T-44] AI Workflow — Cleanup (WFLOW-07)

**입력 문서**: `04-extensions/ai/19-ai-workflow.md`

---

### [T-45] Note Code Block + Copy 버튼 (WFLOW-08~10)

**입력 문서**: `04-extensions/ai/19-ai-workflow.md`, `02-domain/domain-models.md` §7 (NoteBlock 구조화 블록)

**NoteBlock 타입 참조** (`domain-models.md §7`):
- `{ type: 'code_block'; language: string; content: string; copyEnabled: boolean }`

---

## Phase 4 — V2 (다국어 번역 & 실시간 채팅)

### [T-46] franc-min 언어 감지 + text_hash 생성

**입력 문서**: `04-extensions/translation/23-node-translation.md` §14, §16, `05-implementation/coding-conventions.md` §14

**작업 지시 예시**:
```
coding-conventions.md §14 기준으로 detectLanguage() 함수 구현.
franc-min: ISO 639-3 → ISO 639-1 변환 (LANG_MAP 상수).
3자 미만 텍스트 / 'und' 반환 시 preferred_language fallback.
text_hash: SHA-256 앞 128자.
Jitter TTL: TTL_BASE=7200 + TTL_JITTER=600 랜덤.
```

---

### [T-47] shouldTranslate() / determineTranslationMode() 구현

**입력 문서**: `04-extensions/translation/23-node-translation.md` §13, `02-domain/domain-models.md` §4.3 (3단계 번역 정책)

**결정 테이블** (`23-node-translation.md §13.1`) 전체 케이스 커버

---

### [T-48] TranslationWorker + DeepL API 연동

**입력 문서**: `04-extensions/translation/23-node-translation.md` §5.2, §15, `05-implementation/coding-conventions.md` §13

**Queue 이름**: `'translation'` (QUEUE_NAMES.TRANSLATION)  
**배치 청크**: 50개/request  
**Fallback**: DeepL 실패 시 LLM 2차 시도

---

### [T-49] 번역 캐시 + Redis Sliding TTL 전략

**입력 문서**: `04-extensions/translation/23-node-translation.md` §14.2, `05-implementation/env-spec.md` (TRANSLATION_CACHE_* 환경변수)

**TTL 전략**: Initial(7200s) / Sliding(1800s) / Max(21600s) / Jitter(0~600s)

---

### [T-50] 배치 번역 API + 초기 맵 로딩 전략

**입력 문서**: `04-extensions/translation/23-node-translation.md` §5.2, §15

**API**: `POST /translate/batch` — 50개 청크 처리  
**흐름**: 원문 즉시 렌더링 → 캐시 HIT 즉시 교체 → 미캐시 Skeleton → Background 번역 → fade-in

---

### [T-51] 번역 Broadcast (translation:ready WebSocket)

**입력 문서**: `04-extensions/translation/23-node-translation.md` §3 (TRANS-07), `04-extensions/collaboration/25-map-collaboration.md` §14.2

**채널**: Redis Pub/Sub → WS Gateway → 클라이언트  
**이벤트**: `translation:ready { nodeId, targetLang, translatedText, textHash }`

---

### [T-52] 번역 UI — Skeleton / 원문 토글 / 인디케이터

**입력 문서**: `04-extensions/translation/23-node-translation.md` §5.1, `02-domain/domain-models.md` §3 (UiPreferences)

**UiPreferences 필드**: `showTranslationIndicator`, `showTranslationOverrideIcon` (users.ui_preferences_json)

---

### [T-53] 실시간 협업 채팅 (COLLAB-10)

**입력 문서**: `04-extensions/collaboration/26-realtime-chat.md`, `02-domain/db-schema.md` §17 (chat_messages, chat_message_translations)

---

### [T-54] 채팅 번역 (TRANS-08~11)

**입력 문서**: `04-extensions/translation/24-chat-translation.md`, `02-domain/db-schema.md` §17-2 (chat_message_translations)

---

### [T-55] 맵 번역 정책 설정 UI (MapTranslationPolicy)

**입력 문서**: `02-domain/domain-models.md` §4.1~4.3 (MapTranslationPolicy, 3단계 계층)

**DB 컬럼**: `maps.translation_policy_json` JSONB

---

## Phase 5 — V3 (Node Thread & 대시보드)

### [T-56] Node Thread 생성/조회/해결 (COLLAB-10~13)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §4.3 (node_threads, thread_messages), `02-domain/db-schema.md` §17

---

### [T-57] @멘션 알림 (COLLAB-13)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §3 (COLLAB-13)

**알림 채널**: FCM (V3) — `FCM_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` 환경변수 활성화 필요

---

### [T-58] AI Thread 요약 (COLLAB-14, AI-03)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §3 (COLLAB-14), `02-domain/db-schema.md` §17-3 (node_thread_ai_previews)

**approval_state**: `preview → approved → applied | discarded`

---

### [T-59] AI 작업 추출 → 노드 생성 (COLLAB-15, AI-04~05)

**입력 문서**: `04-extensions/collaboration/25-map-collaboration.md` §3 (COLLAB-15), `02-domain/db-schema.md` §17-3

---

### [T-60] Dashboard 모드 전환 + 자동 리프레시 (DASH-01~04)

**입력 문서**: `04-extensions/dashboard/22-dashboard.md`, `02-domain/db-schema.md` (maps.view_mode, maps.refresh_interval_seconds)

**작업 지시 예시**:
```
maps.view_mode = 'dashboard' 전환 API 구현.
DASHBOARD_DEFAULT_REFRESH_INTERVAL 환경변수 기본값 적용.
허용 갱신 주기: 0(off) | 10 | 30 | 60 | 300 | 600 초
Redis Pub/Sub 채널: dashboard:{mapId} (DASHBOARD_REFRESH_CHANNEL_PREFIX 환경변수)
```

---

### [T-61] 외부 데이터 업데이트 API (DASH-05)

**입력 문서**: `04-extensions/dashboard/22-dashboard.md` §3 (DASH-05)

**API**: `PATCH /maps/:id/data` — 외부 시스템에서 노드 값 일괄 업데이트

---

### [T-62] Dashboard 변경 하이라이트 (DASH-03)

**입력 문서**: `04-extensions/dashboard/22-dashboard.md` §3 (DASH-03)

**Flash animation**: 변경된 노드 노란색 하이라이트 → fade-out

---

### [T-63] field_registry 대시보드 필드 메타 관리 (V3)

**입력 문서**: `02-domain/db-schema.md` §10 (field_registry)

---

### [T-64] Settings 페이지 전체 구현

**입력 문서**: `04-extensions/settings/32-settings.md`

---

### [T-65] FCM 푸시 알림 기반 구조 (V3)

**입력 문서**: `05-implementation/env-spec.md` (FCM_* 환경변수), `04-extensions/collaboration/25-map-collaboration.md` §3 (COLLAB-13)

---

---

## Task 진행 현황 요약

| 단계 | Task 범위 | 상태 |
|------|-----------|------|
| MVP | T-01~T-20 | 구현 중 |
| V1 | T-21~T-40 | 예정 |
| V1.5 | T-41~T-45 | 예정 |
| V2 | T-46~T-55 | 예정 |
| V3 | T-56~T-65 | 예정 |

---

## Task 실행 체크리스트

각 Task 완료 후 확인:
- [ ] 기능이 문서 명세와 일치하는가
- [ ] TypeScript 타입 오류 없는가 (`strict: true`, `noUncheckedIndexedAccess: true`)
- [ ] `NodeObject`, `MapObject` 타입이 `domain-models.md` 정의와 일치하는가
- [ ] nullable 필드를 `null` / `undefined` 혼용 없이 처리했는가 (coding-conventions.md §4)
- [ ] JSONB 컬럼(`style_json`, `manual_position`, `size_cache`)에 타입 가드 적용했는가
- [ ] API 호출이 `api-spec.md`와 일치하는가
- [ ] 엣지 케이스 처리 (빈 값, 네트워크 오류 등)
- [ ] 콘솔 에러 없는가
- [ ] Supabase Service Key가 클라이언트 코드에 포함되지 않는가
- [ ] BullMQ Worker는 `coding-conventions.md §13` 네이밍 규칙을 따르는가
