# EasyMindMap Docs

> 최종 업데이트: 2026-08-04

EasyMindMap 문서는 아래와 같은 구조로 구성됩니다.

```text
docs/
├─ 00-project-overview/
│  ├─ backlog.md                          ← 백로그(To Do) — 수식 KaTeX 등
│  ├─ mvp-scope.md
│  ├─ roadmap.md
│  ├─ vision.md
│  ├─ glossary.md                         ← 용어집(협업·인프라·사업 용어)
│  └─ emm-strategy.md                     ← EMM 표준화·오픈소스·사업화 전략
├─ 01-product/
│  ├─ functional-spec.md
│  ├─ privacy-policy.md                    ← 개인정보 처리방침
│  ├─ product-highlights.md                ← 제품 하이라이트
│  └─ ui-ux-spec.md
├─ 02-domain/
│  ├─ README.md
│  ├─ db-schema.md
│  ├─ domain-models.md
│  ├─ node-hierarchy-storage-strategy.md
│  ├─ schema.sql                          ← DB 스키마 (Clean Edition, 설계 참고본 — 운영 기준 스키마는 apps/api/database/schema.sql)
│  └─ collaboration-schema.sql            ← 협업 관련 스키마
│
├─ 03-editor-core/        👈 핵심 기능 (편집기 핵심)
│  ├─ map/
│  │  └─ 01-map.md
│  ├─ node/
│  │  ├─ 02-node-editing.md
│  │  ├─ 03-node-indicator.md
│  │  ├─ 04-node-content.md
│  │  ├─ 05-node-style.md
│  │  ├─ 06-node-rendering.md
│  │  └─ 07-markdown-format-policy.md
│  ├─ layout/
│  │  └─ 08-layout.md
│  ├─ canvas/
│  │  ├─ 09-kanban.md
│  │  ├─ 10-canvas.md
│  │  └─ 11-selection.md
│  ├─ history/
│  │  ├─ 12-history-undo-redo.md
│  │  └─ 13-version-history.md
│  ├─ save/
│  │  └─ 14-save.md
│  ├─ search/
│  │  ├─ 15-tag.md
│  │  ├─ 16-search.md
│  │  └─ 17-keyboard-shortcuts.md
│  ├─ edge-policy.md
│  └─ state-architecture.md
│
├─ 04-extensions/         👈 확장 기능 (AI / 협업 / 외부 연동)
│  ├─ emm-spec.md                         ← EasyMindMap Markdown(EMM) 정식 스펙
│  ├─ emm-testing-guide.md                ← EMM 테스트 가이드 (IT 초보자용)
│  ├─ markdown-export.md                  ← MD ↔ 맵 변환 규칙 (EMM 구현 규칙서)
│  ├─ content-permanence.md               ← 콘텐츠 영구 보존(오프라인 내장) 차별점·홍보 소재
│  ├─ rich-node-content.md                ← 리치 노드 콘텐츠(노트 4종→노드) 설계 제안
│  ├─ auth-session-ui.md                  ← 로그인 게이트·세션 UI (Supabase Auth SDK + Guest)
│  ├─ attachment-storage.md               ← 노드 첨부파일 저장(쿼터) 설계
│  ├─ document-library.md                 ← 문서함(MapBrowser·폴더) — 대시보드 역할
│  ├─ i18n.md                             ← UI 다국어(i18n)
│  ├─ vault-mirror.md                     ← DB 정본 + 파일 미러(C안). 셀프호스트 vault
│  ├─ open-core-boundary.md               ← 오픈코어 경계(공개 코어 / 유료 모듈)
│  ├─ admin-console.md                    ← 관리자 콘솔
│  ├─ ai/
│  │  ├─ 18-ai.md
│  │  ├─ 19-ai-workflow.md
│  │  ├─ emm-prompt-templates.md          ← AI용 EMM 생성 프롬프트 템플릿
│  │  ├─ ai-project-workspace.md          ← AI 프로젝트 워크스페이스 설계(제안)
│  │  ├─ web-ai-clipboard.md              ← 웹 AI 클립보드 워크플로우
│  │  └─ easymindmap-copilot-gpt.md       ← EasyMindMap Copilot GPT
│  ├─ import-export/
│  │  ├─ 20-export.md
│  │  ├─ 21-import.md
│  │  └─ 22-map-file-meta.md
│  ├─ dashboard/
│  │  └─ 22-dashboard.md
│  ├─ translation/
│  │  ├─ 23-node-translation.md
│  │  └─ 24-chat-translation.md
│  ├─ collaboration/
│  │  ├─ 25-map-collaboration.md
│  │  ├─ 26-realtime-chat.md
│  │  ├─ 27-sync-model.md
│  │  └─ 28-sync-prework-plan.md
│  ├─ publish/
│  │  └─ 27-publish-share.md
│  ├─ project/
│  │  ├─ 28-wbs.md
│  │  └─ 29-resource.md
│  ├─ integrations/
│  │  ├─ 30-obsidian-integration.md
│  │  └─ 31-redmine-integration.md
│  └─ settings/
│     └─ 32-settings.md
│
├─ 05-implementation/     👈 API / 개발 규약 / 작업 계획
│  ├─ api-spec.md
│  ├─ backend-phase1.md                   ← 백엔드 걷는 뼈대(맵 저장) 구현 노트
│  ├─ codex-task-plan.md
│  ├─ coding-conventions.md
│  ├─ env-spec.md
│  ├─ rate-limit.md                       ← 레이트 리밋 한도와 근거
│  ├─ sprint-plan.md                      ← 스프린트 계획
│  ├─ sprint-mvp-tasks.md                 ← MVP 스프린트 작업 목록
│  ├─ state-management.md
│  └─ test-catalog.md                     ← MVS E2E 테스트 카탈로그(회귀 목록)
│
├─ user-guide/            👈 최종 사용자용 사용 설명서 (골격 → 스크린샷 예정)
│  ├─ README.md                           ← 목차·30초 요약
│  ├─ 01-시작하기.md ~ 10-자주-묻는-질문.md
│  ├─ 로컬-실행.md                          ← 내 PC 에서 띄워 보기
│  └─ assets/                             ← 스크린샷 보관
│
├─ 90-architecture/       👈 시스템·인프라 아키텍처 문서
│  ├─ backend-architecture.md
│  ├─ ci-cd-github-actions.md   👈 CI(품질 게이트) 가이드 — 배포는 Coolify
│  ├─ dev-server-coolify.md     👈 개발 서버 = Ubuntu 22.04 + Coolify (프로덕션 패리티) 기준 문서
│  ├─ dev-server-runbook.md     👈 개발 서버 운영 런북
│  ├─ docker-compose-spec.md
│  ├─ frontend-architecture.md
│  ├─ gotrue-deploy-walkthrough.md  👈 GoTrue(Auth) 배포 절차
│  ├─ infra-architecture.md
│  ├─ selfhost-docker.md        👈 셀프호스트 Docker 배포 설계(있는 것/없는 것·남은 일)
│  └─ system-architecture.md
│
├─ 91-architecture-검토자료/  👈 기술 비교 분석 자료
│  ├─ EasyMindMap 5-Store 상세 설명.md
│  ├─ React, Angular, Vue 비교 분석.md
│  └─ Zustand와 TanStack Query 상태 관리 비교.md
│
├─ 99-ai-validation/      👈 AI 검증 규칙 및 결과
│  └─ ai-validation-rules.md
│
└─ assets/                👈 문서 내 이미지/첨부 파일 리소스
   ├─ markdown문법.md                      ← 마크다운 문법 참고
   └─ brand/brand-logo.md                 ← 브랜드 로고 규정
```

