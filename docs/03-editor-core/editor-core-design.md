# Mindmap Editor 설계

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 1:41:04  
**Updated:** 3/16/2026 2:01:40  
**Exported:** 3/16/2026 2:01:50  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6e109-0db0-83ab-87a6-f4358eaee373](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6e109-0db0-83ab-87a6-f4358eaee373)  

## Prompt:
4️⃣ Mindmap Editor 전체 상태 아키텍처 (Figma급 설계)를 정말 전문가 답게 꼼꼼하고 정확하고 자세히 설게해줘

2/2

## Response:
16s 동안 생각함

좋습니다.  
이 단계는 그냥 “상태관리 라이브러리 어떻게 쓸까?” 수준이 아니라, **easymindmap의 뼈대 자체**를 정하는 작업입니다.

질문하신 **“Mindmap Editor 전체 상태 아키텍처 (Figma급 설계)”**는, 한마디로 말하면:

> **문서 상태(Document)와 화면 상태(UI), 상호작용 상태(Interaction), 뷰포트 상태(Viewport), 저장/동기화 상태(Autosave)를 완전히 분리하고,  
> 모든 편집은 Command → Reducer → Derived Layout → Render → Save 파이프라인으로 흐르게 설계하는 것**

입니다.

그리고 이 구조는 귀하가 이미 정리한 기능들, 즉  
노드 생성/삭제/이동, 다중 가지 추가, 레이아웃 변경, 태그, Undo/Redo, 자동저장 같은 요구를 안정적으로 담기 위해 꼭 필요합니다.

기능정의테이블

tag기능

◆ ‘다중 가지’ 추가

* * *

1\. 목표: 왜 “Figma급 상태 아키텍처”가 필요한가
================================

마인드맵 편집기는 겉으로 보면 단순해 보이지만, 내부적으로는 아래가 동시에 일어납니다.

*   문서 데이터 변경
*   노드 선택 변경
*   드래그 중 임시 좌표 변경
*   자동 레이아웃 재계산
*   Undo/Redo 이력 기록
*   자동저장 대기열 갱신
*   검색/태그 필터 반영
*   확대/축소/팬 반영
*   AI 결과 삽입
*   향후 협업 동기화

이걸 한 store에 다 넣으면 금방 망가집니다.

Figma급 설계의 핵심은:

*   **영구 문서 상태**와
*   **일시적 UI 상태**와
*   **마우스/키보드 상호작용 중간 상태**와
*   **서버 동기화 상태**

를 **절대 섞지 않는 것**입니다.

* * *

2\. 최상위 아키텍처 한 줄 정의
===================

easymindmap Editor 상태 아키텍처는 아래 5개 메인 스토어 + 3개 공통 엔진으로 설계하는 것이 가장 좋습니다.

5개 메인 Store
-----------

1.  **Document Store**  
    편집 대상인 “맵 그 자체”를 담는 정규화된 영구 상태
2.  **Editor UI Store**  
    패널 열림/닫힘, 선택 도구, 검색창, 모달 등 화면 UI 상태
3.  **Viewport Store**  
    줌, 팬, 화면 중앙 이동, 보이는 영역 등 캔버스 시점 상태
4.  **Interaction Store**  
    드래그 중, 텍스트 편집 중, 다중선택 박스, 연결선 프리뷰 등 아주 짧게 사는 상태
5.  **Autosave Store**  
    dirty 여부, 저장 대기 patch, 마지막 저장 시각, 충돌/오류 상태

3개 공통 엔진
--------

6.  **Command Engine**  
    모든 편집 행위를 명령(Command)으로 처리
7.  **History Engine**  
    Undo/Redo를 patch 기반으로 관리
8.  **Layout Engine / Selector Layer**  
    document를 받아 실제 렌더 좌표/간선 경로/가시성 상태를 계산

* * *

3\. 전체 구조도
==========

아래 구조가 제 추천 최종안입니다.

