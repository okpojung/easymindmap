# apps/frontend — easymindmap Frontend

> React + TypeScript + Zustand (5-Store) + React Query + Vite

---

## 디렉토리 구조

```
apps/frontend/
├── src/
│   ├── app/
│   │   ├── router/                 ← React Router 라우트 정의
│   │   ├── providers/              ← QueryClient, ThemeProvider, AuthProvider
│   │   └── boot/                   ← 앱 초기화 (token 복원, locale 설정)
│   │
│   ├── editor/                     ← 마인드맵 에디터 핵심
│   │   ├── canvas/                 ← SVG viewport, pan/zoom 처리
│   │   ├── node-renderer/          ← 노드 SVG + HTML Overlay 렌더링
│   │   ├── edge-renderer/          ← curve-line / tree-line 엣지 렌더링
│   │   ├── layout-engine-adapter/  ← 레이아웃 엔진 React 어댑터
│   │   ├── command-dispatcher/     ← 사용자 액션 → Command 변환
│   │   ├── inspector-panels/       ← 우측 속성 패널 (스타일, 레이아웃)
│   │   ├── dialogs/                ← 노드 설정, export 모달
│   │   └── collaboration/          ← presence, cursor, selection 표시
│   │
│   ├── stores/                     ← Zustand 5-Store
│   │   ├── documentStore.ts        ← 맵 데이터 (DB 저장 대상)
│   │   ├── editorUiStore.ts        ← UI 상태 (패널/모달/도구)
│   │   ├── viewportStore.ts        ← 캔버스 zoom/pan
│   │   ├── interactionStore.ts     ← 드래그/편집 중 상태
│   │   └── autosaveStore.ts        ← autosave 상태 (dirty, patches)
│   │
│   ├── commands/                   ← Command 패턴 (Undo/Redo)
│   ├── history/                    ← Undo/Redo 히스토리 스택
│   ├── layout/                     ← Layout Engine (2-pass: Measure → Arrange)
│   │   ├── LayoutEngine.ts
│   │   └── strategies/
│   │       ├── RadialStrategy.ts
│   │       ├── TreeStrategy.ts
│   │       ├── HierarchyStrategy.ts
│   │       ├── ProcessStrategy.ts
│   │       └── FreeformStrategy.ts
│   │
│   ├── services/                   ← 외부 통신 (API, WebSocket)
│   ├── selectors/                  ← Zustand selector 함수
│   ├── hooks/                      ← 공통 custom hooks
│   ├── components/                 ← 공통 UI 컴포넌트
│   └── pages/
│       ├── LoginPage.tsx
│       ├── DashboardPage.tsx
│       ├── EditorPage.tsx
│       └── PublishedPage.tsx
│
├── public/
└── vite.config.ts
```

---

## 핵심 설계 결정

| 항목 | 결정 |
|------|------|
| 상태 관리 | Zustand 5-Store 분리 원칙 |
| DB 저장 대상 | Document Store 만 저장, 나머지는 UI 상태 |
| 좌표 처리 | World/Screen 이중 좌표계, `transformOrigin: '0 0'` CSS Transform |
| 렌더링 | SVG(edges) + HTML Overlay(nodes), Viewport Culling |
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

# 타입 체크
npm run type-check

# 빌드
npm run build

# 테스트
npm run test
```

---

## 환경변수

```bash
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3100/ws
VITE_APP_ENV=development
VITE_ENABLE_SOURCEMAP=true
```

---

## 관련 설계 문서

| 주제 | 문서 |
|------|------|
| 프론트엔드 아키텍처 | `docs/05-implementation/frontend-architecture.md` |
| 상태 관리 아키텍처 | `docs/03-editor-core/state-architecture.md` |
| 레이아웃 좌표 알고리즘 | `docs/03-editor-core/layout-coordinate-algorithm.md` |
| 렌더링 성능 전략 | `docs/05-implementation/rendering-performance-strategy.md` |
| Autosave 엔진 | `docs/03-editor-core/autosave-engine.md` |
| Command 히스토리 | `docs/03-editor-core/command-history.md` |