## 빠른 가이드

- **00~02**: 프로젝트 개요, 제품 기획, 도메인 모델
- **03-editor-core**: 맵/노드/레이아웃/히스토리/저장/검색 등 편집기 핵심 기능
- **04-extensions**: AI, 번역, 협업, 퍼블리시, 외부 연동 등 확장 기능
- **05-implementation**: API 명세, 개발 규약, 작업 계획, 환경변수
- **90-architecture**: 백엔드/프론트엔드/인프라 아키텍처 설계 문서
- **91-architecture-검토자료**: 기술 선택을 위한 비교 분석 자료
- **99-ai-validation**: AI 문서 검증 규칙 및 결과물
- **assets**: 문서 내 이미지/첨부 파일 리소스

---

## 전체 문서 목록

### 번호 없는 문서 (README.md 제외)

| 경로 | 설명 |
|------|------|
| [`docs/README.md`](README.md) | 문서 목차 및 구조 안내 (이 파일) |
| [`docs/00-project-overview/backlog.md`](00-project-overview/backlog.md) | 백로그(To Do) — 수식 KaTeX·리치 노드 등 결정-미구현 항목 |
| [`docs/00-project-overview/mvp-scope.md`](00-project-overview/mvp-scope.md) | MVP 범위 정의 |
| [`docs/00-project-overview/roadmap.md`](00-project-overview/roadmap.md) | 개발 로드맵 |
| [`docs/00-project-overview/vision.md`](00-project-overview/vision.md) | 제품 비전 |
| [`docs/00-project-overview/glossary.md`](00-project-overview/glossary.md) | 용어 사전 |
| [`docs/00-project-overview/emm-strategy.md`](00-project-overview/emm-strategy.md) | EMM 표준화·오픈소스·사업화 전략 |
| [`docs/01-product/functional-spec.md`](01-product/functional-spec.md) | 전체 기능 명세서 |
| [`docs/01-product/privacy-policy.md`](01-product/privacy-policy.md) | 개인정보 처리방침 |
| [`docs/01-product/product-highlights.md`](01-product/product-highlights.md) | 제품 하이라이트 |
| [`docs/01-product/ui-ux-spec.md`](01-product/ui-ux-spec.md) | UI/UX 설계 명세 |
| [`docs/02-domain/README.md`](02-domain/README.md) | 도메인 모델 개요 |
| [`docs/02-domain/db-schema.md`](02-domain/db-schema.md) | DB 스키마 정의 |
| [`docs/02-domain/domain-models.md`](02-domain/domain-models.md) | 도메인 모델 정의 |
| [`docs/02-domain/node-hierarchy-storage-strategy.md`](02-domain/node-hierarchy-storage-strategy.md) | 노드 계층 저장 전략 |
| [`docs/03-editor-core/README.md`](03-editor-core/README.md) | 에디터 핵심 기능 개요 |
| [`docs/03-editor-core/edge-policy.md`](03-editor-core/edge-policy.md) | 에지/레이아웃/노드 상속 정책 |
| [`docs/03-editor-core/state-architecture.md`](03-editor-core/state-architecture.md) | 상태관리 아키텍처 |
| [`docs/04-extensions/README.md`](04-extensions/README.md) | 확장 기능 개요 |
| [`docs/04-extensions/emm-spec.md`](04-extensions/emm-spec.md) | EasyMindMap Markdown(EMM) 정식 스펙 |
| [`docs/04-extensions/emm-testing-guide.md`](04-extensions/emm-testing-guide.md) | EMM 테스트 가이드 (IT 초보자용 검증 절차) |
| [`docs/04-extensions/content-permanence.md`](04-extensions/content-permanence.md) | 콘텐츠 영구 보존(오프라인 내장) — 차별점·홍보 문구 초안·서버 저장소 계획 |
| [`docs/04-extensions/rich-node-content.md`](04-extensions/rich-node-content.md) | 리치 노드 콘텐츠(노트 4종→노드 본문·불러오기 옵션·A4 제한) 설계 제안 |
| [`docs/04-extensions/auth-session-ui.md`](04-extensions/auth-session-ui.md) | 로그인 게이트·세션 UI — Supabase Auth SDK 직접 + Guest 모드 |
| [`docs/04-extensions/attachment-storage.md`](04-extensions/attachment-storage.md) | 노드 첨부파일 저장(쿼터) 설계 |
| [`docs/04-extensions/document-library.md`](04-extensions/document-library.md) | 문서함(MapBrowser·폴더·이름변경·삭제·다른 이름 저장) — 대시보드 역할 |
| [`docs/04-extensions/i18n.md`](04-extensions/i18n.md) | UI 다국어(i18n) |
| [`docs/04-extensions/vault-mirror.md`](04-extensions/vault-mirror.md) | DB 정본 + 파일 미러(C안) — 셀프호스트 vault. 파일 경로·첨부 이름·위키링크·덮어쓰기 안전장치 |
| [`docs/04-extensions/open-core-boundary.md`](04-extensions/open-core-boundary.md) | 오픈코어 경계 — 공개 코어와 유료 모듈을 가르는 기준 |
| [`docs/04-extensions/admin-console.md`](04-extensions/admin-console.md) | 관리자 콘솔 |
| [`docs/04-extensions/collaboration/27-sync-model.md`](04-extensions/collaboration/27-sync-model.md) | 동기화 모델 결정 — CRDT(Yjs)·전송·정본 유지·오픈코어 경계 |
| [`docs/04-extensions/collaboration/28-sync-prework-plan.md`](04-extensions/collaboration/28-sync-prework-plan.md) | 협업을 켜기 전에 코어에서 끝낼 것 — 실행 계획과 실제 코드 현황 |
| [`docs/04-extensions/ai/emm-prompt-templates.md`](04-extensions/ai/emm-prompt-templates.md) | AI용 EMM 생성 프롬프트 템플릿 |
| [`docs/04-extensions/ai/ai-project-workspace.md`](04-extensions/ai/ai-project-workspace.md) | AI 프로젝트 워크스페이스 설계 — 맵=프로젝트·노드=질문·경로 맥락(제안, 미구현) |
| [`docs/04-extensions/ai/web-ai-clipboard.md`](04-extensions/ai/web-ai-clipboard.md) | 웹 AI 클립보드 워크플로우(API 키 없이 웹 AI 사용) |
| [`docs/04-extensions/ai/easymindmap-copilot-gpt.md`](04-extensions/ai/easymindmap-copilot-gpt.md) | EasyMindMap Copilot GPT |
| [`docs/04-extensions/markdown-export.md`](04-extensions/markdown-export.md) | MD ↔ 맵 변환 규칙 명세 (EMM 구현 규칙서) |
| [`docs/04-extensions/import-export/22-map-file-meta.md`](04-extensions/import-export/22-map-file-meta.md) | 맵 파일 메타데이터 왕복 (easymindmap:v1) |
| [`docs/05-implementation/api-spec.md`](05-implementation/api-spec.md) | API 명세 |
| [`docs/05-implementation/backend-phase1.md`](05-implementation/backend-phase1.md) | 백엔드 Phase 1(걷는 뼈대·맵 저장) 구현·검증·로드맵 |
| [`docs/05-implementation/codex-task-plan.md`](05-implementation/codex-task-plan.md) | 개발 작업 계획 |
| [`docs/05-implementation/coding-conventions.md`](05-implementation/coding-conventions.md) | 코딩 컨벤션 |
| [`docs/05-implementation/env-spec.md`](05-implementation/env-spec.md) | 환경변수 명세 |
| [`docs/05-implementation/rate-limit.md`](05-implementation/rate-limit.md) | 레이트 리밋 한도와 그 근거 |
| [`docs/05-implementation/sprint-plan.md`](05-implementation/sprint-plan.md) | 스프린트 계획 |
| [`docs/05-implementation/sprint-mvp-tasks.md`](05-implementation/sprint-mvp-tasks.md) | MVP 스프린트 작업 목록 |
| [`docs/05-implementation/state-management.md`](05-implementation/state-management.md) | 상태관리 설계 (Zustand 스토어 구조) |
| [`docs/05-implementation/test-catalog.md`](05-implementation/test-catalog.md) | MVS E2E 테스트 카탈로그 — 영역별 검증 항목·회귀 실행 가이드 |
| [`docs/90-architecture/backend-architecture.md`](90-architecture/backend-architecture.md) | 백엔드 아키텍처 |
| [`docs/90-architecture/ci-cd-github-actions.md`](90-architecture/ci-cd-github-actions.md) | GitHub Actions CI 가이드 (품질 게이트 — 배포는 Coolify) |
| [`docs/90-architecture/dev-server-coolify.md`](90-architecture/dev-server-coolify.md) | 개발 서버 구축 기준 — Ubuntu 22.04 + Coolify, 프로덕션 패리티 |
| [`docs/90-architecture/dev-server-runbook.md`](90-architecture/dev-server-runbook.md) | 개발 서버 운영 런북 |
| [`docs/90-architecture/docker-compose-spec.md`](90-architecture/docker-compose-spec.md) | Docker Compose 명세 (Coolify 가 실행 주체, 구성 기준 스펙) |
| [`docs/90-architecture/frontend-architecture.md`](90-architecture/frontend-architecture.md) | 프론트엔드 아키텍처 |
| [`docs/90-architecture/gotrue-deploy-walkthrough.md`](90-architecture/gotrue-deploy-walkthrough.md) | GoTrue(Auth) 배포 절차 |
| [`docs/90-architecture/infra-architecture.md`](90-architecture/infra-architecture.md) | 인프라 아키텍처 |
| [`docs/90-architecture/selfhost-docker.md`](90-architecture/selfhost-docker.md) | 셀프호스트 Docker 배포 설계 — 있는 것/없는 것·구성 두 가지·남은 일 |
| [`docs/90-architecture/system-architecture.md`](90-architecture/system-architecture.md) | 시스템 아키텍처 |
| [`docs/91-architecture-검토자료/EasyMindMap 5-Store 상세 설명.md`](<91-architecture-검토자료/EasyMindMap 5-Store 상세 설명.md>) | Zustand 5-Store 상세 설계 |
| [`docs/91-architecture-검토자료/React, Angular, Vue 비교 분석.md`](<91-architecture-검토자료/React, Angular, Vue 비교 분석.md>) | 프레임워크 비교 분석 |
| [`docs/91-architecture-검토자료/Zustand와 TanStack Query 상태 관리 비교.md`](<91-architecture-검토자료/Zustand와 TanStack Query 상태 관리 비교.md>) | 상태관리 라이브러리 비교 |
| [`docs/99-ai-validation/ai-validation-rules.md`](99-ai-validation/ai-validation-rules.md) | AI 문서 검증 규칙 |
| [`docs/assets/markdown문법.md`](assets/markdown문법.md) | 마크다운 문법 참고 |
| [`docs/assets/brand/brand-logo.md`](assets/brand/brand-logo.md) | 브랜드 로고 규정 |