```
[ User Input ]
   ↓
[ Command Dispatcher ]
   ↓
[ Domain Reducers ]
   ├─ Document Store 갱신
   ├─ Editor UI Store 일부 갱신
   ├─ Autosave Dirty Queue 등록
   └─ History Entry 기록
   ↓
[ Derived Selectors / Layout Engine ]
   ├─ visibleNodes
   ├─ nodeScreenRects
   ├─ edgePaths
   ├─ filteredResult
   └─ selectionBounds
   ↓
[ Renderer (SVG/Canvas) ]
   ↓
[ Autosave Worker ]
   ↓
[ API / DB ]
```

핵심은 이겁니다:

*   **사용자 입력이 바로 state를 막 바꾸는 게 아니라**
*   반드시 **Command**를 거쳐야 합니다.

즉,  
“노드 이동”도 하나의 command,  
“다중 가지 생성”도 하나의 command,  
“서브트리 layout 변경”도 하나의 command여야 합니다.

* * *

4\. 설계 원칙
=========

이건 꼭 지켜야 합니다.

4.1 단일 진실 원천(Single Source of Truth)
------------------------------------

문서 데이터는 오직 **Document Store**만이 진실입니다.

예를 들어 노드 텍스트, 부모-자식 관계, 태그, 접힘 여부, 레이아웃 타입은 Document Store에만 있어야 합니다.

UI 컴포넌트가 자기 local state에 별도로 들고 있으면 안 됩니다.

* * *

4.2 정규화 저장(Normalized State)
----------------------------

트리 구조를 화면에서 그대로 nested object로 들고 있으면 안 됩니다.

반드시 이런 형태여야 합니다.

```
type NodeId = string;
type EdgeId = string;
type TagId = string;

interface DocumentState {
  map: MapEntity;
  nodesById: Record<NodeId, MindNode>;
  childIdsByParentId: Record<NodeId | "root", NodeId[]>;
  edgesById: Record<EdgeId, MindEdge>;
  rootNodeId: NodeId;
  // 태그 정규화 맵 (V1~): 태그 CRUD와 node-tag 연결을 위한 맵 구조
  tagsById: Record<TagId, TagEntity>;
  // 노드별 태그 ID 목록 (N:N, node_tags 테이블에 대응)
  tagIdsByNodeId: Record<NodeId, TagId[]>;
}
```

> **[설계 결정 — 정규화 맵 구조 채택 이유]**
> - `nodes: MindNode[]` 배열 구조는 특정 노드를 O(n) 선형 탐색해야 한다.
> - `nodesById: Record<NodeId, MindNode>` 정규화 맵은 O(1) 직접 접근이 가능하다.
> - `tagsById` / `tagIdsByNodeId` 분리로 태그 렌더링과 노드별 태그 조회를 분리하여 불필요한 리렌더링을 방지한다.
> - `edgesById`는 Radial 레이아웃의 커브 엣지 렌더링 등에 사용된다 (edge-policy.md 참조).


*   노드 이동이 쉬움
*   부분 업데이트가 쉬움
*   Undo/Redo patch 계산이 쉬움
*   autosave diff 생성이 쉬움
*   대형 맵 성능이 좋아짐

* * *

4.3 영구 상태와 임시 상태 분리
-------------------

예:

*   `node.x`, `node.y`  
    → 자유배치형일 때만 문서 상태에 저장 가능
*   `dragPreviewX`, `dragPreviewY`  
    → Interaction Store에만 있어야 함

즉, 사용자가 드래그 중인 임시 좌표는 문서 상태가 아닙니다.

* * *

4.4 Derived State는 저장하지 말고 계산
-----------------------------

아래 값들은 가급적 저장하지 않고 selector로 계산합니다.

*   현재 화면에 보이는 노드 목록
*   선택 박스 bounds
*   edge SVG path
*   필터 결과
*   레벨별 스타일 상속 결과
*   subtree별 레이아웃 좌표

이걸 저장해버리면 document 수정 때마다 동기화 지옥이 옵니다.

* * *

4.5 모든 편집은 Command 단위
---------------------

좋은 예:

