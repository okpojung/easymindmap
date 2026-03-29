# easymindmap — State Architecture

문서 버전: v2.0  
상태: Final Draft  
대상: `docs/03-editor-core/state-architecture.md`

---

## 1. 문서 목적

본 문서는 easymindmap Editor의 상태관리(State Management) 구조를 정의한다.

이 문서의 목적은 다음과 같다.

1. 에디터 내부 상태를 명확하게 분리한다.
2. 어떤 상태가 DB 저장 대상이고 어떤 상태가 UI 전용 상태인지 구분한다.
3. Autosave, Undo/Redo, Layout Engine, Collaboration 기능이 서로 꼬이지 않도록 기반 구조를 만든다.
4. React + Zustand + React Query 기반 실제 구현 기준 문서로 사용한다.

즉, 이 문서는 단순한 “상태관리 개념 설명”이 아니라  
**easymindmap Editor 전체 동작의 뼈대**를 정의하는 문서이다.

---

## 2. 왜 상태관리가 중요한가

마인드맵 에디터는 겉으로 보기엔 단순해 보이지만 내부적으로는 동시에 많은 상태가 움직인다.

예를 들면 아래가 모두 상태(State)이다.

- 현재 맵 제목
- 현재 노드 목록
- 현재 선택된 노드
- 현재 zoom 배율
- 현재 drag 중인지 여부
- 현재 저장 중인지 여부
- 현재 우측 패널이 열려 있는지 여부
- 현재 자동저장 대기 patch가 있는지 여부
- 현재 AI 패널이 열려 있는지 여부

예를 들어 사용자가 노드를 하나 이동하면 실제로는 아래 일이 연쇄적으로 발생한다.

```text
node 이동
→ document 구조 변경
→ layout 재계산 필요
→ autosave 필요
→ undo stack 기록
→ 화면 다시 렌더링
```

이걸 하나의 store에 몰아넣으면 다음 문제가 생긴다.

- state 변경 시 전체 rerender
- drag 중 과도한 업데이트
- autosave와 UI 상태가 섞임
- undo/redo 경계가 모호해짐
- 협업 확장 시 충돌 발생

그래서 easymindmap은 상태를 **5개 Store로 분리**한다.

---

## 3. 최상위 상태 구조

```text
Editor State

├ Document Store
├ Editor UI Store
├ Viewport Store
├ Interaction Store
└ Autosave Store
```

이 구조는 대형 편집기들이 공통적으로 채택하는 방식과 유사하다.

예:

- Figma
- Miro
- Excalidraw
- Notion editor 계열

핵심 원칙은 다음과 같다.

> **Document는 문서 그 자체이고,  
UI/Viewport/Interaction은 문서를 다루기 위한 일시적 상태이며,  
Autosave는 변경을 저장하기 위한 별도 상태 계층이다.**

---

## 4. 상태관리 핵심 원칙

### 4.1 문서 상태와 UI 상태를 분리한다

문서 상태는 DB에 저장되는 원본이다.  
UI 상태는 사용자가 화면을 어떻게 보고 있고 무엇을 누르고 있는지에 대한 정보이다.

예:

- 문서 상태: 노드 text, parentId, layoutType, tags
- UI 상태: 선택된 노드, 패널 열림 여부, 검색창 입력값

---

### 4.2 Document Store만 저장 대상이다

아래 규칙은 반드시 지킨다.

```text
Document Store만 DB 저장 대상
```

즉:

- Document Store → 저장 O
- Editor UI Store → 저장 X
- Viewport Store → 저장 X
- Interaction Store → 저장 X
- Autosave Store → 저장 상태 관리용, 원본 저장 대상 아님

---

### 4.3 Derived State는 가급적 계산한다

다음 값들은 원본 상태로 저장하기보다 selector / 계산 결과로 다루는 것이 좋다.

- 화면에 현재 보이는 노드 목록
- edge SVG path
- subtree bounding box
- filtered result
- selection bounds
- zoom/pan 적용 후 screen coordinates

즉, 원본 데이터와 계산 결과를 분리한다.

---

