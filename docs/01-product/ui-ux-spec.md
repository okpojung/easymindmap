# easymindmap — Frontend UI 설계서 v1.1

> 병합: 전체 화면구조/컴포넌트 설계 + 화면별 상세 명세(라우트/API/상태) 통합  
> 최종 업데이트: 2026-04-16  
> 변경 이력: 2026-04-16 — 협업 UI (V1) 섹션 추가, 번역 인디케이터 (V2) 섹션 추가, Kanban 보드 UI 섹션 추가, Dashboard 모드 UI (V3) 섹션 추가, NODE-IND-01~04 인디케이터 UI 명세 보강, 참조 문서 경로 정정

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

탭 구조: Style / Layout / Content / Note · Tag / AI / Translation(V2~) / Collaboration(V1~)

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


#### 4.5-1 Collaboration UI (V1~)

> 기능 명세: `functional-spec.md § 19-COLLAB`, 상세 설계: `docs/04-extensions/collaboration/25-map-collaboration.md`

**V1 — 협업 참여자 아바타 + Soft Lock 표시**

협업 참여자 아바타는 Top Toolbar와 Bottom Status Bar 두 곳에 표시한다.

```
[Top Toolbar — 협업 참여자 영역]
  [아바타(김철수)] [아바타(Jane)] [아바타(Sato)] +2
  → 최대 3개 아바타 표시, 초과 시 "+N" 표시
  → 각 아바타에 협업자 이름 tooltip

[Bottom Status Bar]
  zoom % | 저장 상태 | 접속자 수(예: 협업자 3명) | layout type | 커서 좌표
```

**Soft Lock UI (V1, TTL 5초)**

편집 중인 노드는 편집자 색상의 테두리로 표시된다.

```
[노드 — Soft Lock 활성]
  ┌──────────────────┐  ← 편집자 색상 테두리 (2px solid)
  │  결제 API         │
  │  ✏ 김철수 편집 중 │  ← 편집자 이름 + 아이콘 badge
  └──────────────────┘

규칙:
- 다른 사용자가 Soft Lock 노드 편집 시도 → 경고 툴팁 표시 ("김철수님이 편집 중입니다")
- TTL 5초 경과 후 자동 해제 (비활동 감지)
- 편집 완료(blur) 즉시 해제
```

**협업 초대 UI (V1)**

```
[Top Toolbar — Share 버튼 클릭]
  ┌─────────────────────────────────────┐
  │  맵 공유 및 협업                      │
  ├─────────────────────────────────────┤
  │  이메일로 초대:                       │
  │  [user@example.com         ] [초대]  │
  │                                     │
  │  편집 범위(Scope):                   │
  │  ○ 전체 맵   ○ 레벨 지정   ○ 노드 지정│
  ├─────────────────────────────────────┤
  │  현재 협업자 (2명):                   │
  │  [아바타] 김철수  편집자  [제거]       │
  │  [아바타] Jane    편집자  [제거]       │
  └─────────────────────────────────────┘
```

#### 4.5-2 Collaboration Panel — 채팅 (V2~)

협업 채팅은 **기본적으로 닫힌 우측 보조 패널**로 제공한다.  
상시 노출되는 메신저가 아니라, 편집 집중도를 해치지 않는 **라이브 협업 패널**로 취급한다.

```
[Collaboration]
[참여자 3]  [Map Chat] [Node Thread]
────────────────────────────────
● 김철수   ● Jane   ● Sato

[Map Chat]
- 최근 메시지 30~50개 유지
- 패널이 닫혀 있을 때는 상단에 작은 점만 표시
- unread count / read receipt 없음

[Node Thread]
[Node: 결제 API]
💬 댓글(3)
- 해당 node 문맥의 대화만 표시
- 메시지 클릭 시 canvas가 해당 node로 zoom/focus
- node에 💬 아이콘 + 댓글 수 badge 표시

[AI 요약] [작업 추출] [작업 노드 생성]
→ AI 결과는 즉시 반영하지 않고 preview panel에 먼저 표시
```

