# easymindmap — MVP Scope

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
- 노드 단위 layoutType 설정 (최소: radial-bidirectional, tree-right, tree-down)

### 4. 실시간 자동 저장
- 텍스트 변경 후 1초 debounce 저장
- 노드 생성 / 삭제 / 이동 시 즉시 저장
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

---

## MVP 제외 범위

| 제외 항목 | 이유 |
|-----------|------|
| 실시간 협업 | 인프라 난도 높음 → Phase 3 |
| 댓글 / 코멘트 | Phase 2 |
| 버전 히스토리 UI | Phase 2 |
| 팀 워크스페이스 | Phase 2 |
| AI 대화형 확장 | Phase 2 이후 |
| 소셜 로그인 | Phase 2 |
| 모바일 최적화 | Phase 2 |
| 오프라인 모드 | Phase 3 |

---

## 핵심 결정 사항 (고정값)

| 항목 | 결정 |
|------|------|
| 제품 방향 | 개인용 우선 → 팀용 확장 |
| AI 생성 방식 | 1회 생성형 (질문 1개 → 맵 1개) |
| HTML Export | 정적 + 인터랙티브 viewer 포함 |
| 렌더링 방식 | SVG 기반 자체 엔진 |
| 저장 방식 | 스냅샷 + patch 로그 병행 |
