# easymindmap 개발 스프린트 계획서

**문서 버전:** v1.0
**작성일:** 2026-05-07
**작성자:** Manus AI
**참조 문서:** `docs/00-project-overview/roadmap.md` (v1.6), `docs/05-implementation/codex-task-plan.md`

---

## 1. 개요

본 문서는 최신화된 제품 로드맵(v1.6)과 AI 개발 작업 분해 문서(`codex-task-plan.md`)를 바탕으로, **MVP 단계의 전체 개발 스프린트 계획**과 **V1 단계의 스프린트 개요**를 정의합니다. 각 스프린트는 1~2주 단위의 반복적인 개발 주기를 가정하며, 프론트엔드와 백엔드의 의존성을 고려하여 병렬 및 순차 작업이 가능하도록 구성되었습니다.

---

## 2. MVP 스프린트 계획 (Sprint 1 ~ Sprint 4)

MVP 단계는 핵심 편집기 기능, 자동 저장, AI 생성, Export, Publish 기능을 포함하며, 총 4개의 스프린트로 나누어 진행합니다. 최근 로드맵 변경에 따라 **노드 노트, 노드 링크, 노드 첨부파일** 기능이 MVP 스프린트에 포함되었습니다.

### Sprint 1: 기반 인프라 및 코어 렌더링 엔진 구축

**목표:** 프로젝트 초기 환경을 세팅하고, 맵/노드의 기본 CRUD API와 프론트엔드 캔버스 렌더링의 뼈대를 완성합니다.

| Task ID | 작업명 | 담당 | 주요 내용 |
|---------|--------|------|-----------|
| T-01 | 프론트엔드 초기 세팅 | FE | React, Vite, Zustand, shadcn/ui 기반 구조 생성 |
| T-02 | 백엔드 초기 세팅 | BE | NestJS, TypeORM, Supabase Auth 연동 기본 구조 |
| T-03 | DB 마이그레이션 | BE | `schema.sql` 기반 테이블 및 RLS 정책 생성 |
| T-04 | 인증 API 구현 | BE | 회원가입, 로그인, 토큰 갱신 (JWT) |
| T-05 | Map CRUD API | BE | 맵 생성, 목록 조회, 삭제 API |
| T-06 | Node CRUD API | BE | 노드 생성, 수정, 삭제, 이동 API |
| T-07 | Zustand 5-Store 뼈대 | FE | Document, EditorUI, Viewport, Interaction, Autosave 스토어 |
| T-08 | SVG 기본 노드 렌더러 | FE | `NodeObject` 기반 SVG 렌더링, 도형 및 텍스트 표시 |

### Sprint 2: 편집기 상호작용 및 레이아웃 엔진

**목표:** 사용자가 캔버스 위에서 노드를 자유롭게 편집하고, 다양한 레이아웃(방사형, 트리형 등)이 자동으로 계산되어 배치되도록 합니다.

| Task ID | 작업명 | 담당 | 주요 내용 |
|---------|--------|------|-----------|
| T-09 | Radial Layout 엔진 | FE | 방사형(기본, 좌, 우) 2-pass 좌표 계산 알고리즘 |
| T-10 | Tree / Hierarchy 엔진 | FE | 트리형, 계층형, 진행트리, 자유배치 레이아웃 계산 |
| T-11 | 인라인 텍스트 편집 | FE | 노드 더블클릭 시 텍스트 편집 모드 전환 및 저장 |
| T-12 | Drag & Drop 이동 | FE | 노드 드래그 이동, 부모 변경, 자유배치 수동 좌표 저장 |
| T-13 | Undo / Redo | FE | Command 패턴 기반 클라이언트 히스토리 스택 구현 |
| T-19 | Node Indicator UI | FE | 노드 선택 시 4방향 추가 버튼(+) 및 상태 아이콘 표시 |
| T-40 | 키보드 단축키 | FE | 노드 추가, 삭제, 이동, 선택 등 전역 단축키 바인딩 |

### Sprint 3: 데이터 영속성 및 노드 콘텐츠 확장

**목표:** 편집 내용을 서버에 실시간으로 안전하게 저장하고, 노드의 부가 콘텐츠(노트, 링크, 첨부파일) 기능을 완성합니다.

| Task ID | 작업명 | 담당 | 주요 내용 |
|---------|--------|------|-----------|
| T-14 | Autosave 매니저 | FE/BE | Patch 기반 800ms debounce / 0ms 즉시 저장, 충돌 해소 |
| T-35 | Node Note API + UI | FE/BE | `node_notes` 테이블 연동, 구조화된 노트(paragraph, code_block 등) 입력 패널 |
| T-36 | 노드 링크 / 첨부파일 | FE/BE | `node_links`, `node_attachments` 연동, Supabase Storage 업로드 |
| T-37 | Kanban 레이아웃 | FE | 3레벨(board/column/card) 제한 보드형 레이아웃 렌더링 및 조작 |
| T-20 | Tag 시스템 | FE/BE | 노드 태그 추가/제거, 태그 기반 필터링 UI |
| T-39 | 검색 기능 | FE | 맵 내 텍스트 및 태그 기반 노드 검색, 하이라이트 |

