# easymindmap — PRD (Product Requirement Document)

## 1. Product Overview

| 항목 | 내용 |
|------|------|
| 제품명 | easymindmap |
| 서비스 도메인 | mindmap.ai.kr |
| 제품 유형 | 웹 기반 온라인 마인드맵 플랫폼 |
| 개발 방식 | AI 100% 보조 개발 |

---

## 2. Target Users

### Primary Users
- 개인 지식 관리 사용자 (PKM)
- 기획자, 연구자, 개발자, 학생

### Secondary Users
- 팀 협업 사용자
- 교육 기관

---

## 3. Core Features

### 3.1 Mindmap Editor
웹 브라우저에서 마인드맵 작성 및 편집

- 노드 생성 / 수정 / 삭제
- 노드 drag & drop 이동
- 노드 단위 레이아웃 설정 (map / graphic / tree)
- subtree 접기 / 펼치기
- 키보드 단축키 지원
- Undo / Redo

### 3.2 Node Layout System
각 노드마다 독립적으로 하위 전개 방식 설정 가능

```
layoutType: "radial-bidirectional"  // 방사형 양쪽
layoutType: "tree-right"            // 트리형 오른쪽
layoutType: "tree-down"             // 트리형 아래쪽
layoutType: "hierarchy-right"       // 계층형 오른쪽
layoutType: "freeform"              // 자유배치형
```

### 3.3 Real-time Autosave
편집 중 실시간 DB 저장

| 이벤트 | 저장 방식 |
|--------|-----------|
| 텍스트 변경 | 1초 debounce 후 저장 |
| 노드 이동 | 즉시 저장 |
| 노드 생성 / 삭제 | 즉시 저장 |
| 레이아웃 변경 | 즉시 저장 |

### 3.4 Export 기능

**Markdown Export**
```markdown
# Root Topic
## Child Topic
### Sub Topic
```

**Standalone HTML Export**
- 단일 HTML 파일
- JavaScript / CSS 인라인 포함
- 오프라인 실행 가능
- 웹서버 업로드 후 퍼블리싱 가능

### 3.5 AI Mindmap Generation
```
사용자 질문 입력
→ LLM API 호출
→ Markdown 계층 구조 응답
→ Node Tree 변환
→ Editor 자동 반영
```

### 3.6 Publish
- Export HTML을 서비스에서 즉시 퍼블리싱
- 고유 URL 생성: `https://mindmap.ai.kr/p/{id}`
- 읽기 전용 공개 뷰어

---

## 4. Non-Functional Requirements

| 항목 | 요구사항 |
|------|----------|
| 저장 지연 | 편집 → 저장 완료까지 2초 이내 |
| Editor 초기 로딩 | 3초 이내 |
| 대형 맵 | 노드 500개 이상에서도 부드러운 편집 |
| 보안 | JWT 인증 / HTTPS 강제 / XSS 방어 |
| 브라우저 지원 | Chrome, Firefox, Safari, Edge 최신 버전 |

---

## 5. Success Metrics

| Metric | Target |
|--------|--------|
| Daily Active Users | 1,000 |
| Map Created | 500 / day |
| AI Mindmap Generation | 200 / day |
| Export 완료율 | 90% 이상 |

---

## Product Positioning (Updated)

easymindmap은 단순한 아이디어 정리 도구가 아니라,
AI를 활용하여 실제 작업 절차를 생성하고 실행하며 정제하는 도구이다.

### 기존 정의
- Mindmap 기반 아이디어 정리 도구

### 확장 정의
- AI 기반 실행형 절차 관리 도구 (AI-powered Executable Workflow Tool)

### 핵심 특징

- AI가 작업 절차를 step 기반으로 생성
- 사용자가 step을 실제 실행
- 오류 발생 시 해당 step에서 해결
- 최종적으로 정제된 절차만 유지
- 실행 가능한 문서(runbook/playbook) 생성

> 상세 정의: `docs/01-product/AI-Executable-Workflow-PRD.md`

---

## Key Differentiators

### 기존 Mindmap 도구
- 정적 정보 구조화
- 아이디어 정리 중심

### easymindmap (확장 기능 포함)
- 구조 생성 + 실행 지원
- step 기반 진행
- 오류 해결 통합
- 절차 정제 (cleanup)
- note 내 code block + copy 기능

---

## 6. 향후 기능 (Out of MVP)

- 실시간 협업 (WebSocket + CRDT)
- 댓글 / 코멘트
- 버전 히스토리 UI
- 팀 워크스페이스
- 소셜 로그인
- AI 대화형 확장 (노드 선택 후 AI 하위 확장)
- Obsidian extension 연동
- Redmine 연동