### 4.4 짧게 사는 상태와 오래 사는 상태를 분리한다

예:

- `dragPreviewX`, `dragPreviewY` → 아주 짧게 사는 상태 → Interaction Store
- `node.parentId`, `node.text` → 오래 유지되는 상태 → Document Store

이 원칙이 무너지면 drag 중에도 DB 저장 후보가 되고, autosave와 undo/redo가 엉키게 된다.

---

### 4.5 모든 편집은 문서 상태를 중심으로 흐른다

easymindmap의 편집 파이프라인은 아래 흐름을 따른다.

```text
사용자 입력
→ Command
→ Document Store 변경
→ Layout 계산
→ Render
→ Autosave Queue 등록
→ 서버 저장
```

즉, 진짜 핵심은 항상 Document Store이다.

---

## 5. 5개 Store 상세 정의

---

## 5.1 Document Store

### 5.1.1 역할

Document Store는 **Mindmap 데이터 그 자체**를 담는다.

즉 아래가 모두 여기에 들어간다.

- map metadata
- nodes
- edges
- tags
- subtree layout 정보
- collapse 상태
- style 정보
- export 가능한 원본 데이터

한마디로 정리하면:

```text
Document Store = 실제 문서
```

---

### 5.1.2 포함해야 하는 데이터

예시 구조:

```ts
type MindmapDocument = {
  id: string;
  title: string;
  ownerId: string | null;
  version: number;
  rootNodeId: string;

  nodes: Record<string, MindmapNode>;
  edges: Record<string, MindmapEdge>;
  tags: Record<string, TagEntity>;

  settings: DocumentSettings;
  metadata: DocumentMetadata;

  createdAt: string;
  updatedAt: string;
};
```

---

### 5.1.3 왜 nodes를 배열이 아니라 Record로 저장하는가

배열 방식:

```ts
nodes: [
  { id: "n1", text: "Root" },
  { id: "n2", text: "AI" }
]
```

Record 방식:

```ts
nodes: {
  "n1": { id: "n1", text: "Root" },
  "n2": { id: "n2", text: "AI" }
}
```

Record 방식을 추천하는 이유는 다음과 같다.

1. 특정 node를 빠르게 찾을 수 있다.
2. 부분 수정이 쉽다.
3. 대형 맵에서 성능상 유리하다.
4. patch 계산과 undo/redo에 적합하다.

즉:

```text
nodes["n2"]
```

형태가

```text
nodes.find(...)
```

보다 훨씬 안정적이다.

---

### 5.1.4 Node 모델 예시

```ts
type MindmapNode = {
  id: string;
  mapId: string;

  parentId: string | null;
  childIds: string[];

  text: string;
  note?: string | null;

  layoutType?: LayoutType | null;
  shapeType?: ShapeType;
  style?: NodeStyle;

  tags: string[];
  hyperlinkIds: string[];
  attachmentIds: string[];
  multimediaId?: string | null;

  collapsed: boolean;

  manualPosition?: {
    x: number;
    y: number;
  } | null;

  size?: {
    width: number;
    height: number;
  } | null;

  depth: number;
  orderIndex: number;

  createdAt: string;
  updatedAt: string;
};
```

---

### 5.1.5 Document Store의 책임

Document Store가 직접 책임지는 대표 작업은 다음과 같다.

1. Node 생성
2. Node 삭제
3. Node 이동
4. Node 텍스트 수정
5. Layout 변경
6. Collapse / Expand
7. Tag 추가/삭제
8. Style 변경
9. Manual Position 저장
10. 다중 가지 추가 결과 반영

예:

```ts
createNode()
deleteNode()
moveNode()
updateText()
changeLayout()
setCollapsed()
addTag()
removeTag()
```

---

### 5.1.6 Document Store의 특징

Document Store는 다음 특징을 가진다.

- 가장 중요한 상태
- DB에 저장되는 데이터
- Undo / Redo 대상
- Autosave 대상
- Export 원본
- Collaboration 동기화의 기준 상태

즉, 나중에 협업이 붙어도 중심은 계속 Document Store이다.

---

## 5.2 Editor UI Store

### 5.2.1 역할