*   `CREATE_CHILD_NODE`
*   `CREATE_SIBLING_NODE_AFTER`
*   `MOVE_SUBTREE`
*   `BULK_INSERT_NODES_FROM_TEXT`
*   `CHANGE_SUBTREE_LAYOUT`
*   `ADD_TAG_TO_NODE`
*   `COLLAPSE_NODE`
*   `EXPAND_NODE`

이 구조가 되어야 다중 가지 추가, AI 삽입, 단축키, 메뉴 클릭이 모두 같은 로직을 타게 됩니다. 귀하가 정리한 Node 기능과 단축키 체계도 이 방식에 아주 잘 맞습니다.

기능정의테이블

* * *

5\. 5개 Store의 역할을 최종 확정본 형태로 정의
===============================

* * *

5.1 Document Store
------------------

이 store는 **맵 문서 자체**입니다.  
가장 중요합니다.

### 책임

*   map 메타데이터 보관
*   노드/간선/태그/첨부/노트/링크의 영구 상태 보관
*   부모-자식 관계 보관
*   subtree layout 설정 보관
*   접기/펼치기 상태 보관
*   스타일/상속 규칙 보관
*   export 대상 원본 보관

### 포함해야 하는 데이터

```
interface MapEntity {
  id: string;
  title: string;
  rootNodeId: string;
  themeId: string;
  defaultLayoutType: LayoutType;
  levelFontRules: LevelFontRule[];
  createdAt: string;
  updatedAt: string;
  version: number;
}
```

```
type LayoutType =
  | "radial-bidirectional"
  | "radial-right"
  | "radial-left"
  | "tree-up"
  | "tree-down"
  | "tree-right"
  | "tree-left"
  | "hierarchy-right"
  | "hierarchy-left"
  | "process-right"
  | "process-left"
  | "process-right-a"
  | "process-right-b"
  | "freeform";
```

이 layout 타입은 귀하가 정리한 레이아웃 표를 그대로 기준으로 삼는 것이 맞습니다.

기능정의테이블

### Node 모델 예시

```
interface MindNode {
  id: string;
  mapId: string;
  parentId: string | null;
  text: string;
  note?: string;
  tagIds: string[];
  hyperlinkIds: string[];
  attachmentIds: string[];
  mediaId?: string | null;

  layoutType?: LayoutType | null; // null이면 부모/맵 기본값 상속
  shapeType: NodeShapeType;
  fillColor: string;
  borderColor: string;
  textColor: string;

  fontFamily?: string | null;
  fontSizeMode: "inherit-level-rule" | "custom";
  fontSize?: number | null;
  fontWeight?: number | null;

  collapsed: boolean;
  orderIndex: number;

  // 자유배치형에서만 영구 저장
  manualPosition?: {
    x: number;
    y: number;
  } | null;

  inheritStyleFromParent: boolean;
  inheritShapeFromParent: boolean;

  createdAt: string;
  updatedAt: string;
}
```

### 왜 이렇게 세세해야 하나

귀하 요구사항에는 이미 이런 것들이 있습니다.

*   형제/자식 생성 시 기준 노드 도형/색상 상속
*   레벨별 폰트 크기 정책
*   subtree layout
*   태그 기능
*   링크/첨부/멀티미디어
*   접기/펼치기
*   다중 가지 생성

이건 단순한 `id/text/children` 구조로는 절대 못 버팁니다.

tag기능

◆ ‘다중 가지’ 추가

기능정의테이블

* * *

5.2 Editor UI Store
-------------------

이 store는 문서가 아니라 **에디터 화면 상태**입니다.

### 책임

*   현재 열린 패널
*   속성 패널 탭
*   검색창 문자열
*   활성 툴
*   AI 패널 상태
*   export 모달
*   context menu 상태
*   우측 사이드바 열림 여부
*   태그 explorer 열림 여부

### 예시 구조

