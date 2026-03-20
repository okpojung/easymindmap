좋습니다. 이제 **실제 개발에 바로 쓰는 수준의 프론트엔드 설계서 v1**로 정리해드리겠습니다.
(이걸 그대로 `/docs/dev/frontend-ui-spec.md`로 넣어도 될 수준으로 작성합니다)

---

# 📘 easymindmap Frontend UI 설계서 v1

## 1. 목적

이 문서는 easymindmap 웹 애플리케이션의
**화면 구성, UI 구조, UX 규칙, 컴포넌트 구조**를 정의한다.

목표:

* 개발 초기부터 구조 흔들림 방지
* 컴포넌트 설계 기준 확정
* UX 일관성 확보
* AI/협업/레이아웃 기능 확장 대비

---

# 2. 전체 화면 구조 (IA)

## 2.1 화면 목록

| 화면           | 설명                     | 우선순위  |
| ------------ | ---------------------- | ----- |
| Dashboard    | 맵 목록 / 생성 / 템플릿        | ⭐⭐⭐   |
| Editor       | 마인드맵 편집 핵심 화면          | ⭐⭐⭐⭐⭐ |
| AI Panel     | AI 기반 맵 생성             | ⭐⭐⭐   |
| Share/Collab | 협업 / 공유 관리             | ⭐⭐⭐   |
| Layout/Theme | 레이아웃 설정                | ⭐⭐    |
| Export       | Markdown / HTML export | ⭐⭐    |

---

# 3. 핵심 화면: Editor Layout

## 3.1 전체 레이아웃

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Toolbar                                                  │
├───────────────┬───────────────────────────────┬──────────────┤
│ Left Sidebar  │        Infinite Canvas         │ Right Panel  │
│               │        (Mindmap Area)          │              │
├───────────────┴───────────────────────────────┴──────────────┤
│ Bottom Status Bar                                            │
└──────────────────────────────────────────────────────────────┘
```

---

## 3.2 영역별 역할

### 1) Top Toolbar (글로벌 컨트롤)

기능:

* 로고 / 맵 이름
* Undo / Redo
* Layout 선택
* AI 생성 버튼
* 협업 (Share)
* Export
* 사용자 메뉴

👉 특징:

* 항상 고정 (sticky)
* 상태 표시 포함 (autosave 등)

---

### 2) Left Sidebar (탐색 영역)

탭 구조:

* Outline (트리 구조)
* Pages (맵 목록 or 섹션)
* Search
* Templates
* History (옵션)

👉 핵심:

* 큰 맵에서 탐색 문제 해결
* drag로 위치 이동 가능 (향후)

기능:

* 무한 캔버스
* pan / zoom
* node 렌더링
* edge 렌더링
* subtree layout 적용
* multi-select
* drag & drop

👉 중요한 UX:

* GPU 기반 렌더링 고려
* viewport store 분리 필요

---

### 4) Right Panel (Inspector)

선택된 노드/브랜치 속성 편집

탭 구조:

* Style
* Layout
* Content
* Note / Tag
* AI
* Translation

👉 특징:

* 선택 기반 dynamic panel
* context-sensitive UI

---

### 5) Bottom Status Bar

표시:

* zoom %
* autosave 상태
* collaborator 수
* 현재 layout type
* 좌표

---

# 4. 사용자 흐름 (핵심 UX Flow)

## 4.1 기본 흐름

```text
맵 생성 → 노드 추가 → 편집 → 스타일링 → 저장 → 공유
```

---

## 4.2 노드 생성 흐름

```text
노드 선택 → Enter → sibling 생성
노드 선택 → Tab → child 생성
```

---

## 4.3 AI 생성 흐름

```text
AI 버튼 → 프롬프트 입력 → 생성 → 
[새 맵] or [현재 맵에 삽입]
```

---

## 4.4 협업 흐름

```text
Share → 링크 생성 → 사용자 접속 →
실시간 반영
```

---

# 5. 노드 편집 UX 규칙 (매우 중요)

## 키보드 중심 UX

| 키         | 동작          |
| --------- | ----------- |
| Enter     | 같은 레벨 노드 생성 |
| Tab       | 자식 노드 생성    |
| Shift+Tab | 부모 이동       |
| Delete    | 삭제          |
| Ctrl+Z    | Undo        |
| Ctrl+Y    | Redo        |

---

## 마우스 UX

* 더블클릭 → 텍스트 편집
* 드래그 → 이동
* 우클릭 → 컨텍스트 메뉴
* hover → quick actions 표시

---

## 확장 UX

* `/` → 명령 팔레트
* floating toolbar
* multi-node selection

---

# 6. 컴포넌트 구조 설계

## 6.1 Layout Layer

```text
AppShell
├── TopToolbar
├── LeftSidebar
├── RightInspector
├── BottomStatusBar
└── CanvasArea
```

---

## 6.2 Canvas Layer

```text
MindMapCanvas
├── NodeRenderer
├── EdgeRenderer
├── SelectionLayer
├── ViewportController
└── InteractionLayer
```

---

## 6.3 Node System

```text
Node
├── NodeContent
├── NodeIndicator
├── NodeEditor
├── NodeMenu
└── NodeHandle
```

---

## 6.4 Panel System

```text
Inspector
├── StylePanel
├── LayoutPanel
├── ContentPanel
├── TagPanel
├── AI Panel
└── TranslationPanel
```

---

## 6.5 Overlay / Modal

```text
AIModal
ShareDialog
ExportDialog
CommandPalette
```

---

# 7. 상태관리 구조 (Zustand 기준)

이미 설계된 구조 반영:

## 핵심 Store

* Document Store
* Editor UI Store
* Viewport Store
* Interaction Store
* Autosave Store

👉 UI 설계와 직접 연결됨

---

# 8. 디자인 시스템 방향

## 스타일 키워드

* 생산성 중심
* 미니멀
* 캔버스 중심
* 패널은 보조 역할

---

## 색상 전략

* Neutral base
* 1 primary color
* node 색상은 의미 기반

---

## UI 원칙

* 캔버스를 최대화
* 패널은 접기/펼치기
* context-driven UI
* 클릭 최소화
* 상태 가시성 확보

---

# 9. MVP 범위

## 포함

* 기본 editor layout
* node 생성/삭제/이동
* tree layout
* autosave
* undo/redo
* simple style

## 제외 (후순위)

* 협업 실시간
* AI 자동 생성
* 다국어 번역
* dashboard map
* 고급 layout

---

# 10. 다음 단계

이 설계 기반으로:

1. React + Vite 프로젝트 생성
2. 폴더 구조 설계 반영
3. AppShell 구현
4. Canvas skeleton 구현
5. Node 1개 렌더링

---

# 🚀 다음 진행 제안

다음 단계는 바로 이겁니다:

👉 **“이 설계 기반으로 frontend 프로젝트 초기 구조 생성”**

원하시면 다음 턴에서:

* 폴더 구조 자동 생성
* 초기 React 구조
* Zustand store 뼈대
* Canvas 기본 렌더링 코드

👉 바로 실제 코드 단계로 들어갑니다 😎

---
👉 시스템의 중심

### 3) Center Canvas (핵심 영역)