> ※ 번호 붙은 문서(01~32) 외의 모든 .md 문서 기준. 개수는 수시로 변하므로 구체 숫자를 표기하지 않는다(실제 개수는 파일 시스템에서 집계).

---

### 번호 붙은 문서 (32개)

번호는 기능 도메인 단위 식별자로, 03-editor-core 및 04-extensions 폴더 문서에 부여됩니다.

| 번호 | 경로 | 기능 그룹 | 설명 |
|:---:|------|-----------|------|
| 01 | `docs/03-editor-core/map/01-map.md` | MAP | 맵 생성/열기/삭제/목록 관리 |
| 02 | `docs/03-editor-core/node/02-node-editing.md` | NODE | 노드 추가/편집/삭제/이동/복제 등 |
| 03 | `docs/03-editor-core/node/03-node-indicator.md` | NODE | 노드 추가 인디케이터(+버튼), 상태 인디케이터 |
| 04 | `docs/03-editor-core/node/04-node-content.md` | NODE | 노드 콘텐츠 구조 (markdown / code / note) |
| 05 | `docs/03-editor-core/node/05-node-style.md` | NODE | 노드 스타일 (색상/폰트/border/배경 이미지) |
| 06 | `docs/03-editor-core/node/06-node-rendering.md` | NODE | 노드 렌더링 (자동 크기/줄바꿈/overflow/zoom LOD) |
| 07 | `docs/03-editor-core/node/07-markdown-format-policy.md` | NODE | Markdown → 노드 변환 파싱 정책 |
| 08 | `docs/03-editor-core/layout/08-layout.md` | LAYOUT | 레이아웃 유형 및 Layout Engine 정책 |
| 09 | `docs/03-editor-core/canvas/09-kanban.md` | KANBAN | Kanban 보드형 레이아웃 (컬럼/카드/중첩 카드) |
| 10 | `docs/03-editor-core/canvas/10-canvas.md` | CANVAS | 캔버스 조작 (줌/팬/FitScreen/Fullscreen) |
| 11 | `docs/03-editor-core/canvas/11-selection.md` | SELECTION | 노드 선택 (단일/다중/서브트리/영역 선택) |
| 12 | `docs/03-editor-core/history/12-history-undo-redo.md` | HISTORY | 실행 취소/복원 (클라이언트 Undo/Redo) |
| 13 | `docs/03-editor-core/history/13-version-history.md` | HISTORY | 버전 히스토리 (서버 기반 영구 버전 관리) |
| 14 | `docs/03-editor-core/save/14-save.md` | SAVE | 자동 저장 (autosave) |
| 15 | `docs/03-editor-core/search/15-tag.md` | TAG | 노드 태그 추가/제거/필터 |
| 16 | `docs/03-editor-core/search/16-search.md` | SEARCH | 텍스트/태그 기반 검색 |
| 17 | `docs/03-editor-core/search/17-keyboard-shortcuts.md` | SHORTCUTS | 키보드 단축키 정의 |
| 18 | `docs/04-extensions/ai/18-ai.md` | AI | AI 마인드맵 생성 및 노드 확장 |
| 19 | `docs/04-extensions/ai/19-ai-workflow.md` | AI WORKFLOW | AI 실행형 절차 (step 기반 workflow) |
| 20 | `docs/04-extensions/import-export/20-export.md` | EXPORT | Markdown / HTML 내보내기 |
| 21 | `docs/04-extensions/import-export/21-import.md` | IMPORT | Markdown 가져오기 (아웃라인/문서 파싱) |
| 22 | `docs/04-extensions/dashboard/22-dashboard.md` | DASHBOARD | 대시보드 맵 (Read-only / Auto Refresh) |
| 23 | `docs/04-extensions/translation/23-node-translation.md` | TRANSLATION | 노드 다국어 자동 번역 |
| 24 | `docs/04-extensions/translation/24-chat-translation.md` | TRANSLATION | 채팅 메시지 실시간 번역 |
| 25 | `docs/04-extensions/collaboration/25-map-collaboration.md` | COLLAB | 협업 초대/동기화/커서/Soft Lock/Node Thread |
| 26 | `docs/04-extensions/collaboration/26-realtime-chat.md` | CHAT | 실시간 채팅 (맵 채널 채팅, 1:1 DM, @멘션) |
| 27 | `docs/04-extensions/publish/27-publish-share.md` | PUBLISH | 공개 URL 게시 및 읽기 전용 공유 |
| 28 | `docs/04-extensions/project/28-wbs.md` | WBS | WBS 모드 (일정/마일스톤/진척률) |
| 29 | `docs/04-extensions/project/29-resource.md` | RESOURCE | 리소스 할당 (담당자/역할/공수) |
| 30 | `docs/04-extensions/integrations/30-obsidian-integration.md` | OBSIDIAN | Obsidian Vault 양방향 Markdown 동기화 |
| 31 | `docs/04-extensions/integrations/31-redmine-integration.md` | REDMINE | Redmine 이슈 양방향 동기화 |
| 32 | `docs/04-extensions/settings/32-settings.md` | SETTINGS | 사용자 설정 (테마/언어/레이아웃/API Key) |