```
interface EditorUIState {
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;

  activeInspectorTab:
    | "style"
    | "layout"
    | "note"
    | "tag"
    | "link"
    | "attachment";

  activeTool: "select" | "pan" | "text" | "tag-filter";

  searchQuery: string;
  searchPanelOpen: boolean;

  tagExplorerOpen: boolean;
  aiPanelOpen: boolean;
  exportDialogOpen: boolean;

  contextMenu: {
    open: boolean;
    x: number;
    y: number;
    targetType: "node" | "canvas" | "tag" | null;
    targetId: string | null;
  };

  toasts: ToastMessage[];
}
```

### 절대 넣으면 안 되는 것

*   노드 텍스트
*   노드 관계
*   레이아웃 원본 데이터
*   저장 여부 원본 진실

그건 모두 Document나 Autosave 쪽입니다.

* * *

5.3 Viewport Store
------------------

이 store는 캔버스의 “카메라”입니다.

### 책임

*   줌 레벨
*   팬 offset
*   현재 보이는 월드 좌표 범위
*   fit-to-screen 상태
*   selected node center 이동
*   minimap viewport box

### 예시 구조

```
interface ViewportState {
  zoom: number;           // 0.1 ~ 4.0
  panX: number;
  panY: number;

  canvasWidth: number;
  canvasHeight: number;

  worldBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;

  isPanning: boolean;
  lastCenterNodeId: string | null;
}
```

### 중요한 포인트

노드 좌표와 화면 좌표를 섞으면 안 됩니다.

*   문서/레이아웃 엔진이 계산한 좌표 = **world coordinates**
*   줌/팬 적용 후 보이는 좌표 = **screen coordinates**

Viewport Store는 오직 이 변환만 담당합니다.

* * *

5.4 Interaction Store
---------------------

이 store는 **아주 짧게 사는 상태**입니다.

### 책임

*   드래그 중인 노드
*   hover 중인 노드
*   marquee selection 박스
*   연결선 프리뷰
*   텍스트 편집 draft
*   다중 가지 입력 모달 임시 텍스트
*   키보드 조합 상태
*   드롭 타겟 후보

### 예시 구조

```
interface InteractionState {
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

  editingText:
    | {
        nodeId: string;
        draft: string;
        selectionStart: number;
        selectionEnd: number;
      }
    | null;

  bulkInsert:
    | {
        parentNodeId: string;
        rawText: string;
      }
    | null;

  pressedKeys: {
    shift: boolean;
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
    space: boolean;
  };
}
```

### 핵심

드래그 중 좌표는 여기 저장합니다.  
드래그가 확정되면 그때 Command를 날려 Document Store를 바꿉니다.

* * *

5.5 Autosave Store
------------------

이 store는 **문서 저장 상태**입니다.

### 책임

*   dirty 여부
*   아직 서버에 안 보낸 patch 큐
*   마지막 저장 성공 시각
*   저장 실패 상태
*   재시도 대기
*   서버 version / local version 비교
*   충돌 감지

### 예시 구조

```
interface AutosaveState {
  isDirty: boolean;
  isSaving: boolean;

  pendingCommands: EditorCommand[];
  pendingPatches: Patch[];

  lastSavedAt: string | null;
  lastSyncedVersion: number | null;

  saveError: {
    code: string;
    message: string;
    retryCount: number;
  } | null;

  networkStatus: "online" | "offline" | "degraded";
}
```

### 왜 별도 store가 필요한가

자동저장은 단순 `saving=true`가 아닙니다.

예를 들어:

*   텍스트 입력 중 debounce 저장 대기
*   노드 이동 완료 직후 즉시 저장
*   저장 실패 후 재시도
*   오프라인 중 local queue 유지

이건 문서 store 안에 넣으면 너무 지저분해집니다.

귀하 기능정의표에 있는 autosave trigger들(노드 생성/삭제/이동/text 수정/layout 변경)도 이 store에서 관리하는 게 맞습니다.

기능정의테이블

* * *

6\. Store 사이 관계
===============

아래처럼 이해하면 됩니다.

```
Document Store
   └─ "무엇이 존재하는가?"

Editor UI Store
   └─ "어떤 UI가 열려 있는가?"

Viewport Store
   └─ "어떻게 보고 있는가?"

Interaction Store
   └─ "지금 사용자가 무엇을 하고 있는가?"

Autosave Store
   └─ "서버와 얼마나 동기화되었는가?"
```