### Sprint 4: 외부 연동 및 부가 기능 (MVP 완료)

**목표:** AI 마인드맵 생성, 파일 내보내기/가져오기, 공개 URL 게시 기능을 구현하여 MVP를 최종 완성합니다.

| Task ID | 작업명 | 담당 | 주요 내용 |
|---------|--------|------|-----------|
| T-17 | AI 마인드맵 생성 | FE/BE | 프롬프트 입력 → BullMQ Worker (LLM 호출) → 노드 트리 파싱 및 렌더링 |
| T-15 | Markdown Export | BE | 맵 데이터를 Markdown 계층 구조로 변환 및 다운로드 |
| T-16 | HTML Export | BE | Markmap 기반 Standalone HTML 파일 생성 |
| T-38 | Import (Markdown) | FE/BE | Markdown 파일 파싱 → 노드 트리 변환 및 맵 적용 |
| T-18 | Publish URL 생성 | FE/BE | `published_maps` 연동, 읽기 전용 공개 뷰어 페이지 구현 |
| T-64 | Settings 페이지 (기본) | FE/BE | 프로필, 테마, 기본 레이아웃 등 사용자 설정 UI |

---

## 3. V1 스프린트 개요 (Sprint 5 ~ Sprint 7)

V1 단계는 팀 협업, 프로젝트 관리(WBS), 외부 시스템 연동(Redmine, Obsidian)을 핵심으로 합니다. 최근 로드맵 변경에 따라 **노드 배경 이미지** 기능이 V1으로 이동되었습니다.

### Sprint 5: 실시간 협업 기반 구축

*   **T-21:** Workspace / Map 권한 관리 API (owner, editor, viewer)
*   **T-22:** 실시간 협업 초대 및 권한 관리 UI
*   **T-23:** WebSocket Gateway + Redis Pub/Sub 설정 (Patch 브로드캐스트)
*   **T-24:** Soft Lock (5초 TTL) 및 편집 충돌 방지 UI
*   **T-25:** Presence 및 실시간 커서 공유
*   **T-26:** 버전 히스토리 패널 및 Diff Viewer (VH-07)

### Sprint 6: 프로젝트 관리 (WBS) 및 리소스

*   **T-27:** WBS 모드 전환 및 `node_schedule` (시작일, 종료일, 마일스톤, 진척률) API
*   **T-28:** NodeWbsIndicator 컴포넌트 (날짜 배지, 진척률 바 렌더링)
*   **T-29:** 리소스 할당 패널 및 `node_resources` API (담당자, 역할 지정)
*   **신규:** 노드 배경 이미지 (IMG-01~20) - preset/업로드 이미지 적용, fit/position 설정

### Sprint 7: 외부 시스템 연동

*   **T-30:** Redmine 연동 설정 API (AES-256-GCM 암호화)
*   **T-31:** Redmine Pull/Push 동기화 API 및 필드 매핑
*   **T-32:** BullMQ RedmineSyncWorker 구현 (비동기 이슈 생성/수정)
*   **T-34:** Obsidian Vault 양방향 동기화 (가져오기/내보내기 확장)

---

## 4. 후속 단계 (V1.5 ~ V3) 요약

*   **V1.5 (Sprint 8):** AI 실행형 절차 (Workflow 생성, Step 상태 관리, 오류 자동 해결, Note Code Block 연동)
*   **V2 (Sprint 9~10):** 다국어 자동 번역 (DeepL 연동, 캐시, Skeleton UI), 실시간 협업 채팅 (맵 채널, @멘션, 채팅 번역)
*   **V3 (Sprint 11~12):** Node Thread (댓글), AI 협업 요약 및 태스크 추출, 대시보드 맵 (자동 리프레시, 외부 데이터 연동 API), 1:1 DM

---

## 5. 스프린트 운영 지침

1.  **Task 실행:** 개발자는 `codex-task-plan.md`에 명시된 입력 문서를 반드시 숙지한 후 코드를 작성합니다.
2.  **API First:** 프론트엔드 작업 전, 백엔드 API 명세(`api-spec.md`)와 DB 스키마(`db-schema.md`)가 먼저 확정되고 구현되어야 합니다.
3.  **리뷰 및 병합:** 각 Task 완료 시 AI 검증 규칙(`ai-validation-rules.md`)을 준수하여 PR을 생성하고 리뷰를 진행합니다.
