# easymindmap — Codex Task Plan (AI 개발 작업 분해)

> AI(Claude/Codex)에게 개발을 지시할 때 사용하는 작업 단위 목록.  
> 각 Task는 독립적으로 실행 가능하고 검증 가능한 단위로 쪼개야 한다.

---

## 원칙

- Task 하나당 AI 호출 1~3회 이내로 완결 가능한 크기
- 각 Task에 **입력 문서**, **결과물**, **검증 방법** 명시
- PRD / API Spec 변경 시 해당 Task 재실행

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

**입력 문서**: `02-domain/node-model.md`, `map-model.md`, `backend-architecture.md`

**작업 지시 예시**:
```
node-model.md와 map-model.md의 스키마 기준으로
TypeORM Entity 파일과 초기 마이그레이션을 생성해줘.
테이블 (schema.sql 기준 전체 목록):
  핵심: users, workspaces, workspace_members, maps, nodes
  노드 관계: node_notes, node_links, node_attachments, node_media, node_tags, node_translations
  맵 관련: revisions, published_maps, field_registry
  AI/작업: ai_jobs, tags
```

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

**입력 문서**: `api-spec.md` (Nodes 섹션), `02-domain/node-model.md`

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

**입력 문서**: `02-domain/node-model.md`, `03-editor-core/layout-engine.md`

**작업 지시 예시**:
```
NodeObject를 받아서 SVG로 렌더링하는 기본 NodeRenderer 컴포넌트를 만들어줘.
도형: rounded-rectangle 기본.
텍스트 중앙 정렬, style 필드 반영.
```

---

### [T-09] Radial Layout 엔진 구현

**입력 문서**: `03-editor-core/layout-engine.md`, `layout-coordinate-algorithm.md`

---

### [T-10] Tree Layout 엔진 구현

**입력 문서**: `03-editor-core/layout-engine.md`, `layout-coordinate-algorithm.md`

---

### [T-11] 노드 편집 기능 (인라인 텍스트 편집)

**입력 문서**: `03-editor-core/node-editing.md`

---

### [T-12] Drag & Drop 이동

**입력 문서**: `03-editor-core/node-editing.md`

---

### [T-13] Undo / Redo

**입력 문서**: `03-editor-core/command-history.md`

---

### [T-14] Autosave 매니저

**입력 문서**: `frontend-architecture.md` (Autosave 전략 섹션), `api-spec.md`

---

### [T-15] Markdown Export

**입력 문서**: `api-spec.md` (Export 섹션)

---

### [T-16] Standalone HTML Export

**입력 문서**: `04-extensions/html-export.md`

---

### [T-17] AI 마인드맵 생성 패널

**입력 문서**: `04-extensions/ai-mindmap-generation.md`, `api-spec.md`

---

### [T-18] Publish URL 생성

**입력 문서**: `api-spec.md` (Publish 섹션)

---

### [T-19] Node Indicator UI

**입력 문서**: `03-editor-core/node-indicator.md`

---

### [T-20] Tag 시스템

**입력 문서**: `03-editor-core/tag-system.md`

---

## Task 실행 체크리스트

각 Task 완료 후 확인:
- [ ] 기능이 문서 명세와 일치하는가
- [ ] TypeScript 타입 오류 없는가
- [ ] API 호출이 api-spec.md와 일치하는가
- [ ] 엣지 케이스 처리 (빈 값, 네트워크 오류 등)
- [ ] 콘솔 에러 없는가
