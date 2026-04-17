# easymindmap — Frontend 개발 아키텍처

- 문서 위치: `docs/05-implementation/frontend-architecture.md`
- 스택: React + TypeScript + Zustand + React Query
- 변경: 2026-04-16 — collabStore 상세화(Presence/Soft Lock/Permission Guard), TranslationStore 추가, Dashboard 모드 Hook 추가, Supabase JS Client 연동 명시

---

## 1. 프로젝트 구조

```
apps/frontend/
├── src/
│   ├── app/
│   │   ├── router/                    # React Router 라우트 정의
│   │   ├── providers/                 # QueryClient, ThemeProvider, AuthProvider 등
│   │   └── boot/                      # 앱 초기화 (token 복원, locale 설정)
│   │
│   ├── editor/                        # 마인드맵 에디터 핵심
│   │   ├── canvas/                    # SVG viewport, pan/zoom 처리
│   │   ├── node-renderer/             # 노드 SVG + HTML Overlay 렌더링
│   │   ├── edge-renderer/             # 엣지 curve-line(방사형 곡선) / tree-line(직각선 Orthogonal) 렌더링
│   │   ├── layout-engine-adapter/     # 레이아웃 엔진 React 어댑터
│   │   ├── command-dispatcher/        # 사용자 액션 → Command 변환
│   │   ├── inspector-panels/          # 우측 속성 패널 (스타일, 레이아웃)
│   │   ├── dialogs/                   # 노드 설정, export 모달
│   │   └── collaboration/             # presence, cursor, selection 표시
│   │       ├── CollabPanel.tsx        # [v3.3] 협업자 목록·초대 UI 패널
│   │       ├── CollabCursorOverlay.tsx # presence cursor 표시 오버레이
│   │       └── CollabScopeOverlay.tsx  # scope 밖 노드 dim 처리 오버레이
│   │
│   ├── stores/                        # Zustand Store 모음
│   │   ├── documentStore.ts           # [핵심] Mindmap 원본 데이터 (DB 저장 대상)
│   │   ├── editorUiStore.ts           # UI 상태 (패널/모달/도구)
│   │   ├── viewportStore.ts           # 캔버스 zoom/pan
│   │   ├── interactionStore.ts        # drag/selection/편집 중 draft
│   │   ├── autosaveStore.ts           # dirty flag / pending patches / save status
│   │   ├── collabStore.ts             # [v3.3] 협업 상태
│   │   └── translationStore.ts        # [V2] 번역 캐시 상태
│   │   # ⚠️ 5-Store 핵심 원칙 (state-architecture.md 기준):
│   │   #   Document / EditorUI / Viewport / Interaction / Autosave
│   │   #   → 협업/번역/대시보드 기능은 위 5개에 통합하거나 별도 독립 store로 추가
│   │   #   → 절대 5개 핵심 store에 혼재 금지
│   │
│   ├── commands/                      # Command 패턴 구현
│   │   ├── types.ts
│   │   ├── nodeCommands.ts
│   │   ├── layoutCommands.ts
│   │   └── styleCommands.ts
│   │
│   ├── history/                       # Undo/Redo 히스토리 (클라이언트)
│   │   ├── historyStore.ts
│   │   └── historyManager.ts
│   │
│   ├── layout/                        # 레이아웃 엔진
│   │   ├── LayoutEngine.ts
│   │   ├── strategies/
│   │   │   ├── RadialStrategy.ts
│   │   │   ├── TreeStrategy.ts
│   │   │   ├── HierarchyStrategy.ts
│   │   │   ├── ProcessStrategy.ts
│   │   │   └── FreeformStrategy.ts
│   │   ├── MeasureEngine.ts
│   │   ├── CollisionResolver.ts
│   │   └── EdgeRouter.ts
│   │
│   ├── services/                      # 외부 통신
│   │   ├── apiClient.ts               # axios + interceptors (Silent Refresh 포함)
│   │   ├── supabaseClient.ts          # Supabase JS Client (Anon Key — Auth/Realtime)
│   │   ├── websocketClient.ts         # WS Gateway 연결 (map patch / soft lock / translation:ready)
│   │   ├── exportClient.ts
│   │   ├── aiClient.ts
│   │   ├── translationClient.ts       # [V2] 번역 API 호출 (batch, override)
│   │   └── authClient.ts              # Supabase Auth 래핑 (login/logout/refresh)
│   │
│   ├── selectors/                     # Zustand selector 함수
│   ├── hooks/                         # 공통 custom hooks
│   │   ├── useCollabPermission.ts     # [v3.3] 협업 권한 조회 hook (canEdit, canDelete)
│   │   ├── useDashboardRefresh.ts     # [V3] Dashboard 모드 polling hook
│   │   └── useTranslation.ts          # [V2] 노드 번역 표시 텍스트 조회 hook
│   ├── components/                    # 공통 UI 컴포넌트
│   └── pages/                         # 페이지 컴포넌트
│       ├── LoginPage.tsx
│       ├── DashboardPage.tsx
│       ├── EditorPage.tsx
│       └── PublishedPage.tsx
│
├── public/
└── vite.config.ts
```

