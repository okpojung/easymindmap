# easymindmap — MVP Scope

**최종 업데이트:** 2026-03-31

## MVP 정의 기준

> MVP는 "쓸 수 있는 최소 제품"이다.  
> 화려함보다 핵심 플로우(작성 → 저장 → Export)가 완전히 동작하는 것을 우선한다.

---

## MVP 포함 범위

### 1. 인증
- 이메일 + 비밀번호 회원가입
- 로그인 / 로그아웃 (JWT)
- 인증 없이는 편집기 접근 불가

### 2. 맵 관리
- 새 맵 생성
- 맵 목록 조회
- 맵 삭제 (soft delete)
- 맵 제목 수정

### 3. 에디터 코어
- 루트 노드 자동 생성
- 자식 노드 추가 (키보드 단축키 포함)
- 노드 텍스트 인라인 편집
- 노드 삭제
- 노드 drag & drop 이동
- 노드 접기 / 펼치기 (collapse/expand)
- 노드 단위 layoutType 설정
  - 방사형: radial-bidirectional (기본), radial-right, radial-left
  - 트리형: tree-up, tree-down, tree-right, tree-left
  - 계층형: hierarchy-right, hierarchy-left
  - 진행트리: process-tree-right, process-tree-left, process-tree-right-a/b
  - 자유배치: freeform
  - **보드형: kanban** ← 3레벨 제한 (board / column / card)
- 노드 추가 인디케이터 (4방향 + 버튼 UI, NODE-IND-01~04)
- 노드 배경 이미지 설정 (preset / 직접 업로드, MVP: style_json 통합 저장)
- 노드 노트 (structured note: paragraph / code_block / warning / checklist)

### 4. 실시간 자동 저장
- 텍스트/스타일 변경: 800ms debounce 저장
- 노드 생성 / 삭제 / 이동: 즉시 저장 (0ms)
- 저장 중 / 저장 완료 UI 표시
- 저장 실패 시 재시도 + 로컬 큐 보존

### 5. Export
- Markdown Export (헤더 계층 구조)
- Standalone HTML Export (단독 실행 가능 파일)
- Publish URL 생성 (`/p/{id}` 형태)

### 6. AI 마인드맵 생성
- 질문 텍스트 입력
- LLM API 호출 → Markdown 계층 구조 응답
- 자동으로 에디터에 노드 트리 반영

### 7. Tag / Search
- 노드 태그 추가 / 삭제 / 필터
- 텍스트 및 태그 기반 노드 검색

### 8. Canvas 조작
- Zoom In / Out, Fit Screen, 100% View, Fullscreen
- Pan Canvas, Center Node, Focus Node View

---

## MVP 제외 범위

| 제외 항목 | 이유 / 예정 단계 |
|-----------|------|
| 실시간 협업 | 인프라 난도 높음 → V1 |
| 댓글 / 코멘트 | V1 |
| 버전 히스토리 UI | V1 |
| 팀 워크스페이스 | V1 |
| AI 실행형 절차 (Workflow) | 단독 편집 모드 전용 고급 기능 → V1.5 |
| 소셜 로그인 | V1 |
| 다국어 자동 번역 | V2 |
| 대시보드 맵 | V3 |
| 모바일 최적화 | V2 이후 |
| 오프라인 모드 | V3 |

---

## 핵심 결정 사항 (고정값)

| 항목 | 결정 |
|------|------|
| 제품 방향 | 개인용 우선 → 팀용 확장 |
| AI 생성 방식 | 1회 생성형 (질문 1개 → 맵 1개), MVP 단계 |
| AI Workflow | step 기반 실행형 절차 생성 — V1.5 단계 (단독 편집 모드 전용) |
| HTML Export | 정적 + 인터랙티브 viewer 포함 |
| 렌더링 방식 | SVG 기반 자체 엔진 |
| 저장 방식 | 스냅샷 + patch 로그 병행 |
| Kanban | 3레벨(board/column/card) 제한 보드형 레이아웃, MVP 포함 |
| 최대 노드 깊이 | depth ≤ 50 (ltree 물리 한계 내 운영 제한) |
| Autosave 타이밍 | 텍스트/스타일 800ms debounce, 구조 변경 0ms 즉시 |
