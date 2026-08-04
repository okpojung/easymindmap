# easymindmap — MVP Scope

**최종 업데이트:** 2026-08-04 (구현 현행화 — 실제 동작 기준으로 정정)

> **v1.2 변경 사항 (2026-08-04)**
> - 실제 구현 기준으로 전면 정정: 레이아웃 9종(+시간배치), Kanban 깊이 제한
>   없음, 노트 블록 4종(table 포함·warning/tip 폐기), 자동 저장=스냅샷 1.5초,
>   퍼블리시 → V1, 다크모드·버전 히스토리 = 구현 완료, Guest 모드 추가
> **v1.1 변경 사항 (2026-05-07)**
> - 노드 노트 / 링크 / 첨부파일: **MVP로 상향 조정**
> - 노드 배경 이미지: **MVP 제외 범위로 이동 (V1)**

## MVP 정의 기준

> MVP는 "쓸 수 있는 최소 제품"이다.  
> 화려함보다 핵심 플로우(작성 → 저장 → Export)가 완전히 동작하는 것을 우선한다.

---

## MVP 포함 범위

### 1. 인증
- 이메일 + 비밀번호 회원가입
- 로그인 / 로그아웃 (Supabase Auth JWT) + 비밀번호 표시(👁) 토글
- 인증이 켜진 배포에서는 로그인 게이트 통과 필요 — 단 **Guest 모드**로
  서버 저장 없이 로컬 체험 가능 (서버 저장/문서함/첨부/API 키 AI 차단)
- SNS 로그인(카카오/네이버/Google)은 버튼 자리만 — '준비 중'

### 2. 맵 관리
- 새 맵 생성
- 맵 목록 조회
- 맵 삭제 (soft delete)
- 맵 제목 수정 / 다른 이름으로 저장
- 문서함: 폴더(map_folders) 트리 + 목록 정렬

### 3. 에디터 코어
- 루트 노드 자동 생성 (삭제·이동 불가, `collapsed` 불가)
- 자식 노드 추가 (키보드 단축키 포함)
- 노드 텍스트 인라인 편집
- 노드 삭제
- 노드 drag & drop 이동
- 노드 접기 / 펼치기 (collapse/expand)
- 노드 최대 깊이: depth ≤ 50 권장 (DB CHECK 제약은 미적용 — 앱 레벨 관리)
- 노드 단위 layoutType 설정 — **UI 노출 9종** (kebab-case 영문 소문자,
  타입 유니언의 단일 원본: `packages/emm-parser/src/model.ts`)
  - 방사형: radial-bidirectional (양쪽, 중심 전용), radial-right (오른쪽)
  - 트리형: tree-right (오른쪽), tree-down (아래, 중심 전용)
  - 계층형: hierarchy-right
  - 진행트리: process-tree-right
  - 시간배치: timeline (타임라인, 중심 전용)
  - 보드형: kanban (중심 전용) — 컬럼/카드 + 깊은 서브트리는 중첩 카드로
    표시 (**깊이 제한 없음**)
  - 자유배치: freeform
- 노드 추가 인디케이터 (4방향 + 버튼 UI, NODE-IND-01~04 / NODE-13)
- 노드 노트 (structured note: paragraph / code_block / **table** / checklist —
  'warning'·'tip'은 v1.1에서 폐기, 문단으로 하위호환 렌더)
- 노드 링크: URL 첨부 (문서 스냅샷 내 links)
- 노드 첨부파일: 맵 내장(합계 10MB) + 초과분 서버 저장소 우회, 사용자 쿼터
- 스타일: fillColor / borderColor / textColor / fontSize / fontWeight / fontStyle / borderWidth / borderStyle / shapeType(7종)
- 스타일 상속: 노드 생성 시 부모 style 기본 복사, depth별 기본 fontSize 자동 적용

### 4. 자동 저장 · 히스토리 · 편집 잠금
- 서버 맵에 연결된 문서는 편집이 멎고 1.5초 뒤 문서 스냅샷 자동 저장
  (`PUT /maps/:id/document`) — 무변경 저장은 스킵(버전 미생성)
