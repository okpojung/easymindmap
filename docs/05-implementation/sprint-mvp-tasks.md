# easymindmap MVP 스프린트 상세 태스크 목록

**문서 버전:** v1.0
**작성일:** 2026-05-07
**작성자:** Manus AI
**참조 문서:** `docs/05-implementation/sprint-plan.md`, `docs/05-implementation/codex-task-plan.md`

---

## 1. 개요

본 문서는 `sprint-plan.md`에 정의된 MVP 단계(Sprint 1 ~ Sprint 4)의 세부 태스크 목록을 구체화한 문서입니다. 각 태스크는 AI(Claude/Codex) 또는 개발자가 즉시 실행할 수 있도록 **입력 문서, 결과물, 검증 기준, 의존성**을 명확히 정의합니다.

---

## 2. Sprint 1: 기반 인프라 및 코어 렌더링 엔진

**목표:** 프로젝트 초기 환경 세팅, DB 마이그레이션, 인증 및 맵/노드 CRUD API 구현, 프론트엔드 5-Store 뼈대 및 기본 SVG 렌더러 구축.

| Task ID | 작업명 | 입력 문서 | 결과물 | 검증 기준 | 의존성 |
|---------|--------|-----------|--------|-----------|--------|
| **T-01** | 프론트엔드 초기 세팅 | `frontend-architecture.md` | React+Vite 프로젝트, 디렉토리 구조 | `npm run dev` 정상 실행, 폴더 구조 일치 | 없음 |
| **T-02** | 백엔드 초기 세팅 | `backend-architecture.md`, `api-spec.md` | NestJS 프로젝트, 모듈 구조 | `npm run start:dev` 정상 실행, 모듈 분리 확인 | 없음 |
| **T-03** | DB 마이그레이션 | `db-schema.md`, `domain-models.md` | Supabase SQL 마이그레이션 파일 | 테이블 생성 성공, RLS 정책 적용 확인 | T-02 |
| **T-04** | 인증 API 구현 | `api-spec.md` (Auth) | 회원가입/로그인/토큰 갱신 API | JWT 발급 확인, Refresh Token 쿠키 설정 확인 | T-03 |
| **T-05** | Map CRUD API | `api-spec.md` (Maps) | 맵 생성/조회/삭제 API | API 호출 시 DB 정상 반영 및 응답 확인 | T-04 |
| **T-06** | Node CRUD API | `api-spec.md` (Nodes), `domain-models.md` | 노드 생성/수정/삭제/이동 API | `NodeObject` 타입 일치, 하위 노드 cascade 삭제 확인 | T-05 |
| **T-07** | Zustand 5-Store 뼈대 | `frontend-architecture.md` | 5개 Store 파일 (`documentStore` 등) | Store 상태 읽기/쓰기 정상 동작 | T-01 |
| **T-08** | SVG 기본 노드 렌더러 | `domain-models.md`, `06-node-rendering.md` | `NodeRenderer` 컴포넌트 | SVG 도형(7종) 및 텍스트 렌더링, depth별 폰트 크기 적용 | T-07 |

---

## 3. Sprint 2: 편집기 상호작용 및 레이아웃 엔진

**목표:** 15종 레이아웃 자동 계산, 인라인 텍스트 편집, 드래그 앤 드롭 이동, Undo/Redo, 키보드 단축키 등 핵심 편집 기능 완성.

| Task ID | 작업명 | 입력 문서 | 결과물 | 검증 기준 | 의존성 |
|---------|--------|-----------|--------|-----------|--------|
| **T-09** | Radial Layout 엔진 | `08-layout.md`, `domain-models.md` | 방사형 레이아웃 계산 로직 | 2-pass 알고리즘 동작, 노드 겹침 없음 | T-08 |
| **T-10** | Tree / Hierarchy 엔진 | `08-layout.md`, `domain-models.md` | 트리/계층/진행트리/자유배치 로직 | 각 레이아웃 타입별 올바른 좌표 계산 | T-09 |
| **T-11** | 인라인 텍스트 편집 | `02-node-editing.md` | 텍스트 편집 UI 및 로직 | 더블클릭 시 편집 모드 진입, Enter/Blur 시 저장 | T-08 |
| **T-12** | Drag & Drop 이동 | `02-node-editing.md` | 노드 드래그 이동 로직 | 부모 변경 정상 동작, 자유배치 시 수동 좌표 저장 | T-10 |
| **T-13** | Undo / Redo | `12-history-undo-redo.md` | Command 패턴 기반 히스토리 스택 | Ctrl+Z / Ctrl+Y 정상 동작, 상태 복원 확인 | T-11, T-12 |
| **T-19** | Node Indicator UI | `03-node-indicator.md` | 4방향 추가 버튼(+) 컴포넌트 | 노드 선택 시 버튼 표시, 클릭 시 새 노드 생성 | T-11 |
| **T-40** | 키보드 단축키 | `17-keyboard-shortcuts.md` | 전역 단축키 이벤트 리스너 | Tab(자식), Enter(형제), Delete 등 단축키 동작 | T-11, T-13 |

