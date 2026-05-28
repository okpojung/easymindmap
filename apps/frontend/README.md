# apps/frontend — easymindmap Frontend

> React + TypeScript + Zustand (5-Store) + Vite
> Design v1.1 적용 (2026-05-28). 자세한 디자인 명세는 `docs/03-editor-core/canvas/10-canvas.md § 21~30` 참조.

---

## 디렉토리 구조

```
apps/frontend/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── public/
└── src/
    ├── main.tsx                        ← Vite entry, mounts <EditorPage />
    ├── styles/global.css
    │
    ├── app/                            ← (reserved for V1: router/providers/boot)
    │   ├── router/
    │   ├── providers/
    │   └── boot/
    │
    ├── pages/
    │   ├── LoginPage.tsx               (V1)
    │   ├── DashboardPage.tsx           (V1)
    │   ├── EditorPage.tsx              ✅ implemented (design demo)
    │   └── PublishedPage.tsx           (V1)
    │
    ├── components/                     ← App-shell UI (no business logic)
    │   ├── design-tokens/theme.ts      ← Light/Dark theme tokens
    │   ├── icons/index.tsx             ← Custom SVG icon set
    │   ├── top-toolbar/                ← TopToolbar + LayoutPicker + CollabAvatars + IconBtn + LayoutGlyph
    │   ├── left-sidebar/               ← Outline / Search / Templates / History panels
    │   ├── unified-sidebar/            ← UnifiedSidebar (nav rail + content area)
    │   └── bottom-status-bar/          ← BottomStatusBar (zoom/save/collab/coords)
    │
    ├── editor/                         ← Mindmap editor core
    │   ├── canvas/
    │   │   ├── Canvas.tsx              ← SVG viewport, zoom transform, hint badge
    │   │   ├── CanvasFloatingToolbar.tsx  ← Top-right floating toolbar (node + view groups)
    │   │   └── KanbanBoard.tsx         ← Kanban alternative renderer
    │   ├── node-renderer/
    │   │   ├── NodeRenderer.tsx        ← Per-node SVG <g>
    │   │   ├── NodeIndicators.tsx      ← 4-direction "+" buttons (NODE-IND-01~04)
    │   │   ├── NodeTagChips.tsx        ← Flag-shaped tag chips (태그2.png form)
    │   │   ├── sizeNodeForText.ts      ← Auto-size + auto-wrap (NR-03/04)
    │   │   ├── resolveNodeColors.ts    ← depth+colorKey → fill/border/text
    │   │   └── resolveTagColor.ts      ← Tag name → 7-color family palette
    │   ├── edge-renderer/
    │   │   └── EdgeRenderer.tsx        ← Layout-aware edge style (curve / orthogonal / L)
    │   ├── inspector-panels/
    │   │   ├── InspectorSection.tsx    ← Shared Section / Row / Toggle / ColorSwatch
    │   │   ├── StyleTab.tsx
    │   │   ├── LayoutTab.tsx
    │   │   ├── ContentTab.tsx          ← Icon / Link / Attachments × 2 / Background image
    │   │   ├── NoteTagTab.tsx          ← Tag chips + structured note blocks
    │   │   └── AITab.tsx
    │   ├── collaboration/
    │   │   └── CollabCursor.tsx        ← V2 preview: other-user cursor overlay
    │   ├── dialogs/
    │   │   └── DesignTweaksPanel.tsx   ← DESIGN-REVIEW-ONLY panel (removed in prod)
    │   └── __samples__/
    │       ├── types.ts                ← SampleMap / KanbanBoardData / OutlineNode / Collaborator
    │       ├── roadmap.ts              ← "2026 제품 로드맵"
    │       ├── meta.ts                 ← "easymindmap MVP 설계"
    │       ├── kanban.ts
    │       ├── outline.ts
    │       ├── collabs.ts
    │       └── index.ts
    │
    ├── layout/                         ← Layout Engine (2-pass: Measure → Arrange)
    │   ├── LayoutEngine.ts             ← computeLayout dispatcher
    │   ├── types.ts                    ← LaidOutNode
    │   └── strategies/
    │       ├── RadialStrategy.ts       ← radial-bidirectional, radial-right, radial-left
    │       ├── TreeStrategy.ts         ← tree-right, tree-down
    │       ├── HierarchyStrategy.ts    ← hierarchy-right (indented outline)
    │       ├── ProcessStrategy.ts      (V1.5 — placeholder)
    │       └── FreeformStrategy.ts     (V1+ — placeholder)
    │
    ├── stores/                         ← Zustand 5-Store (stub for design demo)
    │   ├── documentStore.ts            ← Map data (the only thing persisted to DB)
    │   ├── editorUiStore.ts            ← Theme, layout, tab, sidebar collapsed, tweaks
    │   ├── viewportStore.ts            ← zoom / pan (kept separate from doc — see § 6.7)
    │   ├── interactionStore.ts         ← selection, drag, edit draft
    │   ├── autosaveStore.ts            ← saveState (saved/saving/dirty/error)
    │   └── index.ts
    │
    ├── commands/                       ← (reserved — Command pattern for Undo/Redo)
    ├── history/                        ← (reserved — undo/redo stack)
    ├── services/                       ← (reserved — REST + WS adapters)
    ├── selectors/                      ← (reserved — derived state selectors)
    └── hooks/                          ← (reserved — shared custom hooks)
```