**UX 규칙**
- 채팅 패널 기본 상태: 닫힘
- 패널이 열려 있으면 새 메시지 시 하이라이트 또는 자동 스크롤
- 패널이 닫혀 있으면 toolbar / side toggle에 작은 점(dot)만 표시
- 네트워크 재연결 시 최근 20~50개 메시지 재수신
- Node Thread는 일반 Map Chat과 분리된 탭/뷰로 제공
- AI 버튼은 Node Thread 문맥에서만 활성화되며, 다중 사용자 협업 중에도 **preview 생성까지만 허용**하고 문서 반영은 명시적 승인 시에만 수행

#### 4.6 Bottom Status Bar

표시: zoom % / autosave 상태 / collaborator 수(V1~) / 현재 layout type / 커서 좌표 / 새 메시지 dot 상태(V2~)

> V1부터 협업자 아바타가 Bottom Status Bar에도 인원 수로 표시된다 (`협업자 3명`).  
> V2부터 채팅 패널 새 메시지 dot 표시 추가.

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
레이아웃 변경 ▶ / 태그 추가 / 링크 추가 / 노드 토론 열기
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
│   └── CollabAvatarBar          ← [V1] 협업 참여자 아바타
├── LeftSidebar
├── RightInspector (Inspector Tabs)
│   └── CollabPanel              ← [V2] 채팅 패널 (닫힘 기본)
├── BottomStatusBar
└── CanvasArea
    └── MindMapCanvas
        ├── NodeRenderer
        │   ├── NodeContent
        │   ├── NodeAddIndicator  ← 4방향 + 버튼 (NODE-IND-01~04)
        │   ├── NodeEditor
        │   ├── NodeMenu
        │   ├── NodeHandle
        │   ├── SoftLockOverlay   ← [V1] Soft Lock 테두리 + 이름 badge
        │   └── TranslationBadge  ← [V2] 번역 상태 아이콘 (NODE-14)
        ├── EdgeRenderer
        ├── SelectionLayer
        ├── ViewportController
        ├── InteractionLayer
        └── CollabCursorOverlay   ← [V2] 협업자 커서

Overlays:
├── AIModal
├── ShareDialog                   ← [V1] 협업 초대 UI 포함
├── ExportDialog
├── CommandPalette
└── DashboardRefreshBadge         ← [V3] 대시보드 갱신 상태 badge
```

---

## 7. 상태관리 (Zustand 5-Store)

> 상세: `docs/05-implementation/frontend-architecture.md`

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

## 10. 노드 인디케이터 UI 상세 (NODE-IND-01~04)

> 기능 명세: `functional-spec.md § 2-2`  
> 상세 설계: `docs/03-editor-core/node/02-node-editing.md`

노드를 싱글 클릭하면 4방향으로 `+` 아이콘이 표시된다. 방향에 따라 노드 추가 위치가 결정된다.

```
              [ + ]  ← ⬆ NODE-IND-01: 부모 노드 삽입 (기존 부모 사이에 중간 삽입)
                │
  [ + ] ─── [선택노드] ─── [ + ]
  ⬅ NODE-IND-03                ➡ NODE-IND-04
  형제(이전)                   형제(다음)
                │
              [ + ]  ← ⬇ NODE-IND-02: 자식 노드 추가 (마지막 자식으로)