---

## 2. 5-Store 상세 명세

### 2.1 documentStore

맵 원본 데이터 — 편집의 진실(source of truth)

```typescript
interface DocumentStore {
  mapId: string | null;
  mapMeta: MapMeta | null;
  nodes: Record<string, Node>;         // id → Node
  edges: Record<string, Edge>;         // id → Edge
  // ⚠ 런타임 계산값 — DB 저장 안 함
  // (Layout Engine이 렌더링마다 엣지 경로를 계산하며, schema.sql에 edges 테이블 없음)
  nodeOrder: Record<string, string[]>; // parentId → childIds[]

  // actions
  applyPatch: (patch: NodePatch) => void;
  loadMap: (map: MapData) => void;
  reset: () => void;
}
```

### 2.2 editorUiStore

UI 상태 — 패널/모달/도구 선택

```typescript
interface EditorUiStore {
  activeTool: 'select' | 'pan' | 'addNode';
  selectedNodeIds: string[];
  inspectorOpen: boolean;
  aiPanelOpen: boolean;
  exportModalOpen: boolean;
  activeLayoutPanel: boolean;

  // actions
  selectNodes: (ids: string[]) => void;
  toggleInspector: () => void;
}
```

### 2.3 viewportStore

캔버스 뷰포트 상태

```typescript
interface ViewportStore {
  zoom: number;         // 0.1 ~ 4.0
  panX: number;
  panY: number;
  canvasWidth: number;
  canvasHeight: number;

  // actions
  setZoom: (zoom: number) => void;
  pan: (dx: number, dy: number) => void;
  fitToScreen: () => void;
  centerOnNode: (nodeId: string) => void;
}
```

### 2.4 interactionStore

현재 진행 중인 사용자 인터랙션

```typescript
interface InteractionStore {
  dragging: DragState | null;       // 드래그 중인 노드
  editingNodeId: string | null;     // 텍스트 편집 중인 노드
  editingDraft: string;             // 편집 중인 텍스트 (미확정)
  hoveredNodeId: string | null;
  resizingNodeId: string | null;

  // actions
  startDrag: (nodeId: string, startPos: Point) => void;
  endDrag: () => void;
  startEditing: (nodeId: string) => void;
  commitEdit: () => void;           // → 번역 트리거
  cancelEdit: () => void;
}
```

### 2.5 autosaveStore

자동 저장 상태 관리

```typescript
interface AutosaveStore {
  dirty: boolean;
  saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  pendingPatches: NodePatch[];
  clientId: string;       // 탭별 고유 ID (sessionStorage)
  patchCounter: number;   // patchId 생성용

  // actions
  markDirty: (patch: NodePatch) => void;
  saveSuccess: (version: number) => void;
  saveError: () => void;
  generatePatchId: () => string;    // `p_{timestamp}_{counter}`
}
```

### 2.6 collabStore (V3.3)

협업 기능 관련 클라이언트 상태 관리 (DB 저장 안 함)

