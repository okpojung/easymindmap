# easymindmap — Frontend UI 설계서 v1.1

> 병합: 전체 화면구조/컴포넌트 설계 + 화면별 상세 명세(라우트/API/상태) 통합  
> 최종 업데이트: 2026-03-27

---

## 1. 목적

이 문서는 easymindmap 웹 애플리케이션의  
화면 구성, UI 구조, UX 규칙, 컴포넌트 구조를 정의한다.

**목표:**
- 개발 초기부터 구조 흔들림 방지
- 컴포넌트 설계 기준 확정
- UX 일관성 확보
- AI / 협업 / 레이아웃 기능 확장 대비

---

## 2. 전체 화면 구조 (IA)

### 2.1 화면 목록

| 화면 | 화면ID | 경로 | 설명 | 인증 | 우선순위 |
|------|--------|------|------|------|----------|
| Dashboard | SCR-03 | `/dashboard` | 맵 목록 / 생성 / 템플릿 | ✅ | ⭐⭐⭐ |
| Editor | SCR-04 | `/editor/:mapId` | 마인드맵 편집 핵심 화면 | ✅ | ⭐⭐⭐⭐⭐ |
| Login | SCR-01 | `/login` | 로그인 | ❌ | ⭐⭐⭐ |
| Signup | SCR-02 | `/signup` | 회원가입 | ❌ | ⭐⭐⭐ |
| Published Viewer | SCR-05 | `/p/:publishId` | 퍼블리시 읽기 전용 뷰어 | ❌ | ⭐⭐ |

---

## 3. 화면별 상세 명세

### SCR-01 — 로그인

**목적**: Supabase Auth 기반 이메일/비밀번호 로그인

#### 레이아웃
```
[로고]
[이메일 입력]
[비밀번호 입력]
[로그인 버튼]
[회원가입 링크]
```

#### 사용자 액션 & API
| 액션 | API | 성공 | 실패 |
|------|-----|------|------|
| 로그인 버튼 클릭 | POST /auth/login | → `/dashboard` 이동 | 인라인 오류 표시 |

#### 상태
- **빈 상태**: 입력 필드 비어있음
- **로딩**: 버튼 spinner + 비활성화
- **오류**: "이메일 또는 비밀번호가 올바르지 않습니다" 인라인 표시

---

### SCR-02 — 회원가입

**목적**: Supabase Auth 신규 계정 생성

#### 레이아웃
```
[로고]
[이메일 입력]
[비밀번호 입력]
[비밀번호 확인]
[가입하기 버튼]
[로그인 링크]
```

#### 유효성 검사
- 이메일: 형식 검증
- 비밀번호: 8자 이상, 영문 + 숫자 포함
- 비밀번호 확인: 일치 여부

#### 상태
- **로딩**: 버튼 spinner
- **성공**: 대시보드 자동 이동
- **오류 (중복 이메일)**: "이미 사용 중인 이메일입니다"

---

### SCR-03 — 대시보드

**목적**: 내 맵 목록 관리 + 새 맵 생성

#### 레이아웃
```
[상단 헤더]
  로고 | [새 맵 만들기 버튼] | [사용자 메뉴]

[맵 그리드]
  [맵 카드] [맵 카드] [맵 카드] ...
  각 카드: 맵 제목 / 수정일 / [열기] [삭제] 메뉴
```

#### 맵 카드 구성
- 썸네일 (없으면 기본 아이콘)
- 맵 제목
- 마지막 수정 시각 (상대 시간: "3분 전")
- 우클릭 / 케밥 메뉴: 이름 변경 / 삭제

#### 사용자 액션 & API
| 액션 | API |
|------|-----|
| 새 맵 만들기 | POST /maps → `/editor/:mapId` 이동 |
| 맵 카드 클릭 | GET /maps/:mapId → 에디터 이동 |
| 이름 변경 | PATCH /maps/:mapId |
| 삭제 | DELETE /maps/:mapId (확인 다이얼로그) |

#### 상태
- **빈 상태**: "아직 맵이 없습니다. 새 맵을 만들어보세요" + 버튼
- **로딩**: 카드 스켈레톤 UI
- **오류**: "맵 목록을 불러올 수 없습니다. 새로고침 해주세요"

---

### SCR-04 — 에디터

**목적**: 마인드맵 작성 / 편집 / 저장 / Export / AI 생성

#### 4.1 전체 레이아웃

```
┌──────────────────────────────────────────────────────────────┐
│ Top Toolbar                                                  │
├───────────────┬───────────────────────────────┬──────────────┤
│ Left Sidebar  │        Infinite Canvas        │ Right Panel  │
│               │        (Mindmap Area)         │  (Inspector) │
├───────────────┴───────────────────────────────┴──────────────┤
│ Bottom Status Bar                                            │
└──────────────────────────────────────────────────────────────┘
```