```

| ID | 방향 | 동작 | 비활성 조건 |
|---|:---:|---|---|
| NODE-IND-01 | ⬆ 상 | 선택 노드와 기존 부모 사이에 부모 노드 중간 삽입 | Root 노드에서 비활성 |
| NODE-IND-02 | ⬇ 하 | 선택 노드의 마지막 자식으로 자식 노드 추가 | — |
| NODE-IND-03 | ⬅ 좌 | 선택 노드 바로 앞(이전)에 형제 노드 삽입 | Root 노드에서 비활성 |
| NODE-IND-04 | ➡ 우 | 선택 노드 바로 뒤(다음)에 형제 노드 삽입 | Root 노드에서 비활성 |

**인디케이터 표시/숨김 규칙**

| 이벤트 | 결과 |
|---|---|
| 노드 싱글 클릭 | 인디케이터 표시 |
| 빈 캔버스 클릭 | 숨김 |
| ESC | 숨김 |
| 텍스트 편집 모드 진입 | 숨김 |
| 다중 선택 | 숨김 |

**새 노드 생성 후 UX**
- 자동으로 편집 모드 진입 (커서 활성)
- Enter / blur: 텍스트 확정 + Auto Save
- ESC: 생성 취소 (빈 노드 삭제, Undo 미반영)

---

## 11. Kanban 보드 UI

> 기능 명세: `functional-spec.md § 4-KANBAN`

Kanban 레이아웃(`layoutType = 'kanban'`)은 3레벨 보드형 구조로 렌더링된다. Edge 연결선은 기본 비표시.

### 11-1. 3레벨 레이아웃 구조

```
[보드 제목 — depth 0]
  ┌─────────────┬─────────────┬─────────────┐
  │ 컬럼A       │ 컬럼B       │ 컬럼C       │ ← depth 1 (column)
  │  depth 1   │  depth 1   │  depth 1   │
  ├─────────────┼─────────────┼─────────────┤
  │ [카드1]     │ [카드3]     │ [카드5]     │ ← depth 2 (card)
  │ [카드2]     │ [카드4]     │             │
  │ [+ 카드추가]│ [+ 카드추가]│ [+ 카드추가]│
  └─────────────┴─────────────┴─────────────┘
         [+ 컬럼 추가]
```

| depth | 역할 | UI 표현 |
|:---:|---|---|
| 0 | board | 보드 전체 제목 헤더 |
| 1 | column | 세로 컬럼 영역 |
| 2 | card | 컬럼 내 카드 아이템 |
| 3+ | — | 생성 불가 (UI 버튼 비활성 + API 제약) |

### 11-2. Kanban 인터랙션 규칙

| 동작 | UX |
|---|---|
| 카드 드래그 | 다른 컬럼으로 드래그 이동 (KANBAN-04) |
| depth 3 생성 시도 | "Kanban은 카드(depth 2)까지만 허용됩니다" 토스트 |
| 컬럼 추가 | 보드 우측 끝 `+ 컬럼 추가` 버튼 |
| 카드 추가 | 컬럼 하단 `+ 카드 추가` 버튼 |
| 일반 단축키 | Space(자식), Delete(삭제) 등 동일 동작 |

---

## 12. 번역 인디케이터 UI (V2)

> 기능 명세: `functional-spec.md § 14-TRANSLATION`  
> 상세 설계: `docs/04-extensions/translation/23-node-translation.md`

### 12-1. NODE-14 번역 상태 인디케이터

번역 상태는 노드 우하단 아이콘으로 표시된다. 사용자 환경설정(`uiPreferences.showTranslationIndicator`)으로 ON/OFF 가능.

```
[노드 텍스트]
              🌐  ← 번역 아이콘 (번역 완료 시)
              ⏳  ← Skeleton 스피너 (번역 대기 중)
              ⚠️  ← 경고 아이콘 (번역 실패 시)