- 저장 중 / 저장 완료 상태 배지 표시 (자동 재시도·로컬 큐는 없음)
- 저장 시점마다 버전 히스토리 생성 (히스토리 패널에서 조회·새 탭 열기,
  첨부 개수·용량 표시)
- 단일 세션 편집 잠금 — 다른 세션에서 편집 중이면 읽기 전용 + 사본 저장

### 5. Export
- Markdown Export (EMM 메타데이터 포함, 헤더 계층 구조)
- Standalone HTML Export (단독 실행 가능 뷰어 파일)
- 첨부/사진 포함 시 자동 ZIP (파일 + files/)
- Import: Markdown / HTML / ZIP

### 6. AI 마인드맵 생성 (서버 LLM 없음 — 2모드)
- ① API 키 모드: 사용자 API 키(OpenAI/Anthropic/Gemini)로 브라우저에서
  직접 호출 — 모델 선택, 실시간 모델 목록
- ② 웹 AI 클립보드 모드: 프롬프트 복사 → 웹 AI(ChatGPT 등)에 붙여넣기 →
  답변 붙여넣기 → 맵 변환 (EasyMindMap Copilot GPT 바로가기 제공)
- EMM 프롬프트 템플릿 v4 (헤딩 6레벨, 블록=노드 본문)
- 새 맵 생성 + 선택 노드 자세히 확장 (경로 맥락·프로젝트 지침)

### 7. Tag / Search
- 노드 태그 추가 / 삭제 / 필터
- 텍스트 및 태그 기반 노드 검색

### 8. Canvas 조작
- Zoom In / Out, Fit Screen, 100% View, Fullscreen
- Pan Canvas, Center Node, Focus Node View

---

## MVP 제외 범위

| 제외 항목 | 이유 / 예정 단계 |
|-----------|---------|
| 노드 배경 이미지 (IMG-01~20) | 코어 편집기 안정화 후 적용 → V1 |
| 실시간 협업 초대·동기화 (COLLAB-01~06) | 인프라 난도 높음 → V1 |
| 커서 공유 / Soft Lock (COLLAB-07~09) | → V2 |
| 협업 채팅 (CHAT-01~05) | → V2 |
| Node Thread (COLLAB-10~13) | → V2 |
| AI 협업 요약·작업 추출 (COLLAB-14~15 / AI-03~05) | → V3 |
| 댓글 / 코멘트 | V1 |
| 팀 워크스페이스 | V1 |
| 퍼블리시 (공개 URL, PUBL-01~04) | → V1 |
| WBS 모드 + Redmine 연동 (WBS-01~05 / RDMN-01~08) | → V1 |
| 리소스 할당 (RES-01~05) | → V1 |
| Obsidian 연동 (OBS-01~05) | → V1 (OBS-01~02 기본 import/export는 MVP 부분 포함) |
| 노드 배경 이미지 (IMG-01~20) | 구현 연동 부하 중간 수준 → V1 |
| AI 실행형 절차 (Workflow, WFLOW-01~12) | 단독 편집 모드 전용 고급 기능 → V1.5 |
| 소셜 로그인 (카카오/네이버/Google) | 버튼 자리만 노출('준비 중'), 동작은 V1 |
| 다국어 자동 번역 (TRANS-01~11) | → V2 |
| 대시보드 맵 (DASH-01~05) | → V3 |
| 사용자 설정 고급 기능 (SETT-03 번역 설정, SETT-07 API Key) | → V2/V3 |
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
| 저장 방식 | 문서 스냅샷(map_documents) + 저장 시점 버전 히스토리 + 편집 잠금 |
| Kanban | 컬럼/카드 보드형(깊은 서브트리는 중첩 카드, 깊이 제한 없음), MVP 포함 |
| 노드 노트 / 링크 / 첨부파일 | MVP 포함 (노드 콘텐츠 확장의 핵심) |
| 노드 배경 이미지 | V1 포함 (구현 부하 고려) |
| 최대 노드 깊이 | depth ≤ 50 권장 (DB 제약 미적용 — 앱 레벨 관리) |
| Autosave 타이밍 | 편집 멈춤 1.5초 디바운스, 전체 스냅샷 (무변경 스킵) |
| 다크모드 (SETT-02) | 구현 완료 — 툴바 토글, localStorage 유지 |