```typescript
interface CollabStore {
  // 협업 기본 정보
  isCollaborative: boolean;           // 현재 맵이 협업맵인지 여부
  collaborators: CollaboratorInfo[];  // 현재 맵 전체 협업자 목록
  myRole: 'creator' | 'editor' | null;
  myScope: CollabScope | null;        // { type, level?, nodeId? }

  // Presence (Supabase Realtime — 일시적 상태)
  presenceMap: Record<string, PresenceState>;  // userId → PresenceState
  // PresenceState: { userId, displayName, avatarUrl, color, cursor, selection, status }

  // Soft Lock (Redis Pub/Sub 경유 — 5초 TTL)
  softLocks: Record<string, SoftLock>;  // nodeId → { lockedBy, displayName, lockedAt }
  // ⚠️ Soft Lock TTL: 5초 (node:editing:start → 5초 후 자동 해제 또는 node:editing:end)

  // Permission Guard (GET /maps/:id/my-permissions 캐시)
  myPermissions: {
    role: 'creator' | 'editor' | null;
    scope_type: 'full' | 'level' | 'node' | null;
    scope_level: number | null;
    scope_node_id: string | null;
    can_invite: boolean;
    can_transfer_ownership: boolean;
    can_modify_others_nodes: boolean;
  } | null;

  // actions
  setCollaborators: (list: CollaboratorInfo[]) => void;
  updatePresence: (userId: string, state: PresenceState) => void;
  removePresence: (userId: string) => void;
  setLock: (nodeId: string, lock: SoftLock) => void;
  clearLock: (nodeId: string) => void;
  setPermissions: (permissions: MyPermissions) => void;
  reset: () => void;
}
```

> - Presence 채널: Supabase Realtime (`realtime:presence:{mapId}`) — 상세: `docs/04-extensions/collaboration/25-map-collaboration.md` §14.1
> - Soft Lock 이벤트: Redis Pub/Sub → WS Gateway (`node:editing:started`, `node:editing:ended`)
> - Permission Guard 사용: `useCollabPermission` hook → 편집 가능 노드에만 편집 UI 표시

### 2.7 translationStore (V2)

다국어 번역 클라이언트 캐시 상태 (DB 저장 안 함)

```typescript
interface TranslationStore {
  // { nodeId: { targetLang: { text, hash, pending } } }
  cache: Record<string, Record<string, TranslationCacheEntry>>;
  pending: Set<string>;    // 번역 대기 중인 nodeId (Skeleton UI 표시 대상)
  viewerLang: string;      // 현재 열람자 표시 언어 코드

  // actions
  setCacheEntry: (nodeId: string, lang: string, entry: TranslationCacheEntry) => void;
  setPending: (nodeId: string) => void;
  clearPending: (nodeId: string) => void;
  invalidate: (nodeId: string) => void;    // 노드 수정 시 캐시 무효화
  getDisplayText: (node: NodeObject, userLocale: string) => string | null;
  // getDisplayText: 번역 우선순위 적용 후 표시할 텍스트 반환
  //   1. node.translation_override = 'force_off' → 원문 반환
  //   2. cache HIT → 번역 텍스트 반환
  //   3. cache MISS + pending → null (Skeleton UI)
  //   4. cache MISS + not pending → 번역 요청 enqueue 후 null
}
```

> - 번역 정책 3단계 계층: `docs/04-extensions/translation/23-node-translation.md` §13
> - 초기 로딩 전략 (Skeleton → fade-in): `docs/04-extensions/translation/23-node-translation.md` §15
> - text_hash 알고리즘 (SHA-256 128자): `docs/04-extensions/translation/23-node-translation.md` §14

---

## 3. Command 패턴

모든 편집은 Command로 래핑되어 Undo/Redo 가능해야 합니다.

```typescript
interface Command {
  id: string;
  type: string;
  execute: () => NodePatch;    // Document 변경 + patch 반환
  undo: () => NodePatch;       // 역 patch 반환
  description: string;         // Undo 메뉴에 표시할 텍스트
}

// 예: 텍스트 변경 Command
class UpdateNodeTextCommand implements Command {
  constructor(
    private nodeId: string,
    private newText: string,
    private oldText: string
  ) {}

  execute(): NodePatch {
    return { op: 'updateNodeText', nodeId: this.nodeId, text: this.newText };
  }

  undo(): NodePatch {
    return { op: 'updateNodeText', nodeId: this.nodeId, text: this.oldText };
  }
}
```

---

## 4. 편집 파이프라인