* * *

7\. 진짜 핵심: Command 기반 편집 아키텍처
=============================

이 부분이 Figma급 구조의 핵심입니다.

모든 편집은 아래 형식의 command로 통일합니다.

```
type EditorCommand =
  | { type: "CREATE_CHILD_NODE"; parentId: string; index?: number }
  | { type: "CREATE_SIBLING_NODE_AFTER"; nodeId: string }
  | { type: "CREATE_SIBLING_NODE_BEFORE"; nodeId: string }
  | { type: "UPDATE_NODE_TEXT"; nodeId: string; text: string }
  | { type: "DELETE_NODE"; nodeId: string }
  | { type: "MOVE_SUBTREE"; nodeId: string; newParentId: string; newIndex: number }
  | { type: "CHANGE_SUBTREE_LAYOUT"; nodeId: string; layoutType: LayoutType }
  | { type: "COLLAPSE_NODE"; nodeId: string }
  | { type: "EXPAND_NODE"; nodeId: string }
  | { type: "ADD_TAG_TO_NODE"; nodeId: string; tagName: string }
  | { type: "REMOVE_TAG_FROM_NODE"; nodeId: string; tagId: string }
  | { type: "BULK_INSERT_NODES"; parentId: string; rawText: string }
  | { type: "APPLY_AI_TREE"; parentId: string; markdown: string };
```

### 이 구조의 장점

같은 기능을 여러 입력 방식으로 호출할 수 있습니다.

예:

*   Space 키
*   상단 메뉴 클릭
*   우클릭 메뉴
*   AI 자동 생성
*   붙여넣기
*   다중 가지 모달 확인 버튼

모두 결국 같은 command를 호출하면 됩니다.

* * *

8\. Reducer 계층 설계
=================

Command가 들어오면 reducer가 Document Store를 갱신합니다.

```
dispatch(command)
  → validate(command, currentState)
  → produce(nextDocumentState, patches, inversePatches)
  → commit(documentStore)
  → push(history)
  → enqueue(autosave)
```

### 여기서 중요한 것

하나의 command는 반드시 아래를 함께 만들어야 합니다.

*   next state
*   redo용 patch
*   undo용 inverse patch
*   autosave용 patch/event

즉, 한 번 만든 결과를  
렌더링 / 저장 / Undo/Redo가 같이 재사용해야 합니다.

* * *

9\. Undo / Redo 아키텍처
====================

귀하가 별도로 요청하신 history 설계와도 정확히 연결됩니다.

구조
--

```
interface HistoryState {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
}

interface HistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  patches: Patch[];
  inversePatches: Patch[];
  scope: "document";
}
```

### 원칙

*   Undo/Redo는 **Document Store만** 되돌립니다.
*   UI 열림/닫힘, hover, 드래그 중 상태는 Undo 대상이 아닙니다.
*   텍스트 입력은 글자 하나하나가 아니라 적당히 merge batching 해야 합니다.
*   drag move도 마우스 한 픽셀마다가 아니라 drop 완료 시 1개 history entry로 묶어야 합니다.

### 예

*   노드 드래그 시작 → preview만 Interaction Store
*   드롭 완료 → `MOVE_SUBTREE` command 1개
*   history entry 1개 생성

이게 맞습니다.

* * *

10\. Layout Engine을 Store와 분리해야 하는 이유
=====================================

많이들 실수하는 부분입니다.

레이아웃은 문서 상태가 아닙니다.  
레이아웃은 대부분 **문서 상태를 입력으로 받아 계산되는 결과**입니다.

즉:

*   노드 관계
*   layoutType
*   collapsed 여부
*   텍스트 크기
*   간격 규칙

을 입력으로 받아

*   node world position
*   subtree bounds
*   edge path
*   overlap avoidance 결과

를 계산해야 합니다.

그래서 구조는 이렇게 갑니다
---------------

```
Document Store
   ↓
Resolved Tree Model
   ↓
Layout Engine
   ↓
Layout Cache / Selectors
   ↓
Renderer
```