---

## 핵심 설계 결정

| 항목 | 결정 |
|------|------|
| 상태 관리 | Zustand 5-Store 분리 원칙 |
| DB 저장 대상 | Document Store 만 저장, 나머지는 UI 상태 |
| 좌표 처리 | World/Screen 이중 좌표계, `<g transform="scale">` 으로 줌 적용 |
| 줌 적용 범위 | **캔버스 SVG 내부 `<g>` 에만 적용** (사이드바/툴바 영향 없음, § 25) |
| 사이드바 | 좌측 1개로 통합 (44px 레일 + 300px 콘텐츠, 접기 가능) |
| 컨텍스트 메뉴 | 사용 안 함 — 4방향 + 인디케이터 + 캔버스 우상단 플로팅 툴바로 대체 |
| 태그 표시 | 노드 하단 외부 깃발 칩 (`태그2.png` 형식), 7색 family 매핑 |
| 노드 텍스트 | 자동 크기 + CJK 가중 자동 줄바꿈 (`sizeNodeForText`) |
| 폰트 크기 | **레벨별 고정** (맵 설정), 노드별 변경 불가 (markdown 강조만 노드별) |
| 노트 구조 | 5종 블록: paragraph / code_block / warning / tip / checklist |
| 첨부 | **2종 분리**: 문서 (`node_attachments`) / 멀티미디어 (`node_media`) |
| 편집 파이프라인 | Command → historyManager → documentStore → Layout → Render → Autosave |
| 노드 이동 | ltree 기반 서버 처리, 클라이언트는 patch 발행만 |
| 삭제 Undo | DeleteNodeCommand 스냅샷 기반, 5~10초 창 |

---

## 개발 환경 실행

```bash
# 의존성 설치
npm install

# 개발 서버 (Vite hot reload)
npm run dev
# → http://localhost:5173

# 타입 체크
npm run type-check

# 빌드
npm run build

# 미리보기
npm run preview
```

---

## 환경변수

```bash
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3100/ws
VITE_APP_ENV=development
VITE_ENABLE_SOURCEMAP=true
```

(현재 디자인 데모에서는 API를 호출하지 않으므로 환경변수 없이도 동작합니다.)

---

## 관련 설계 문서

| 주제 | 문서 |
|------|------|
| **캔버스 UI 디자인 v1.1** | `docs/03-editor-core/canvas/10-canvas.md § 21~30` |
| 프론트엔드 아키텍처 | `docs/05-implementation/frontend-architecture.md` |
| 상태 관리 아키텍처 | `docs/03-editor-core/state-architecture.md` |
| 레이아웃 좌표 알고리즘 | `docs/03-editor-core/layout-coordinate-algorithm.md` |
| 레이아웃 엔진 (15종) | `docs/03-editor-core/layout/08-layout.md` |
| 노드 인디케이터 | `docs/03-editor-core/node/03-node-indicator.md` |
| 노드 스타일 | `docs/03-editor-core/node/05-node-style.md` |
| 노드 렌더링 | `docs/03-editor-core/node/06-node-rendering.md` |
| Autosave 엔진 | `docs/03-editor-core/autosave-engine.md` |
| Command 히스토리 | `docs/03-editor-core/command-history.md` |