```
사용자 입력 (키보드/마우스)
      │
      ▼
Command 생성 (command-dispatcher)
      │
      ▼
historyManager.execute(command)
  ├── command.execute()  → NodePatch 획득
  ├── documentStore.applyPatch(patch)
  ├── historyStack에 command push
  └── autosaveStore.markDirty(patch)
      │
      ▼
Layout Engine (변경된 subtree만 재계산)
      │
      ▼
SVG + HTML Overlay 리렌더링
      │
      ▼
Autosave debounce 타이머
(500ms~1500ms 후)
      │
      ▼
PATCH /maps/:id/document
{ clientId, patchId, baseVersion, timestamp, patches }
```

---

## 5. 렌더링 레이어 구분

```
SVG Layer (z-index 낮음)
  └── EdgeRenderer       (curve-line: 방사형 곡선 | tree-line: 직각선/Orthogonal)
  └── SelectionBox       (다중 선택 영역)
  └── ConnectionLine     (드래그 연결선)

HTML Overlay Layer (z-index 높음)
  └── NodeCard           (노드 본문 + 텍스트 편집)
  └── NodeBadge          (indicator icons)
  └── CollabCursor       (협업 커서)
  └── CollabSelection    (협업 선택 표시)
  └── ContextMenu
  └── NodeTooltip
```

---

## 6. 번역 캐시 Store

V2 다국어 번역 기능을 위한 별도 store:

```typescript
interface TranslationStore {
  // { nodeId: { targetLang: { text, hash } } }
  cache: Record<string, Record<string, TranslationCacheEntry>>;
  pending: Set<string>;   // 번역 대기 중인 nodeId

  // actions
  setCacheEntry: (nodeId: string, lang: string, entry: TranslationCacheEntry) => void;
  invalidate: (nodeId: string) => void;    // 노드 수정 시 캐시 무효화
  getDisplayText: (node: Node, userLocale: string) => string | null;
}
```

---

## 7. Dashboard 모드 리프레시 Hook

V3 대시보드 모드를 위한 custom hook:

```typescript
function useDashboardRefresh(mapId: string, refreshInterval: number) {
  const { nodes, updateNodeText, triggerFlashHighlight } = useDocumentStore();

  useEffect(() => {
    if (refreshInterval === 0) return;

    const refresh = async () => {
      const snapshot = await apiClient.get(`/maps/${mapId}/snapshot`);
      snapshot.nodes.forEach((newNode: SnapshotNode) => {
        const current = nodes[newNode.id];
        if (current && current.text !== newNode.text) {
          updateNodeText(newNode.id, newNode.text);
          triggerFlashHighlight(newNode.id);
        }
      });
    };

    const timer = setInterval(refresh, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [mapId, refreshInterval]);
}
```

---

## 8. 개발 환경 설정

```bash
# 의존성 설치
npm install

# 개발 서버 시작 (Vite)
npm run dev

# 타입 체크
npm run type-check

# 빌드
npm run build

# 테스트
npm run test
```

---

## 9. 환경변수 (Frontend)

```env
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3100/ws
VITE_APP_ENV=development
VITE_ENABLE_SOURCEMAP=true
```

 
 ## 10. **`easymindmap`** 프로젝트의 Front-end 아키텍처에서 왜 **React**를 선택했는지, 
 그리고 이것이 **Angular**나 **Vue.js**와 비교했을 때 어떤 의미가 있는지 
 IT 초보자의 눈높이에서 알기 쉽게 설명합니다.

---

### 1) 마인드맵 서비스의 특징과 Front-end의 역할

마인드맵 서비스(easymindmap)는 일반적인 게시판이나 뉴스 사이트와는 다릅니다.
* **높은 상호작용:** 사용자가 화면을 클릭하고, 노드를 끌어다 놓고(Drag & Drop), 실시간으로 글자를 수정합니다.
* **복잡한 데이터 구조:** 하나의 중심 주제에서 수많은 가지가 뻗어 나가는 트리 구조를 화면에 그려내야 합니다.

이런 서비스를 만들 때 Front-end 프레임워크(React, Angular, Vue)는 **"화면을 어떻게 효율적으로 그리고 관리할 것인가"**를 결정하는 도구입니다.

---

### 2) React vs Angular vs Vue.js 한눈에 비교 (초보자용)