#### 4.2 Top Toolbar (글로벌 컨트롤)

| 컴포넌트 | 기능 |
|----------|------|
| 로고 / 맵 이름 | 맵 제목 클릭 시 인라인 수정 |
| Undo / Redo | Ctrl+Z / Ctrl+Y |
| Layout 선택 | 레이아웃 드롭다운 |
| AI 생성 버튼 | AI 패널 토글 |
| 협업 (Share) | 공유 다이얼로그 (V1~) |
| Export | Markdown / HTML 드롭다운 |
| 사용자 메뉴 | 프로필 / 로그아웃 |
| 저장 상태 표시 | 아래 규칙 참고 |

> 항상 고정 (sticky), autosave 상태 포함

**저장 상태 표시 규칙:**

| 상태 | 표시 텍스트 | 색상 |
|------|-------------|------|
| 저장 완료 | "저장됨 · 방금 전" | 회색 |
| 저장 중 | "저장 중..." | 파란색 |
| 저장 실패 | "저장 실패 — 재시도 중" | 빨간색 |
| 미저장 변경 | "변경사항 있음" | 주황색 |

#### 4.3 Left Sidebar (탐색 영역)

탭 구조:
- **Outline** — 트리 구조로 전체 맵 탐색
- **Search** — 노드 텍스트 / 태그 검색
- **Templates** — 템플릿 선택
- **History** — 버전 이력 (V1~)

> 큰 맵에서 탐색 문제 해결. drag로 위치 이동 가능 (향후)

#### 4.4 Center Canvas (핵심 영역)

- 무한 캔버스 (SVG 기반 렌더링)
- Pan / Zoom
- Node 렌더링 + Edge 렌더링
- Subtree layout 적용
- Multi-select / Drag & Drop

**Canvas 인터랙션:**
- Mouse wheel: Zoom In/Out
- Space + Drag: Pan
- 빈 영역 클릭: 선택 해제
- 노드 싱글 클릭: 선택 + 노드 추가 인디케이터 표시
- 노드 더블클릭: 텍스트 편집 모드

> GPU 기반 렌더링 고려 / viewport store 분리 필수

#### 4.5 Right Panel — Inspector

선택된 노드/브랜치 속성 편집 (선택 기반 dynamic panel)

탭 구조: Style / Layout / Content / Note · Tag / AI / Translation(V2~)

```
[Node Properties]
─────────────────
텍스트:  [______]
노트:    [______] (멀티라인)

도형:    [○ ○ ○ ○ ○]
배경색:  [Color Picker]
텍스트색:[Color Picker]

레이아웃: [Dropdown]
  ├ 방사형-양쪽       ├ 트리형-오른쪽
  ├ 방사형-오른쪽     ├ 계층형-오른쪽
  ├ 트리형-아래쪽     └ 자유배치형
  └ 진행트리-오른쪽

태그: [Tag1] [Tag2] [+ 추가]
```

#### 4.6 Bottom Status Bar

표시: zoom % / autosave 상태 / collaborator 수(V1~) / 현재 layout type / 커서 좌표

#### 4.7 노드 컨텍스트 메뉴 (우클릭)

```
⬆ 부모 노드 추가
⬇ 자식 노드 추가         (Space)
⬅ 형제 노드 추가 (이전)  (LShift+Ctrl+Space)
➡ 형제 노드 추가 (다음)  (LShift+Space)
다중 자식 추가            (Ctrl+Space)
────────────────────────────────
복사 (Ctrl+C) / 붙여넣기 (Ctrl+V) / 복제 (Ctrl+D)
────────────────────────────────
이 노드를 화면 중앙으로  (Ctrl+Enter)
이 노드부터 보기 (Focus) (Alt+F)
────────────────────────────────
레이아웃 변경 ▶ / 태그 추가 / 링크 추가
────────────────────────────────
노드 삭제 (Delete)
```

#### 4.8 AI 패널 (우측 슬라이드)

```
[AI로 마인드맵 생성]
질문 입력 → [최대 depth: 3 ▾] → [생성하기]
[최근 생성 기록]
```

| 상태 | 표시 |
|------|------|
| 생성 중 | spinner + "AI가 마인드맵을 생성하고 있습니다..." |
| 성공 | 에디터 자동 반영 |
| 실패 | "AI 생성에 실패했습니다. 다시 시도해주세요" |

#### 4.9 Export 모달

```
○ Markdown (.md) — 헤더 계층 구조
○ Standalone HTML (.html) — 단독 실행, 웹 퍼블리싱 가능
[내보내기] [취소]
또는 [퍼블리시 URL 생성] → https://mindmap.ai.kr/p/...
```