Editor UI Store는 **UI 상태만 관리**한다.

즉 문서 데이터와 직접 상관없는 화면 상태를 보관한다.

예:

- 현재 선택된 노드
- 오른쪽 패널 열림 여부
- AI 패널 열림 여부
- Tag Explorer 열림 여부
- 현재 활성 탭
- 검색창 문자열
- export dialog 상태
- context menu 상태
- toast 메시지

---

### 5.2.2 예시 구조

```ts
type EditorUIState = {
  selectedNodeId: string | null;

  panels: {
    aiPanel: boolean;
    tagExplorer: boolean;
    inspector: boolean;
  };

  activeInspectorTab:
    | "style"
    | "layout"
    | "note"
    | "tag"
    | "link"
    | "attachment";

  searchQuery: string;
  searchPanelOpen: boolean;

  exportDialogOpen: boolean;

  contextMenu: {
    open: boolean;
    x: number;
    y: number;
    targetType: "node" | "canvas" | "tag" | null;
    targetId: string | null;
  };
};
```

---

### 5.2.3 UI Store의 특징

- DB 저장 안 함
- 새로고침 시 복구하지 않아도 됨
- 문서 원본 진실이 아님
- 렌더링 편의 상태

즉:

```text
Editor UI Store = 화면용 상태
```

---

## 5.3 Viewport Store

### 5.3.1 역할

Viewport Store는 사용자가 현재 **어느 화면 위치를 보고 있는가**를 나타낸다.

즉, 캔버스의 카메라 상태이다.

포함 예:

- zoom
- pan
- canvas bounds
- fit screen 여부
- minimap view box
- 마지막 center node

---

### 5.3.2 예시 구조

```ts
type ViewportState = {
  zoom: number;

  pan: {
    x: number;
    y: number;
  };

  canvasSize: {
    width: number;
    height: number;
  };

  worldBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;

  isPanning: boolean;
  lastCenterNodeId: string | null;
};
```

---

### 5.3.3 Viewport Store가 담당하는 기능

- Zoom In
- Zoom Out
- Fit Screen
- Pan Canvas
- Center Node
- 100% View
- Focus Node View

즉 캔버스 조작 관련 기능은 모두 Viewport Store를 중심으로 동작한다.

---

### 5.3.4 중요한 구분

Viewport Store는 **world coordinates** 와 **screen coordinates** 사이의 변환과 관련된다.

- world coordinates → 문서/레이아웃 엔진 기준 좌표
- screen coordinates → zoom/pan 적용 후 화면 좌표

이 둘을 섞으면 안 된다.

---

## 5.4 Interaction Store

### 5.4.1 역할

Interaction Store는 **사용자의 현재 행동 상태**를 저장한다.

이 상태는 매우 자주 바뀌고, 짧게 살아있으며, 저장 대상이 아니다.

예:

- drag 중인 노드
- hover 중인 노드
- selection box
- keyboard 입력 중
- text edit draft
- drop target 후보
- marquee selection
- 다중 가지 입력 팝업의 draft text

---

### 5.4.2 예시 구조

```ts
type InteractionState = {
  hoveredNodeId: string | null;

  selectedNodeIds: string[];
  anchorNodeId: string | null;

  dragging:
    | {
        type: "node" | "subtree";
        nodeIds: string[];
        origin: { x: number; y: number };
        current: { x: number; y: number };
        previewParentId: string | null;
      }
    | null;

  marquee:
    | {
        start: { x: number; y: number };
        current: { x: number; y: number };
      }
    | null;

  textEditing:
    | {
        nodeId: string;
        draftText: string;
      }
    | null;

  bulkInsertDraft: string | null;
};
```

---

### 5.4.3 Interaction Store의 특징

- 매우 자주 바뀜
- drag/hover 중 초당 여러 번 변경 가능
- DB 저장 안 함
- undo/redo 대상이 아님
- 렌더링에 중요하지만 원본은 아님

즉:

```text
Interaction Store = 사용자 행동의 현재 순간
```

---

## 5.5 Autosave Store

### 5.5.1 역할