* * *

11\. Layout 관련 상태를 어디에 둘 것인가
============================

Document Store에 있어야 하는 것
------------------------

*   node.layoutType
*   map.defaultLayoutType
*   collapsed
*   manualPosition (freeform)
*   level font rules
*   node style / shape
*   subtree direction rules

계산으로 만들어야 하는 것
--------------

*   실제 x/y 좌표
*   subtree width / height
*   edge bezier path
*   visible node list
*   hidden-by-collapse list

* * *

12\. Selector Layer 설계
======================

Figma급 설계에서는 selector가 엄청 중요합니다.

### 추천 selector 예시

```
selectNodeById(nodeId)
selectChildren(nodeId)
selectParent(nodeId)
selectAncestors(nodeId)
selectDescendants(nodeId)

selectResolvedNodeStyle(nodeId)
selectResolvedLayoutType(nodeId)
selectNodeDepth(nodeId)

selectVisibleTree()
selectVisibleNodes()
selectVisibleEdges()

selectNodeWorldRect(nodeId)
selectNodeScreenRect(nodeId)

selectSelectionBounds()
selectSearchMatches()
selectTagFilteredNodeIds()

selectAutosaveStatus()
selectCanUndo()
selectCanRedo()
```

### 왜 중요하나

컴포넌트가 raw state를 직접 뒤지기 시작하면 곧바로 엉망이 됩니다.

컴포넌트는 selector만 사용해야 합니다.

* * *

13\. 다중 가지 추가 기능은 상태 아키텍처에서 어떻게 다뤄야 하는가
=======================================

귀하가 첨부한 다중 가지 추가 규칙은 매우 명확합니다.

*   `Ctrl + Space`
*   한 줄에 한 가지
*   앞 공백(space)으로 하위 계층 표현
*   확인 시 여러 계층이 한 번에 생성
    ◆ ‘다중 가지’ 추가

이 기능은 절대 “for문으로 노드 여러 개 추가”로 끝내면 안 됩니다.

정답 구조
-----

### Interaction Store

사용자가 입력 중인 raw text 보관

```
bulkInsert: {
  parentNodeId: string;
  rawText: string;
}
```

### Parser Layer

입력 텍스트를 중간 트리 구조로 변환

```
interface ParsedBulkNode {
  text: string;
  children: ParsedBulkNode[];
}
```

### Command

최종 반영은 하나의 command

```
{
  type: "BULK_INSERT_NODES",
  parentId: "node_123",
  rawText: "1차 가지\n 2차 가지\n다음 가지"
}
```

### Reducer

이 command 하나가:

*   노드 여러 개 생성
*   parent-child 연결
*   orderIndex 부여
*   shape/style 상속
*   history entry 1개 생성
*   autosave patch 1개 묶음 생성

을 해야 합니다.

이게 진짜 중요합니다.

* * *

14\. Tag 기능은 어디에 놓는가
====================

귀하의 Tag 명세 기준으로 보면, Tag는 분명히 **문서 의미 데이터**입니다.

tag기능

Document Store
--------------

*   tagsById
*   node.tagIds

Editor UI Store
---------------

*   tag explorer 열림
*   tag search query
*   filter mode(highlight/dim/hide)

Derived Selector
----------------

*   tag usage count
*   tag filtered nodes
*   current map visible filter result

즉, 태그 원본은 Document,  
태그 패널 UI는 Editor UI,  
태그 결과 계산은 Selector Layer 입니다.

* * *

15\. 선택(Selection) 상태는 어디에 두는가
==============================

선택은 문서가 아닙니다.  
UI/Interaction 쪽입니다.

이유
--

같은 문서를 다른 사용자/브라우저에서 열어도 선택 상태는 달라야 합니다.

### 추천

*   현재 확정된 selection: `Interaction Store`
*   selection box rectangle: `Interaction Store`
*   selection inspector open: `Editor UI Store`

```
selectedNodeIds: string[]
anchorNodeId: string | null
focusNodeId: string | null
```

* * *

