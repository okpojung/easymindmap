easymindmap — Frontend 개발 아키텍처

문서 위치: docs/05-implementation/frontend-architecture.md
스택: React + TypeScript + Zustand + React Query


1. 프로젝트 구조
apps/frontend/
 ├── src/
 │   ├── app/
 │   │   ├── router/         # React Router 라우트 정의
 │   │   ├── providers/      # QueryClient, ThemeProvider, AuthProvider 등
 │   │   └── boot/           # 앱 초기화 (token 복원, locale 설정)
 │   │
 │   ├── editor/             # 마인드맵 에디터 핵심
 │   │   ├── canvas/         # SVG viewport, pan/zoom 처리
 │   │   ├── node-renderer/  # 노드 SVG + HTML Overlay 렌더링
 │   │   ├── edge-renderer/  # 엣지 curve-line / tree-line 렌더링
 │   │   ├── layout-engine-adapter/  # 레이아웃 엔진 React 어댑터
 │   │   ├── command-dispatcher/     # 사용자 액션 → Command 변환
 │   │   ├── inspector-panels/       # 우측 속성 패널 (스타일, 레이아웃)
 │   │   ├── dialogs/        # 노드 설정, export 모달
 │   │   └── collaboration/  # presence, cursor, selection 표시
 │   │
 │   ├── stores/             # Zustand 5-Store
 │   │   ├── documentStore.ts
 │   │   ├── editorUiStore.ts
 │   │   ├── viewportStore.ts
 │   │   ├── interactionStore.ts
 │   │   └── autosaveStore.ts
 │   │
 │   ├── commands/           # Command 패턴 구현
 │   │   ├── types.ts
 │   │   ├── nodeCommands.ts
 │   │   ├── layoutCommands.ts
 │   │   └── styleCommands.ts
 │   │
 │   ├── history/            # Undo/Redo 히스토리 (클라이언트)
 │   │   ├── historyStore.ts
 │   │   └── historyManager.ts
 │   │
 │   ├── layout/             # 레이아웃 엔진
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
 │   ├── services/           # 외부 통신
 │   │   ├── apiClient.ts    # axios + interceptors
 │   │   ├── websocketClient.ts
 │   │   ├── exportClient.ts
 │   │   ├── aiClient.ts
 │   │   └── authClient.ts
 │   │
 │   ├── selectors/          # Zustand selector 함수
 │   ├── hooks/              # 공통 custom hooks
 │   ├── components/         # 공통 UI 컴포넌트
 │   └── pages/              # 페이지 컴포넌트
 │       ├── LoginPage.tsx
 │       ├── DashboardPage.tsx
 │       ├── EditorPage.tsx
 │       └── PublishedPage.tsx
 │
 ├── public/
 └── vite.config.ts


2. 5-Store 상세 명세
2.1 documentStore
// 맵 원본 데이터 — 편집의 진실(source of truth)
interface DocumentStore {
  mapId: string | null;
  mapMeta: MapMeta | null;
  nodes: Record<string, Node>;     // id → Node
  edges: Record<string, Edge>;     // id → Edge ⚠ 런타임 계산값 — DB 저장 안 함 (Layout Engine이 렌더링마다 엣지 경로를 계산하며, schema.sql에 edges 테이블 없음)
  nodeOrder: Record<string, string[]>; // parentId → childIds[]

  // actions
  applyPatch: (patch: NodePatch) => void;
  loadMap: (map: MapData) => void;
  reset: () => void;
}
2.2 editorUiStore
// UI 상태 — 패널/모달/도구 선택
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
2.3 viewportStore
// 캔버스 뷰포트 상태
interface ViewportStore {
  zoom: number;           // 0.1 ~ 4.0
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
2.4 interactionStore
// 현재 진행 중인 사용자 인터랙션
interface InteractionStore {
  dragging: DragState | null;      // 드래그 중인 노드
  editingNodeId: string | null;    // 텍스트 편집 중인 노드
  editingDraft: string;            // 편집 중인 텍스트 (미확정)
  hoveredNodeId: string | null;
  resizingNodeId: string | null;

  // actions
  startDrag: (nodeId: string, startPos: Point) => void;
  endDrag: () => void;
  startEditing: (nodeId: string) => void;
  commitEdit: () => void;          // → 번역 트리거
  cancelEdit: () => void;
}
2.5 autosaveStore
// 자동 저장 상태 관리
interface AutosaveStore {
  dirty: boolean;
  saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  pendingPatches: NodePatch[];
  clientId: string;          // 탭별 고유 ID (sessionStorage)
  patchCounter: number;      // patchId 생성용

  // actions
  markDirty: (patch: NodePatch) => void;
  saveSuccess: (version: number) => void;
  saveError: () => void;
  generatePatchId: () => string;  // `p_{timestamp}_{counter}`
}

3. Command 패턴
모든 편집은 Command로 래핑되어 Undo/Redo 가능해야 합니다.
interface Command {
  id: string;
  type: string;
  execute: () => NodePatch;       // Document 변경 + patch 반환
  undo: () => NodePatch;          // 역 patch 반환
  description: string;            // Undo 메뉴에 표시할 텍스트
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

4. 편집 파이프라인
사용자 입력 (키보드/마우스)
        │
        ▼
Command 생성 (command-dispatcher)
        │
        ▼
historyManager.execute(command)
  ├── command.execute() → NodePatch 획득
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
  (텍스트/스타일 변경: 800ms 후 / 구조 변경(생성·삭제·이동): 즉시 0ms)
        │
        ▼
PATCH /maps/:id/document
{ clientId, patchId, baseVersion, timestamp, patches }


5. 렌더링 레이어 구분
SVG Layer (z-index 낮음)
  └── EdgeRenderer      (curve-line / tree-line)
  └── SelectionBox      (다중 선택 영역)
  └── ConnectionLine    (드래그 연결선)

HTML Overlay Layer (z-index 높음)
  └── NodeCard          (노드 본문 + 텍스트 편집)
  └── NodeBadge         (indicator icons)
  └── CollabCursor      (협업 커서)
  └── CollabSelection   (협업 선택 표시)
  └── ContextMenu
  └── NodeTooltip


6. 번역 캐시 Store
V2 다국어 번역 기능을 위한 별도 store:
interface TranslationStore {
  // { nodeId: { targetLang: { text, hash } } }
  cache: Record<string, Record<string, TranslationCacheEntry>>;
  pending: Set<string>;  // 번역 대기 중인 nodeId

  // actions
  setCacheEntry: (nodeId: string, lang: string, entry: TranslationCacheEntry) => void;
  invalidate: (nodeId: string) => void;   // 노드 수정 시 캐시 무효화
  getDisplayText: (node: Node, userLocale: string) => string | null;
}

7. Dashboard 모드 리프레시 Hook
V3 대시보드 모드를 위한 custom hook:
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

8. 개발 환경 설정
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

9. 환경변수 (Frontend)
VITE_API_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3100/ws
VITE_APP_ENV=development
VITE_ENABLE_SOURCEMAP=true