Autosave Store는 **자동 저장 자체를 관리**한다.

Document Store가 바뀌면 Autosave Store가 그것을 감지하고 저장 절차를 관리한다.

즉 Autosave Store는 문서 원본을 갖지 않는다.  
대신 “저장해야 하는지”, “지금 저장 중인지”, “마지막 저장이 언제였는지”를 관리한다.

---

### 5.5.2 예시 구조

```ts
type AutosaveState = {
  dirty: boolean;
  saving: boolean;
  lastSavedAt: string | null;

  pendingPatches: DocumentPatch[];
  lastError: string | null;

  debounceMs: number;
};
```

---

### 5.5.3 Autosave 트리거

아래 작업이 발생하면 autosave 대상이 된다.

- node 생성
- node 삭제
- node 이동
- text 수정
- layout 변경
- tag 변경
- style 변경
- collapse 상태 변경
- bulk insert
- AI generated node 삽입

즉 원칙은:

```text
Document Store가 바뀌면 Autosave 후보
```

---

### 5.5.4 Autosave 흐름

```text
Document 변경
→ dirty = true
→ debounce 시작
→ PATCH 요청 생성
→ 서버 저장
→ 성공 시 dirty = false
→ lastSavedAt 갱신
```

예:

```text
node 이동
→ Document Store 변경
→ Autosave Store dirty = true
→ 1초 후 저장
→ DB 저장
→ dirty = false
```

---

### 5.5.5 Autosave Store의 특징

- 문서 원본 데이터는 가지지 않음
- 저장 상태만 관리
- version / patchId / clientId 기반 patch 저장과 잘 연결됨
- collaboration에서도 로컬 optimistic update와 자연스럽게 연결 가능

---

## 6. 전체 데이터 흐름

easymindmap Editor의 기본 흐름은 아래와 같다.

```text
사용자 입력
   ↓
Command Dispatcher
   ↓
Document Store 갱신
   ├── Editor UI Store 일부 갱신
   ├── Interaction Store 정리
   ├── History Entry 기록
   └── Autosave Store dirty = true
   ↓
Layout Engine
   ↓
Renderer (SVG + HTML Overlay)
   ↓
Autosave Worker
   ↓
API / DB
```

이 흐름이 중요한 이유는 다음과 같다.

1. 편집은 항상 Document 변경을 중심으로 이뤄진다.
2. UI 상태는 문서 원본을 직접 바꾸지 않는다.
3. 저장은 Document와 분리된 Autosave가 담당한다.
4. Undo/Redo와 Collaboration 확장이 쉬워진다.

---

## 7. 실제 코드 구조 예시

React + Zustand 기준으로는 아래처럼 분리하는 것이 좋다.

```text
/stores

documentStore.ts
editorUiStore.ts
viewportStore.ts
interactionStore.ts
autosaveStore.ts
```

간단한 예시:

```ts
const useDocumentStore = create((set) => ({
  nodes: {},

  createNode: (node) =>
    set((state) => ({
      nodes: {
        ...state.nodes,
        [node.id]: node
      }
    })),

  deleteNode: (id) =>
    set((state) => {
      const next = { ...state.nodes };
      delete next[id];
      return { nodes: next };
    })
}));
```

---

## 8. 왜 5개 Store로 나누는가

이유는 매우 중요하다.

만약 하나의 Store에 모든 걸 넣으면 다음 일이 벌어진다.

```text
zoom 변경
→ 전체 state 변경
→ 전체 rerender
→ drag 중 성능 저하
→ autosave와 UI 상태 혼선
```

반대로 분리하면 아래처럼 된다.

```text
zoom 변경
→ viewport만 변경
→ document rerender 없음
```

즉 Store 분리는 단지 코드 스타일 문제가 아니라  
**성능, 유지보수성, 협업 확장성의 핵심**이다.

---

## 9. 대형 에디터와의 비교

대형 에디터들도 본질적으로 비슷한 구조를 가진다.

예:

### Figma 계열

```text
Document
Viewport
Selection
Interaction
History
```

### Excalidraw 계열

```text
elements
appState
history
```