16\. 텍스트 편집은 어떻게 설계해야 하는가
=========================

이 부분도 자주 꼬입니다.

원칙
--

*   사용자가 입력 중인 draft는 Interaction Store
*   입력 확정 시 Document Store 반영
*   debounce autosave는 확정 또는 일정 간격으로 실행

### 왜 이렇게?

노드 텍스트를 글자 입력마다 Document Store에 바로 반영해도 되지만,  
IME(한글 입력), 조합 중 상태, 취소 처리 때문에 draft 레이어가 있는 편이 안정적입니다.

### 추천 방식

*   더블클릭 → `editingText.nodeId` 설정
*   draft 수정 → Interaction Store만 변경
*   Enter / Blur / debounce commit → `UPDATE_NODE_TEXT` command
*   history batching 적용

* * *

17\. 드래그 앤 드롭은 어떻게 흘러가야 하나
==========================

정상적인 파이프라인은 이렇습니다.

단계
--

1.  pointer down  
    → `Interaction.dragging` 시작
2.  pointer move  
    → preview 좌표 변경  
    → drop target 후보 계산  
    → Document Store는 아직 안 바뀜
3.  pointer up  
    → 실제 drop 유효성 검사  
    → `MOVE_SUBTREE` command 실행  
    → history/autosave 반영

### 절대 금지

마우스 move마다 문서 상태를 계속 바꾸는 것

그렇게 하면:

*   렌더링 과부하
*   autosave 폭주
*   undo stack 오염
*   layout 떨림

이 발생합니다.

* * *

18\. Autosave 파이프라인 최종 설계
=========================

귀하 요구는 편집 중 실시간 DB 저장입니다.  
하지만 “모든 순간 즉시 저장”은 아닙니다.

추천 정책
-----

### 즉시 저장 대상

*   노드 생성
*   노드 삭제
*   부모 변경
*   layout 변경
*   태그 추가/삭제
*   AI 결과 삽입
*   다중 가지 추가 확정

### debounce 저장 대상

*   텍스트 편집
*   노트 편집
*   세부 스타일 변경 연속 입력

### Autosave 파이프라인

```
Command 실행
   ↓
Autosave enqueue
   ↓
동일 범주의 연속 command batching
   ↓
PATCH /maps/:id
   ↓
성공 시 lastSyncedVersion 갱신
실패 시 retry queue 보관
```

저장 단위 추천
--------

초기 MVP:

*   snapshot + patch log 병행

즉:

*   서버에는 최신 문서 snapshot 저장
*   revision/history용 patch도 남김

이 방식이 제일 현실적입니다.

* * *

19\. 협업을 고려한 상태 확장 여지
=====================

지금은 단일 사용자 기준으로 가더라도, 아키텍처는 협업 확장을 막지 않아야 합니다.

추가될 층
-----

향후 실시간 협업 시에는 Autosave Store 위에 아래가 추가됩니다.

```
Local Command
   ↓
Optimistic Apply
   ↓
Local Document State
   ↓
Sync Engine
   ↓
Remote Ops / CRDT
   ↓
Reconcile
```

즉, 지금 command 기반 구조를 써두면  
나중에 local command를 remote operation으로 바꾸기 쉽습니다.

* * *

20\. Zustand 기준 실제 구현 모듈 구조 추천
==============================

귀하 프로젝트에는 Zustand가 잘 맞습니다.

```
src/editor/state/
  documentStore.ts
  editorUIStore.ts
  viewportStore.ts
  interactionStore.ts
  autosaveStore.ts

  commands/
    dispatchCommand.ts
    commandTypes.ts
    validators.ts

  history/
    historyStore.ts
    patchBuilder.ts

  selectors/
    documentSelectors.ts
    layoutSelectors.ts
    viewportSelectors.ts
    tagSelectors.ts
    searchSelectors.ts

  layout/
    layoutEngine.ts
    radialLayout.ts
    treeLayout.ts
    hierarchyLayout.ts
    processLayout.ts
    freeformLayout.ts

  autosave/
    autosaveWorker.ts
    patchQueue.ts
    conflictResolver.ts
```