```

| 상태 | 아이콘 | 설명 |
|---|---|---|
| 번역 완료 | 🌐 (지구본) | 번역 텍스트 표시 중. 클릭 시 원문/번역 토글 |
| 번역 대기 | Skeleton | 번역 API 호출 중 — 원문 표시 유지 |
| 번역 실패 | ⚠️ | 원문 표시 유지, 재시도 버튼 tooltip |
| override=force_off | (없음) | 번역 생략 노드 — 아이콘 미표시 |
| override=force_on | 🔒🌐 | 강제 번역 활성 노드 |

### 12-2. Inspector Translation 탭 (V2~)

우측 Inspector 패널 Translation 탭 구조:

```
[Translation]
───────────────────────────────
번역 모드:   ○ 자동   ○ 건너뜀
Override:   [없음 ▾] → force_on / force_off / null
───────────────────────────────
원문:   "결제 API 설계"
번역:   "Payment API Design"  (en → 감지됨)
───────────────────────────────
[원문으로 보기] / [번역으로 보기]
```

### 12-3. 번역 정책 계층 (UX 반영)

> 3단계: 노드 override > 맵 정책 > 사용자 기본값  
> 상세: `docs/02-domain/domain-models.md § 4.3`

- Inspector Translation 탭에서 노드 단위 override 설정 가능
- 맵 단위 정책은 맵 설정 다이얼로그에서 변경
- 사용자 기본 언어는 사용자 설정 > 번역 설정에서 변경

---

## 13. 대시보드 모드 UI (V3)

> 기능 명세: `functional-spec.md § 13-DASHBOARD`  
> 상세 설계: `docs/04-extensions/dashboard/22-dashboard.md`

### 13-1. 대시보드 모드 전환

맵을 대시보드 모드(`view_mode = 'dashboard'`)로 전환하면 Read-only 뷰로 변경된다.

```
[Top Toolbar — 대시보드 모드]
  [대시보드 모드 ON] ← 아이콘 + 배지로 표시
  갱신 주기: [30초 ▾]   마지막 갱신: 방금 전
  [편집 모드로 전환]
```

### 13-2. 노드 값 변경 하이라이트

외부 API(`PATCH /maps/:id/data`)로 노드 값이 변경되면 1.5초 flash animation을 표시한다.

```
[변경된 노드]
  ┌──────────────────┐
  │  매출: 1,234,567  │ ← flash animation (노란색 → 정상색, 1.5초)
  └──────────────────┘
```

### 13-3. 갱신 주기 설정 UI

```
[갱신 주기 드롭다운]
  ○ Off (수동 갱신)
  ○ 10초
  ○ 30초
  ○ 1분
  ○ 5분
  ○ 10분
```

### 13-4. UX 규칙

| 항목 | 규칙 |
|---|---|
| 편집 | Read-only — 노드 클릭 선택만 가능, 편집 불가 |
| 노드 추가 인디케이터 | 대시보드 모드에서 미표시 |
| Auto Save | 비활성 (편집 불가) |
| 외부 API 키 | 맵 설정 다이얼로그 > 대시보드 탭에서 발급 및 복사 |
| 진화 경로 | V3 MVP: Polling / V3 확장: Redis Pub/Sub + WebSocket Push |

---

## 14. MVP 구현 범위

**포함**: editor layout 4영역 / 노드 CRUD / 노드 추가 인디케이터 (NODE-IND-01~04) / layout 15종 / Kanban 보드 UI / autosave / undo·redo / style / canvas CANVAS-01~08 / export / AI 생성

**제외 (후순위)**: 협업 채팅(V2) / 다국어 번역 인디케이터(V2) / 대시보드맵(V3) / 모바일(V1)

> V1부터 포함: 협업 초대 UI, 협업 참여자 아바타 표시, Soft Lock UI

---

## 15. 다음 단계

1. React + Vite 프로젝트 생성
2. 폴더 구조 반영 (`docs/05-implementation/frontend-architecture.md` 참고)
3. AppShell 구현
4. Canvas skeleton 구현
5. Node 1개 렌더링
6. NodeAddIndicator 구현 (NODE-IND-01~04)
7. Zustand 5-Store 뼈대 구현
8. Kanban 보드 레이아웃 렌더러 구현
9. V1: CollabPanel + Soft Lock 오버레이 구현