easymindmap도 같은 원칙을 따르지만,  
마인드맵 특성상 Layout, Autosave, Bulk Insert, Tag, AI 생성 등을 고려해  
5-Store 분리 구조를 명확히 가져간다.

---

## 10. 상태별 저장/복구 기준

| Store | DB 저장 | 새로고침 복구 | Undo/Redo 대상 | 협업 동기화 대상 |
|---|---|---:|---:|---:|
| Document Store | O | O | O | O |
| Editor UI Store | X | 선택 | X | X |
| Viewport Store | X | 선택 | X | X |
| Interaction Store | X | X | X | X |
| Autosave Store | X | 일부 | X | X |

설명:

- Document는 반드시 저장/복구/동기화 대상
- UI/Viewport는 필요하면 로컬스토리지 정도만 고려 가능
- Interaction은 순간 상태라 복구 대상 아님
- Autosave는 앱 내부 제어 상태

---

## 11. 다른 핵심 엔진과의 관계

### 11.1 Document Store와 Undo/Redo

Undo/Redo는 사실상 아래 의미다.

```text
Document Store 이전 상태로 되돌리기
```

즉 History Store는 Document Store 위에 얹힌다.

---

### 11.2 Document Store와 Layout Engine

Layout Engine은 문서 원본을 받아  
노드 위치, bounding box, edge path 같은 계산 결과를 만든다.

즉:

```text
Document Store = 원본
Layout Engine = 계산기
```

---

### 11.3 Document Store와 Autosave

Autosave는 아래 구조가 가장 바람직하다.

```text
Document Store 변경 감지
→ patch 생성
→ debounce
→ 서버 저장
```

즉 Autosave는 Document를 직접 소유하지 않는다.

---

### 11.4 Document Store와 AI 기능

AI mindmap 생성도 결국은 아래와 같다.

```text
AI 결과
→ node tree 변환
→ Document Store 삽입
→ Layout 계산
→ Autosave 저장
```

즉 AI도 별도 예외가 아니라 Document Store 파이프라인에 들어오는 입력원 중 하나이다.

---

## 12. 향후 Collaboration 확장과의 관계

향후 협업 기능이 들어가더라도 5-Store 원칙은 유지한다.

기본 원칙:

- Document Store → CRDT/Realtime 동기화 대상
- Editor UI Store → 로컬 전용
- Viewport Store → 로컬 전용
- Interaction Store → 로컬 전용
- Autosave Store → 로컬 저장 관리

즉, 다른 사용자의 커서나 선택 상태를 별도 collaboration layer로 브로드캐스트할 수는 있지만,  
기본 store 분리 원칙은 유지해야 한다.

---

## 13. 최종 요약

easymindmap 상태 구조는 아래처럼 정리할 수 있다.

```text
Document Store
= Mindmap 데이터 자체

Editor UI Store
= 패널 / 선택 / 모달 / 화면 UI 상태

Viewport Store
= zoom / pan / 보이는 영역

Interaction Store
= drag / hover / selection / draft

Autosave Store
= dirty / pending patch / saving 상태
```

그리고 가장 중요한 원칙은 아래 한 줄이다.

```text
Document Store만 DB 저장 대상
```

이 원칙이 지켜져야 다음이 모두 안정적으로 돌아간다.

- Autosave
- Undo / Redo
- Layout Engine
- AI 삽입
- Collaboration
- Export

---

## 14. 구현 시 권장 추가 문서

이 문서를 기준으로 다음 문서와 함께 읽는 것이 좋다.

1. `command-history.md`
2. `layout-engine.md`
3. `layout-coordinate-algorithm.md`
4. `autosave-engine.md`
5. `frontend-architecture.md`

즉, 이 문서는 Editor 코어 설계의 입구 문서이고,  
세부 동작은 위 문서들에서 확장된다.

---

## 15. 한 줄 최종 결론

> easymindmap Editor의 상태관리는  
> **문서 상태(Document)** 와  
> **화면/UI 상태(UI, Viewport, Interaction)** 와  
> **저장 상태(Autosave)** 를 완전히 분리하는 5-Store 구조를 기준으로 설계한다.