각 도구의 성격을 일상생활의 비유로 설명해 보겠습니다.

| 구분 | React (리액트) | Angular (앵귤러) | Vue.js (뷰) |
| :--- | :--- | :--- | :--- |
| **비유** | **레고 블록** | **종합 건설 세트** | **조립식 가구** |
| **특징** | 필요한 조각을 가져와 자유롭게 조립함. 유연함이 최대 장점. | 집 짓는 법부터 도구까지 다 정해져 있음. 규모가 아주 큰 기업형에 유리. | 리액트와 앵귤러의 장점을 섞음. 배우기 쉽고 직관적임. |
| **생태계** | 전 세계에서 가장 많이 쓰임. 문제 해결 방법(라이브러리)이 매우 많음. | 구글이 관리. 체계가 엄격하여 대규모 팀 작업에 좋음. | 커뮤니티가 빠르게 성장 중. 깔끔하고 가벼움. |

---

### 3) 왜 `easymindmap`은 React를 선택했을까? (좋은 설계인가?)

결론부터 말씀드리면, **마인드맵 같은 서비스에 React 선택은 매우 '좋은 전략'**입니다. 그 이유는 다음과 같습니다.

#### ① 컴포넌트(부품) 중심의 설계 [구조화 시각화]
마인드맵의 각 요소(노드, 선, 메뉴바)를 독립된 '레고 블록'처럼 만들 수 있습니다.
* **장점:** '노드(Node)'라는 블록 하나만 잘 만들어두면, 화면에 100개가 있든 1000개가 있든 똑같은 로직을 재사용할 수 있습니다.

#### ② 가상 DOM (Virtual DOM)을 통한 빠른 화면 업데이트
마인드맵에서 노드 하나를 옮길 때마다 전체 화면을 다시 그리면 컴퓨터가 매우 느려집니다.
* **React의 마법:** React는 메모리에 가상의 화면을 먼저 그려보고, **실제 바뀐 부분(노드 위치 등)만 딱 집어서** 실제 화면에 반영합니다. 이는 마인드맵처럼 변화가 잦은 서비스에서 끊김 없는 사용자 경험을 제공합니다.

#### ③ 강력한 '마인드맵 전용' 라이브러리 활용
React 생태계에는 `React Flow`나 `D3.js`와 같이 복잡한 그래프와 선을 그리는 데 최적화된 도구들이 매우 많습니다. Angular나 Vue보다 이런 도구들을 가져다 쓰기가 훨씬 수월합니다.

---

### 4) 구조화된 비교 검토 결과

| 검토 항목 | easymindmap의 React 설계 점수 | 이유 |
| :--- | :---: | :--- |
| **유지보수성** | ⭐⭐⭐⭐⭐ | 부품(컴포넌트)화가 잘 되어 있어 나중에 기능을 추가하기 쉬움. |
| **성능(반응성)** | ⭐⭐⭐⭐ | 가상 DOM 덕분에 노드가 많아져도 비교적 부드럽게 작동함. |
| **개발 속도** | ⭐⭐⭐⭐⭐ | 풍부한 라이브러리와 커뮤니티 자료를 활용해 빠르게 기능을 구현 가능함. |
| **학습 곡선** | ⭐⭐⭐ | 초보자가 시작하기엔 Vue보다는 어렵지만, 한 번 배우면 활용도가 매우 높음. |

---

### 5) 최종 의견

`easymindmap` 프로젝트의 Front-end 아키텍처로 React를 선택한 것은 **현명한 선택**입니다. 

* **Angular**를 썼다면 초기에 설정해야 할 규칙이 너무 많아 프로젝트가 무거워졌을 수 있고, 
* **Vue**를 썼다면 마인드맵과 같은 복잡한 커스터마이징이 필요한 부분에서 React만큼의 자유로운 라이브러리 지원을 받기 어려웠을 수 있습니다.

**IT 초보자 관점에서의 핵심 정리:** "React는 마인드맵의 복잡한 움직임을 **부분적으로 빠르게 업데이트**할 수 있고, **부품처럼 쪼개서 관리**하기에 가장 인기 있고 검증된 도구이기 때문에 아주 좋은 설계라고 볼 수 있습니다."