---

## 4. Sprint 3: 데이터 영속성 및 노드 콘텐츠 확장

**목표:** 편집 내용의 실시간 자동 저장(Autosave) 구현 및 노드 부가 콘텐츠(노트, 링크, 첨부파일), Kanban 레이아웃, 태그/검색 기능 완성.

| Task ID | 작업명 | 입력 문서 | 결과물 | 검증 기준 | 의존성 |
|---------|--------|-----------|--------|-----------|--------|
| **T-14** | Autosave 매니저 | `14-save.md`, `api-spec.md` | Autosave 로직 및 API 연동 | 텍스트 800ms debounce, 구조 변경 즉시 저장, `patchId` 멱등성 확인 | T-06, T-13 |
| **T-35** | Node Note API + UI | `04-node-content.md`, `api-spec.md` | 노트 CRUD API 및 입력 패널 | `node_notes` 테이블 연동, 구조화된 블록 저장 확인 | T-06 |
| **T-36** | 노드 링크 / 첨부파일 | `04-node-content.md`, `api-spec.md` | 링크/첨부파일 API 및 UI | Supabase Storage 업로드 성공, 인디케이터 아이콘 표시 | T-06 |
| **T-37** | Kanban 레이아웃 | `09-kanban.md`, `domain-models.md` | 보드형 레이아웃 렌더러 | 3레벨(board/column/card) 제한 동작, 컬럼 간 카드 이동 | T-10 |
| **T-20** | Tag 시스템 | `15-tag.md`, `api-spec.md` | 태그 CRUD API 및 UI | 노드에 태그 추가/제거, 태그 색상 표시 | T-06 |
| **T-39** | 검색 기능 | `16-search.md` | 검색 패널 및 하이라이트 로직 | 텍스트/태그 검색 결과 표시, 캔버스 이동 및 하이라이트 | T-20 |

---

## 5. Sprint 4: 외부 연동 및 부가 기능 (MVP 완료)

**목표:** AI 마인드맵 생성, 파일 내보내기(Export)/가져오기(Import), 공개 URL 게시(Publish), 사용자 설정 기능을 구현하여 MVP를 최종 마감합니다.

| Task ID | 작업명 | 입력 문서 | 결과물 | 검증 기준 | 의존성 |
|---------|--------|-----------|--------|-----------|--------|
| **T-17** | AI 마인드맵 생성 | `18-ai.md`, `api-spec.md` | AI 생성 API 및 UI 패널 | 프롬프트 입력 시 Markdown 응답 수신 및 노드 트리 변환 | T-06 |
| **T-15** | Markdown Export | `20-export.md`, `api-spec.md` | Markdown 변환 로직 및 API | 계층 구조 유지된 `.md` 파일 다운로드 성공 | T-06 |
| **T-16** | HTML Export | `20-export.md` | Standalone HTML 생성 로직 | Markmap 기반 인터랙티브 HTML 파일 다운로드 성공 | T-15 |
| **T-38** | Import (Markdown) | `21-import.md`, `api-spec.md` | Markdown 파싱 및 Import API | `.md` 파일 업로드 시 노드 트리로 정상 복원 | T-06 |
| **T-18** | Publish URL 생성 | `27-publish-share.md`, `api-spec.md` | Publish API 및 공개 뷰어 페이지 | `published_maps` 연동, 비인증 상태에서 맵 조회 성공 | T-05 |
| **T-64** | Settings 페이지 | `32-settings.md`, `api-spec.md` | 사용자 설정 UI 및 API | 테마, 기본 레이아웃, UI 표시 설정 변경 및 저장 확인 | T-04 |

---

## 6. 태스크 실행 지침

1.  **문서 기반 구현:** 각 태스크를 시작하기 전, 반드시 **입력 문서**로 지정된 마크다운 파일을 정독해야 합니다.
2.  **타입 엄격성:** `domain-models.md`에 정의된 TypeScript 타입을 엄격히 준수하며, `any` 타입 사용을 지양합니다.
3.  **API First:** 프론트엔드 UI 작업 전, 백엔드 API 명세(`api-spec.md`)에 따른 Mock 데이터 연동 또는 실제 API 구현이 선행되어야 합니다.
4.  **검증:** 태스크 완료 후 **검증 기준**을 모두 만족하는지 확인한 뒤 다음 태스크로 넘어갑니다.