* * *

21\. 최종 타입 초안
=============

아래처럼 큰 틀을 잡으면 됩니다.

```
interface EditorRootState {
  document: DocumentState;
  editorUI: EditorUIState;
  viewport: ViewportState;
  interaction: InteractionState;
  autosave: AutosaveState;
  history: HistoryState;
}
```

하지만 실제 Zustand에서는 **완전 하나의 giant store**보다  
**store 분리 + 공통 dispatcher**가 더 좋습니다.

제 추천은:

*   store는 분리
*   command dispatcher는 공통
*   selector도 모듈화
*   React 컴포넌트는 필요한 store만 구독

입니다.

* * *

22\. 성능 최적화 원칙
==============

Figma급 설계라면 성능 원칙도 함께 들어가야 합니다.

필수 원칙
-----

### 1) 정규화 + id 기반 구독

노드 컴포넌트는 자기 nodeId만 구독

### 2) selector memoization

레이아웃, 태그 필터, 검색 결과는 memoization

### 3) drag preview는 lightweight

드래그 중에는 문서 전체 재계산 최소화

### 4) layout recalculation scope 제한

subtree 변경이면 subtree만 재계산

### 5) edge path lazy recompute

영향받은 간선만 다시 그림

### 6) viewport culling

아주 큰 맵은 화면 밖 노드 렌더 최소화

* * *

23\. 이 프로젝트에 맞는 최종 아키텍처 결론
==========================

제가 easymindmap에 최종 추천하는 상태 아키텍처는 아래입니다.

핵심 결론
-----

### 1\. Store는 5개로 분리

*   Document
*   Editor UI
*   Viewport
*   Interaction
*   Autosave

### 2\. 모든 편집은 Command 기반

*   키보드
*   메뉴
*   AI 결과
*   다중 가지
*   붙여넣기  
    모두 같은 command pipeline

### 3\. 레이아웃은 저장보다 계산 중심

*   원본은 document
*   좌표/경로는 selector + layout engine

### 4\. Undo/Redo는 patch 기반

*   UI 상태는 제외
*   document 변경만 기록

### 5\. autosave는 별도 파이프라인

*   dirty queue
*   batching
*   retry
*   version sync

### 6\. 협업 확장을 막지 않는 구조

*   local command → future remote ops 가능

* * *

24\. easymindmap용 최종 추천 구조 요약도
==============================

```
[Document Store]
  map / nodes / edges / tags / styles / layout settings

[Editor UI Store]
  panels / dialogs / active tool / search UI / explorer UI

[Viewport Store]
  zoom / pan / screen bounds / center

[Interaction Store]
  selection / dragging / editing / marquee / pressed keys

[Autosave Store]
  dirty / pending patches / last saved / save errors / sync version

+ Command Engine
+ History Engine
+ Layout Engine
+ Selector Layer
```

* * *

25\. 한 줄 최종 결론
==============

**easymindmap Editor는 “정규화된 Document Store + 분리된 UI/Viewport/Interaction/Autosave Store + Command/History/Layout 엔진” 구조로 가야 하며, 이것이 귀하가 원하는 Figma급 안정성, 확장성, Undo/Redo, autosave, subtree layout, 다중 가지, tag, AI 삽입까지 모두 감당할 수 있는 가장 현실적인 전문가 설계입니다.**

기능정의테이블

tag기능

◆ ‘다중 가지’ 추가

다음 단계로 바로 이어서  
**“5개 store의 TypeScript 실제 인터페이스 설계서”** 형태로 코드 수준까지 내려가 드리겠습니다.

## Prompt:
#이제 이 대화는 여기서 종료하고 추가 대화는 새 대화에서 질문할꼐..
#여때까지의 대화 내용을 프로젝트의 다른 질문및 대화에서 참조할수 있도록 기억하고 업데이트해줘

## Response:
저장된 메모리 업데이트됨

좋습니다.  
여기까지 논의한 easymindmap 설계 방향은 기억해두고, 다음 새 대화에서도 이어서 반영하겠습니다.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