---

### SCR-05 — 퍼블리시 뷰어

**목적**: 퍼블리싱된 맵을 외부 사용자가 읽기 전용으로 조회

```
[맵 제목]                    [easymindmap 로고 & 링크]
[Canvas — 읽기 전용]
[Zoom -] [Fit] [Zoom +]
```

- 편집 불가 (클릭 선택만 가능) / 로그인 불필요
- URL: `https://mindmap.ai.kr/p/{publishId}`
- Standalone HTML export와 동일한 뷰어 컴포넌트 재사용

---

## 4. 사용자 흐름 (핵심 UX Flow)

```
기본:   맵 생성 → 노드 추가 → 편집 → 스타일링 → 저장 → 공유

노드:   노드 클릭 → 인디케이터(+버튼) → 방향 클릭 → 새 노드 + 편집 모드
        노드 선택 → Space → 자식 / LShift+Space → 형제

AI:     AI 버튼 → 프롬프트 입력 → 생성 → [새 맵 or 현재 맵에 삽입]

협업:   Share → 링크 생성 → 사용자 접속 → 실시간 반영  (V1~)
```

---

## 5. 키보드 단축키 전체

| 단축키 | 기능 |
|--------|------|
| Space | 자식 노드 추가 |
| LShift + Space | 형제 노드 추가 (다음) |
| LShift + Ctrl + Space | 형제 노드 추가 (이전) |
| Ctrl + Space | 다중 자식 추가 |
| Double Click | 텍스트 편집 모드 |
| Delete | 노드 삭제 |
| Drag | 노드 이동 |
| Ctrl+C / V / D | 복사 / 붙여넣기 / 복제 |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+= | Zoom In |
| Ctrl+- | Zoom Out |
| Ctrl+Shift+F | Fit Screen |
| Ctrl+0 | 100% View |
| Ctrl+Enter | Center Node |
| F11 / Ctrl+Shift+F11 | Fullscreen 전환 |
| Alt+F | Focus Node View |
| H | Pan 모드 토글 |
| / | 명령 팔레트 |
| Escape | 편집 취소 / 선택 해제 / 모드 종료 |

---

## 6. 컴포넌트 구조

```
AppShell
├── TopToolbar
├── LeftSidebar
├── RightInspector (Inspector Tabs)
├── BottomStatusBar
└── CanvasArea
    └── MindMapCanvas
        ├── NodeRenderer
        │   ├── NodeContent
        │   ├── NodeAddIndicator  ← 4방향 + 버튼
        │   ├── NodeEditor
        │   ├── NodeMenu
        │   └── NodeHandle
        ├── EdgeRenderer
        ├── SelectionLayer
        ├── ViewportController
        └── InteractionLayer

Overlays:
├── AIModal
├── ShareDialog
├── ExportDialog
└── CommandPalette
```

---

## 7. 상태관리 (Zustand 5-Store)

> 상세: `docs/dev/frontend-architecture.md`

| Store | 담당 |
|-------|------|
| Document Store | 맵 원본 데이터 (노드 트리) |
| Editor UI Store | 패널 / 모달 / active tool |
| Viewport Store | zoom / pan / canvas bounds |
| Interaction Store | drag / selection / 편집 draft |
| Autosave Store | dirty flag / patches / 저장 상태 |

---

## 8. 디자인 시스템 방향

- **스타일**: 생산성 중심 / 미니멀 / 캔버스 우선
- **색상**: Neutral base + 1 primary color / node 색상은 의미 기반
- **UI 원칙**: 캔버스 최대화 / 패널 접기·펼치기 / context-driven / 클릭 최소화

---

## 9. 공통 UX 규칙

| 항목 | 규칙 |
|------|------|
| 로딩 | 300ms 이상 spinner / 스켈레톤 UI 활용 |
| 오류 | 네트워크 오류 Toast / 인증 만료 → 자동 리다이렉트 |
| 반응형 | MVP: 데스크톱 우선 (1280px+) / 모바일: V1 이후 |
| 다크모드 | V1 이후 |

---

## 10. MVP 구현 범위

**포함**: editor layout 4영역 / 노드 CRUD / 노드 추가 인디케이터 / layout / autosave / undo·redo / style / canvas CANVAS-01~08 / export / AI 생성

**제외 (후순위)**: 협업(V1) / 다국어(V2) / 대시보드맵(V3) / 모바일(V1)

---

## 11. 다음 단계

1. React + Vite 프로젝트 생성
2. 폴더 구조 반영 (`docs/dev/frontend-architecture.md` 참고)
3. AppShell 구현
4. Canvas skeleton 구현
5. Node 1개 렌더링
6. NodeAddIndicator 구현
7. Zustand 5-Store 뼈대 구현
