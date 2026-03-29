# 상태관리 설명 초보자용

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 1:31:46  
**Updated:** 3/16/2026 1:56:34  
**Exported:** 3/16/2026 2:04:37  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6deec-7104-83a5-b5fe-266f24dd1b07](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6deec-7104-83a5-b5fe-266f24dd1b07)  

## Prompt:
상태관리(State Management)에 대해 IT초보자 수준으로 자세히 설명해줘 

상태는 다음 5개 store로 나눈다.

Document Store
Editor UI Store
Viewport Store
Interaction Store
Autosave Store
9.1 Document Store

## Response:
좋습니다.  
지금 설계 중인 **easymindmap Editor 구조**에서 **State Management(상태관리)**는 핵심 중 핵심입니다.  
특히 지금 정의한 기능들(노드 생성, 이동, 레이아웃 변경, 자동저장 등)은 모두 **상태(State)**를 중심으로 동작합니다. 예를 들어 node 생성, 이동, layout 변경, autosave 등은 모두 상태 변경 이벤트입니다.

기능정의테이블

그래서 Editor 내부 상태를 **5개의 Store로 분리**하는 설계는 매우 좋은 방식입니다.

설계된 Store

1.  Document Store
2.  Editor UI Store
3.  Viewport Store
4.  Interaction Store
5.  Autosave Store

이제 **IT 초보자도 이해할 수 있게** 설명하겠습니다.

* * *

1️⃣ 상태관리(State Management)란 무엇인가
================================

먼저 개념부터 쉽게 설명하겠습니다.

웹앱은 화면에 보이는 모든 정보가 **어떤 상태(state)**를 가지고 있습니다.

예를 들어 mindmap editor에서 상태는 다음과 같습니다.

예시 상태

```
현재 map 제목
현재 노드 목록
현재 선택된 노드
현재 zoom level
현재 drag 중인지 여부
현재 저장 중인지 여부
```

이 모든 것이 **state** 입니다.

즉,

👉 **State = 프로그램의 현재 상황**

예

```
node 1 선택됨
zoom = 120%
drag 중
autosave 진행중
```

이런 값들이 전부 state입니다.

* * *

2️⃣ 왜 상태관리 시스템이 필요한가
====================

마인드맵 에디터에서는 상태가 매우 많습니다.

예를 들어

```
노드 생성
노드 삭제
노드 이동
노드 접기
노드 펼치기
layout 변경
zoom 변경
drag 상태
autosave 상태
```

이 상태들이 서로 연결됩니다.

예

```
node 이동
→ document 변경
→ autosave 필요
→ 화면 다시 렌더링
```

그래서 상태를 **체계적으로 관리해야 합니다.**

이걸 **State Management**라고 합니다.

* * *

3️⃣ easymindmap 상태 구조
=====================

Editor의 상태를 **한 곳에 몰아넣으면 망합니다.**

그래서 보통 **여러 Store로 나눕니다.**

여기서는 5개로 나눕니다.

```
Editor State

├ Document Store
├ Editor UI Store
├ Viewport Store
├ Interaction Store
└ Autosave Store
```

이 구조는 **대형 웹 에디터들이 사용하는 방식입니다.**

예

```
Figma
Miro
Notion
Excalidraw
```

* * *

4️⃣ 5개 Store 개념
===============

이제 하나씩 설명하겠습니다.

* * *

9.1 Document Store
==================

이것이 **가장 중요한 Store입니다.**

Document Store는

👉 **Mindmap 데이터 자체**

를 저장합니다.

즉

```
node
edge
text
layout
structure
```

모두 여기 있습니다.

예

```
Document Store
```

```
{
  mapId: "map_001",

  nodes: [
    {
      id: "n1",
      text: "AI",
      parentId: null,
      layoutType: "radial",
      collapsed: false
    },

    {
      id: "n2",
      text: "Machine Learning",
      parentId: "n1"
    }
  ]
}
```

즉

Document Store = **Mindmap 데이터**

* * *

### Document Store 역할

역할은 다음입니다.

1️⃣ Node 생성  
2️⃣ Node 삭제  
3️⃣ Node 이동  
4️⃣ Node 텍스트 수정  
5️⃣ Layout 변경  
6️⃣ Collapse 상태

예

```
createNode()
deleteNode()
moveNode()
updateText()
changeLayout()
```

이것이 **Document Store 책임입니다.**

* * *

### Document Store 특징

특징

```
가장 중요한 상태
DB에 저장되는 데이터
Undo / Redo 대상
Autosave 대상
```

즉

```
Document Store = 실제 문서
```

* * *

9.2 Editor UI Store
===================

이 Store는 **UI 상태만 관리합니다.**

즉 **문서 데이터와 상관없는 상태**

예

```
현재 선택된 노드
오른쪽 패널 열림 여부
AI 패널 열림 여부
Tag Explorer 열림 여부
검색창 상태
```

예

```
Editor UI Store
```

```
{
  selectedNodeId: "n2",

  panels: {
    aiPanel: true,
    tagExplorer: false
  },

  searchQuery: "AI"
}
```

* * *

### UI Store 특징

```
DB 저장 안함
새로고침하면 초기화
UI 상태만 관리
```

예

```
node 선택
panel 열기
검색창 입력
```

* * *

9.3 Viewport Store
==================

Viewport는

👉 **화면 위치 상태**

입니다.

예

```
zoom
pan
canvas 위치
```

예

```
Viewport Store
```

```
{
  zoom: 1.2,

  pan: {
    x: 120,
    y: -40
  }
}
```

즉

```
사용자가 화면을 어디 보고 있는가
```

를 관리합니다.

* * *

### Viewport Store 역할

예

```
Zoom In
Zoom Out
Pan
Fit Screen
Center Node
```

이 기능들은 전부 **Viewport Store 상태**입니다.

실제로 기능 정의에도 있습니다.

```
Zoom In
Zoom Out
Fit Screen
Pan Canvas
Center Node
```

기능정의테이블

* * *

9.4 Interaction Store
=====================

이 Store는

👉 **사용자의 현재 행동**

을 저장합니다.

예

```
drag 중
selection box 사용 중
node resize 중
keyboard 입력 중
```

예

```
Interaction Store
```

```
{
  draggingNodeId: "n3",

  dragStartPosition: {
    x: 200,
    y: 100
  },

  selecting: true
}
```

* * *

### Interaction Store 특징

이 Store는

```
매우 자주 바뀜
렌더링에 중요
DB 저장 안함
```

예

```
drag
hover
selection
```

* * *

9.5 Autosave Store
==================

이 Store는

👉 **자동 저장 관리**

입니다.

Mindmap은 편집 중에 계속 저장됩니다.

문서에서도 정의되어 있습니다.

```
Auto Save

trigger
node 생성
node 삭제
node 이동
text 수정
layout 변경
```

기능정의테이블

* * *

### Autosave Store 상태

예

```
Autosave Store
```

```
{
  saving: false,

  lastSavedAt: "2026-03-16 10:12",

  pendingChanges: true
}
```

* * *

### Autosave 흐름

예

```
node 이동
→ Document Store 변경
→ Autosave Store dirty = true
→ 1초 후 저장
→ DB 저장
→ dirty = false
```

* * *

5️⃣ 전체 구조
=========

전체 상태 구조는 이렇게 됩니다.

```
Editor State

Document Store
   └ mindmap data

Editor UI Store
   └ UI 상태

Viewport Store
   └ zoom / pan

Interaction Store
   └ drag / select

Autosave Store
   └ 저장 상태
```

* * *

6️⃣ 실제 코드 구조 예 (Zustand)
========================

React 기준 예입니다.

```
/stores

documentStore.ts
uiStore.ts
viewportStore.ts
interactionStore.ts
autosaveStore.ts
```

예

```
documentStore.ts
```

```
const useDocumentStore = create((set) => ({
  nodes: [],

  createNode: (node) =>
    set((state) => ({
      nodes: [...state.nodes, node]
    })),

  deleteNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter(n => n.id !== id)
    }))
}));
```

* * *

7️⃣ 왜 5개 Store로 나누는가
====================

이유는 매우 중요합니다.

만약 하나의 Store에 다 넣으면

```
state 변경
→ 전체 rerender
→ 성능 폭발
```

그래서 분리합니다.

예

```
zoom 변경
→ viewport만 변경
→ document rerender 없음
```

* * *

8️⃣ 실제 대형 에디터 구조
================

대형 에디터들도 동일한 구조입니다.

예

```
Figma
```

```
Document
Viewport
Selection
Interaction
History
```

예

```
Excalidraw
```

```
elements
appState
history
```

* * *

9️⃣ 핵심 정리
=========

easymindmap 상태 구조

```
Document Store
= Mindmap 데이터

Editor UI Store
= UI 상태

Viewport Store
= zoom / pan

Interaction Store
= drag / select

Autosave Store
= 저장 상태
```

* * *

🔟 매우 중요한 설계 원칙
===============

반드시 지켜야 할 것

```
Document Store만 DB 저장 대상
```

나머지는

```
UI 상태
```

입니다.

* * *

💡 원하시면 다음을 이어서 설명해 드리겠습니다.

1️⃣ **Document Store 실제 데이터 구조 (Node / Edge / Map)**  
2️⃣ **Undo / Redo History Store 설계**  
3️⃣ **Node 좌표 계산 알고리즘**  
4️⃣ **Mindmap Editor 전체 상태 아키텍처 (Figma급 설계)**

특히 **Document Store 구조는 mindmap 엔진의 핵심**이라  
제가 **실제 구현 가능한 수준의 설계도**까지 만들어 드릴 수 있습니다.

## Prompt:
ok~너가 제시한대로 진행해줘

## Response:
좋습니다.  
그럼 제가 제시한 순서대로 **실제 개발 가능한 수준**으로 차근차근 진행하겠습니다.

이번 단계는 가장 중요한

1️⃣ Document Store 실제 데이터 구조 설계
===============================

입니다.

이게 잘 잡혀야 이후에

*   Node 생성/삭제
*   다중 가지 추가
*   레이아웃 변경
*   태그
*   자동저장
*   Undo/Redo
*   AI mindmap 생성

이 전부 자연스럽게 연결됩니다.  
특히 현재 기능 정의상 node 생성, 삭제, 이동, layout 변경, tag, autosave 같은 기능이 모두 Document 중심으로 움직이므로, Document Store는 editor의 “심장”이라고 보면 됩니다.

기능정의테이블

* * *

1\. Document Store란 다시 한 번 쉽게 설명
================================

Document Store는 한마디로

**“사용자가 만든 mindmap 원본 데이터”**

입니다.

즉 화면에서 보이는 마인드맵은 사실 전부 이 데이터에서 나옵니다.

예를 들면 사용자가

*   루트 노드 생성
*   자식 노드 추가
*   다중 가지 추가
*   layout 변경
*   tag 추가
*   노드 접기

를 하면, 실제로는 전부 **Document Store 데이터가 바뀌는 것**입니다.

즉,

```
화면이 바뀌는 이유
= Document Store가 바뀌었기 때문
```

* * *

2\. Document Store가 가져야 할 원칙
============================

먼저 원칙부터 정하겠습니다.

원칙 1. 화면 상태와 문서 상태를 분리한다
------------------------

Document Store에는 **문서 자체 데이터만** 넣습니다.

넣는 것:

*   map 정보
*   node 정보
*   edge 정보
*   tag 정보
*   layout 정보

넣지 않는 것:

*   현재 선택된 노드
*   패널 열림 여부
*   zoom 값
*   drag 중 여부

그건 UI/Viewport/Interaction Store 책임입니다.

* * *

원칙 2. 저장 가능한 데이터만 넣는다
---------------------

Document Store 데이터는 그대로 DB에 저장되거나 export될 수 있어야 합니다.

즉,

```
Document Store = 저장 가능한 JSON
```

이 형태가 좋습니다.

* * *

원칙 3. 렌더링 데이터와 원본 데이터를 구분한다
---------------------------

예를 들어 node의 최종 화면 좌표(x, y)는 렌더링 엔진이 계산할 수도 있습니다.

그래서 구분이 필요합니다.

*   **원본 문서 데이터**: text, parentId, children, layoutType
*   **계산 결과 데이터**: 화면 좌표, edge path, bounding box

초기 설계에서는 Document Store에 기본 좌표를 둘 수 있지만,  
가능하면 “문서 원본”과 “렌더링 계산 결과”는 분리하는 게 좋습니다.

* * *

3\. Document Store 최상위 구조
=========================

추천하는 최상위 구조는 아래와 같습니다.

```
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

이걸 쉽게 풀면 이렇습니다.

```
MindmapDocument
├ 문서 기본정보
├ nodes
├ edges
├ tags
├ 문서 설정
└ 메타데이터
```

* * *

4\. 왜 nodes를 배열이 아니라 Record로 저장하는가
==================================

초보자 입장에서 이 부분이 좀 헷갈릴 수 있습니다.

배열 방식:

```
nodes: [
  { id: "n1", text: "Root" },
  { id: "n2", text: "AI" }
]
```

Record 방식:

```
nodes: {
  "n1": { id: "n1", text: "Root" },
  "n2": { id: "n2", text: "AI" }
}
```

저는 **Record 방식**을 추천합니다.

이유:

이유 1. 특정 node 찾기가 빠름
--------------------

```
nodes["n2"]
```

로 바로 접근할 수 있습니다.

배열은 매번 찾기 필요:

```
nodes.find(n => n.id === "n2")
```

* * *

이유 2. 수정이 쉬움
------------

```
nodes["n2"].text = "Machine Learning"
```

이런 식으로 접근이 명확합니다.

* * *

이유 3. 대형 map에 유리함
-----------------

노드가 많아질수록 배열 전체를 뒤지는 방식은 불편합니다.

* * *

5\. Node 데이터 구조 설계
==================

이제 핵심인 Node 구조를 잡겠습니다.

추천 구조:

```
type MindmapNode = {
  id: string;
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
  };

  depth: number;
  orderIndex: number;

  createdAt: string;
  updatedAt: string;
};
```

이걸 항목별로 풀어보겠습니다.

* * *

5.1 id
------

노드 고유 ID입니다.

예:

```
id: "node_001"
```

각 노드를 구별하는 주민등록번호 같은 개념입니다.

* * *

5.2 parentId
------------

부모 노드 ID입니다.

예:

```
parentId: "node_root"
```

루트 노드는 부모가 없으니

```
parentId: null
```

입니다.

* * *

5.3 childIds
------------

이 노드의 자식 목록입니다.

예:

```
childIds: ["node_002", "node_003"]
```

이게 매우 중요합니다.  
트리 구조를 빠르게 탐색할 수 있습니다.

* * *

5.4 text
--------

노드에 표시되는 텍스트입니다.

예:

```
text: "AI"
```

* * *

5.5 note
--------

노드의 상세 노트입니다.

예:

```
note: "이 노드는 AI 전체 개요를 설명한다."
```

이건 사용자가 노드 본문보다 긴 설명을 달 때 사용합니다.

* * *

5.6 layoutType
--------------

해당 노드 이하 subtree의 전개 방식입니다.

현재 프로젝트에서 매우 중요합니다.  
이미 layout 그룹과 종류가 정의되어 있습니다. 방사형, 트리형, 계층형, 진행트리, 자유배치형 등이 여기에 연결됩니다.

기능정의테이블

예:

```
layoutType: "radial-bidirectional"
layoutType: "tree-right"
layoutType: "freeform"
```

즉 이 값 하나로

```
이 노드 아래 자식들을 어떤 형태로 펼칠 것인가
```

를 결정합니다.

* * *

5.7 shapeType
-------------

노드 도형 종류입니다.

예:

```
shapeType: "rounded-rectangle"
shapeType: "ellipse"
shapeType: "pill"
```

사용자가 노드 스타일을 바꾸면 이 값이 바뀝니다.

* * *

5.8 style
---------

노드의 시각 스타일입니다.

예:

```
style: {
  fillColor: "#FFE08A",
  borderColor: "#D9A400",
  textColor: "#333333",
  fontSize: 16,
  fontWeight: 600
}
```

다중 가지 생성 시 기준 노드의 도형/색상 상속 요구사항과도 연결됩니다.  
즉 새 노드를 만들 때 부모 또는 기준 노드의 style을 복사하면 됩니다. 이 방향은 다중 가지 설계 요구와 잘 맞습니다.

◆ ‘다중 가지’ 추가

* * *

5.9 tags
--------

노드에 연결된 태그 목록입니다.

예:

```
tags: ["tag_ai", "tag_research"]
```

태그는 이미 별도 기능명세가 있기 때문에 node 안에는 “태그 ID 목록”만 두는 방식이 가장 깔끔합니다.

tag기능

* * *

5.10 hyperlinkIds / attachmentIds / multimediaId
------------------------------------------------

노드에 연결된 부가 리소스입니다.

예:

```
hyperlinkIds: ["link_01", "link_02"]
attachmentIds: ["file_10"]
multimediaId: "media_07"
```

이 구조가 필요한 이유는, 지금 설계 중인 node indicator 정책과 연결되기 때문입니다.  
링크/첨부/멀티미디어 개수 표시도 이 배열 길이로 계산할 수 있습니다.

* * *

5.11 collapsed
--------------

노드 접힘 여부입니다.

예:

```
collapsed: true
```

true이면 자식은 있지만 화면에 펼치지 않습니다.

기능정의에 Node 접기/펼치기가 따로 있으므로 반드시 들어가야 합니다.

기능정의테이블

* * *

5.12 manualPosition
-------------------

자유배치형일 때 사용하는 수동 좌표입니다.

예:

```
manualPosition: {
  x: 1200,
  y: 340
}
```

중요 포인트:

*   일반 radial/tree/hierarchy에서는 자동 layout가 좌표를 계산
*   freeform일 때는 사용자의 drag 결과를 저장

즉 manualPosition은 특히 **자유배치형 subtree**에서 중요합니다.

* * *

5.13 size
---------

노드 크기입니다.

예:

```
size: {
  width: 160,
  height: 48
}
```

텍스트 길이, 태그, 아이콘 등에 따라 계산될 수도 있지만,  
렌더링 최적화를 위해 캐시해둘 수 있습니다.

* * *

5.14 depth
----------

루트에서 몇 단계 아래인지입니다.

예:

```
depth: 0   // root
depth: 1   // 1레벨
depth: 2   // 2레벨
```

폰트 레벨 정책, 자동 정렬, 스타일 기본값 적용에 유용합니다.

* * *

5.15 orderIndex
---------------

형제 사이 순서입니다.

예:

```
orderIndex: 0
orderIndex: 1
orderIndex: 2
```

형제 노드 순서를 안정적으로 유지하는 데 필요합니다.

* * *

6\. Edge 데이터 구조 설계
==================

Mindmap은 엄밀히 말하면 parent-child 구조만으로도 그릴 수 있습니다.  
하지만 edge를 별도 객체로 두면 확장성이 좋아집니다.

추천 구조:

```
type MindmapEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;

  lineType?: EdgeLineType;
  style?: EdgeStyle;

  createdAt: string;
  updatedAt: string;
};
```

* * *

Edge를 따로 두는 이유
--------------

### 이유 1. 선 스타일을 독립적으로 관리 가능

현재 edge 정책도 따로 정하고 있습니다.  
예를 들어 방사형은 curve-line, 나머지는 tree-line 같은 정책과 연결할 수 있습니다.

예:

```
lineType: "curve-line"
lineType: "tree-line"
lineType: "straight-line"
```

* * *

### 이유 2. 향후 관계선 확장 가능

단순 parent-child 외에

*   관련 노드 연결선
*   참조선
*   의존관계선

같은 기능이 나중에 붙기 쉬워집니다.

* * *

7\. Tag 데이터 구조
==============

Tag는 node 내부에 문자열만 직접 넣어도 되지만,  
확장성과 검색 때문에 별도 테이블/객체가 좋습니다. 이미 tag 기능 문서도 그 방향입니다.

tag기능

추천 구조:

```
type TagEntity = {
  id: string;
  name: string;
  normalizedName: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};
```

예:

```
{
  id: "tag_ai",
  name: "AI",
  normalizedName: "ai",
  color: "#8b5cf6"
}
```

그리고 node에서는

```
tags: ["tag_ai", "tag_research"]
```

이렇게 참조만 합니다.

* * *

8\. Document Settings 구조
========================

이건 map 전체 공통 설정입니다.

추천 구조:

```
type DocumentSettings = {
  defaultLayout: LayoutType;
  defaultEdgeType: EdgeLineType;

  levelStyles: LevelStyle[];
  theme: "light" | "dark" | "system";

  autosaveEnabled: boolean;
  gridEnabled: boolean;
};
```

* * *

여기서 중요한 것: 레벨별 폰트 정책
--------------------

이전에 이야기한  
“main topic 18pt, 1레벨 16pt, 2레벨 15pt...”  
같은 정책은 여기에 넣으면 됩니다.

예:

```
levelStyles: [
  { depth: 0, fontSize: 18 },
  { depth: 1, fontSize: 16 },
  { depth: 2, fontSize: 15 },
  { depth: 3, fontSize: 14 },
  { depth: 4, fontSize: 13 },
  { depthMin: 5, fontSize: 12 }
]
```

이렇게 하면 map 단위 기본 스타일 정책을 쉽게 적용할 수 있습니다.

* * *

9\. Document Metadata 구조
========================

이건 문서 관리용 정보입니다.

```
type DocumentMetadata = {
  lastOpenedAt?: string;
  lastEditedBy?: string | null;
  nodeCount: number;
  edgeCount: number;
  tagCount: number;
};
```

이건 저장 최적화나 목록 화면 표시, 통계에 유용합니다.

* * *

10\. 전체 예시 JSON
===============

이제 감 잡히도록 전체 예시를 보여드리겠습니다.

```
{
  "id": "map_001",
  "title": "AI Architecture",
  "ownerId": "user_001",
  "version": 12,
  "rootNodeId": "node_root",

  "nodes": {
    "node_root": {
      "id": "node_root",
      "parentId": null,
      "childIds": ["node_001", "node_002"],
      "text": "AI",
      "note": null,
      "layoutType": "radial-bidirectional",
      "shapeType": "rounded-rectangle",
      "style": {
        "fillColor": "#FFE08A",
        "borderColor": "#D9A400",
        "textColor": "#333333",
        "fontSize": 18,
        "fontWeight": 700
      },
      "tags": ["tag_core"],
      "hyperlinkIds": [],
      "attachmentIds": [],
      "multimediaId": null,
      "collapsed": false,
      "manualPosition": null,
      "size": {
        "width": 180,
        "height": 56
      },
      "depth": 0,
      "orderIndex": 0,
      "createdAt": "2026-03-16T00:00:00Z",
      "updatedAt": "2026-03-16T00:00:00Z"
    },
    "node_001": {
      "id": "node_001",
      "parentId": "node_root",
      "childIds": [],
      "text": "Machine Learning",
      "note": "학습 기반 AI",
      "layoutType": "tree-right",
      "shapeType": "pill",
      "style": {
        "fillColor": "#DDEBFF",
        "borderColor": "#7AA7E0",
        "textColor": "#1F2D3D",
        "fontSize": 16,
        "fontWeight": 600
      },
      "tags": ["tag_ai"],
      "hyperlinkIds": ["link_01"],
      "attachmentIds": [],
      "multimediaId": null,
      "collapsed": false,
      "manualPosition": null,
      "size": {
        "width": 150,
        "height": 44
      },
      "depth": 1,
      "orderIndex": 0,
      "createdAt": "2026-03-16T00:00:00Z",
      "updatedAt": "2026-03-16T00:00:00Z"
    }
  },

  "edges": {
    "edge_001": {
      "id": "edge_001",
      "sourceNodeId": "node_root",
      "targetNodeId": "node_001",
      "lineType": "curve-line",
      "style": {
        "strokeWidth": 2
      },
      "createdAt": "2026-03-16T00:00:00Z",
      "updatedAt": "2026-03-16T00:00:00Z"
    }
  },

  "tags": {
    "tag_core": {
      "id": "tag_core",
      "name": "Core",
      "normalizedName": "core",
      "color": "#f59e0b",
      "createdAt": "2026-03-16T00:00:00Z",
      "updatedAt": "2026-03-16T00:00:00Z"
    },
    "tag_ai": {
      "id": "tag_ai",
      "name": "AI",
      "normalizedName": "ai",
      "color": "#8b5cf6",
      "createdAt": "2026-03-16T00:00:00Z",
      "updatedAt": "2026-03-16T00:00:00Z"
    }
  },

  "settings": {
    "defaultLayout": "radial-bidirectional",
    "defaultEdgeType": "curve-line",
    "levelStyles": [
      { "depth": 0, "fontSize": 18 },
      { "depth": 1, "fontSize": 16 },
      { "depth": 2, "fontSize": 15 },
      { "depth": 3, "fontSize": 14 },
      { "depth": 4, "fontSize": 13 },
      { "depthMin": 5, "fontSize": 12 }
    ],
    "theme": "light",
    "autosaveEnabled": true,
    "gridEnabled": false
  },

  "metadata": {
    "nodeCount": 2,
    "edgeCount": 1,
    "tagCount": 2,
    "lastEditedBy": "user_001"
  },

  "createdAt": "2026-03-16T00:00:00Z",
  "updatedAt": "2026-03-16T00:00:00Z"
}
```

* * *

11\. 다중 가지 추가가 이 구조에서 어떻게 처리되는가
===============================

다중 가지 추가는 이미 “한 줄에 한 가지, 앞 공백으로 하위 계층 표현” 규칙으로 정리되어 있습니다.

◆ ‘다중 가지’ 추가

예를 들어 사용자가 이렇게 입력했다고 합시다.

```
Backend
 API
  Auth
  DB
Frontend
 UI
```

그러면 parser가 계층을 읽어서

*   Backend
    *   API
        *   Auth
        *   DB
*   Frontend
    *   UI

이런 subtree를 만들면 됩니다.

이때 Document Store에는 결국 다음 작업만 일어납니다.

1.  새 node 여러 개 생성
2.  각 node의 parentId 설정
3.  각 부모의 childIds 갱신
4.  orderIndex 부여
5.  기준 노드 style/layout 상속

즉 다중 가지 추가도 결국 Document Store 조작 문제입니다.

* * *

12\. Document Store에서 반드시 제공해야 할 핵심 함수
======================================

이제 실제 Store API를 정의해보겠습니다.

```
type DocumentStore = {
  document: MindmapDocument | null;

  createNode: (input: CreateNodeInput) => string;
  createNodesBulk: (input: BulkCreateNodesInput) => string[];

  updateNodeText: (nodeId: string, text: string) => void;
  updateNodeNote: (nodeId: string, note: string | null) => void;

  moveNode: (nodeId: string, newParentId: string, newIndex?: number) => void;
  reorderChildren: (parentId: string, orderedChildIds: string[]) => void;

  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => string;

  setNodeLayout: (nodeId: string, layoutType: LayoutType) => void;
  setNodeCollapsed: (nodeId: string, collapsed: boolean) => void;

  addTagToNode: (nodeId: string, tagId: string) => void;
  removeTagFromNode: (nodeId: string, tagId: string) => void;

  setNodeStyle: (nodeId: string, patch: Partial<NodeStyle>) => void;

  setManualPosition: (nodeId: string, x: number, y: number) => void;

  replaceDocument: (doc: MindmapDocument) => void;
  applyPatch: (patch: DocumentPatch) => void;
};
```

* * *

13\. 초보자 관점에서 이 함수들이 왜 필요한가
===========================

예를 들어 사용자가 스페이스를 눌러 자식 노드를 만들면

```
Space
→ createNode()
→ nodes 추가
→ parent childIds 갱신
→ edge 생성
→ updatedAt 갱신
→ autosave dirty
```

이렇게 됩니다.

즉 버튼 하나 눌러도 내부적으로는 Store 함수가 여러 일을 합니다.

그래서 “그냥 배열에 push” 하는 수준으로 끝내면 나중에 꼭 꼬입니다.

* * *

14\. Document Store와 Autosave의 관계
=================================

매우 중요합니다.

Document Store가 바뀌면 Autosave Store는 이렇게 판단합니다.

```
Document 변경됨
→ dirty = true
→ debounce 시작
→ 서버 저장
→ 성공 시 dirty = false
```

즉 Autosave는 스스로 문서를 갖고 있지 않고,  
**Document Store 변경을 감지해서 저장만 담당**하는 구조가 가장 좋습니다.

* * *

15\. Document Store와 Undo/Redo의 관계
==================================

이것도 중요합니다.

Undo/Redo는 사실상

```
Document Store 이전 상태로 되돌리기
```

입니다.

따라서 History Store는 보통

*   Document snapshot  
    또는
*   Document patch

를 저장합니다.

즉 Undo/Redo도 Document Store 위에 얹히는 구조입니다.

* * *

16\. 최종 권장 결론
=============

정리하면 easymindmap의 Document Store는 아래처럼 가는 것이 가장 좋습니다.

최상위
---

*   map 기본정보
*   nodes
*   edges
*   tags
*   settings
*   metadata

node 핵심 필드
----------

*   id
*   parentId
*   childIds
*   text
*   note
*   layoutType
*   shapeType
*   style
*   tags
*   hyperlinkIds
*   attachmentIds
*   multimediaId
*   collapsed
*   manualPosition
*   depth
*   orderIndex

설계 철학
-----

*   nodes는 Record 구조
*   tags는 정규화
*   edge는 별도 객체
*   subtree layout 지원
*   freeform 수동 좌표 지원
*   다중 가지 생성 대응
*   autosave / undo-redo 확장 가능

* * *

다음 단계는 자연스럽게 **2️⃣ Undo / Redo History Store 설계**로 넘어가면 됩니다.  
이건 지금 만든 Document Store 위에 그대로 얹으면 됩니다.

## Prompt:
#이제 이 대화는 여기서 종료하고 추가 대화는 새 대화에서 질문할께..
#여때까지의 대화 내용을 프로젝트의 다른 질문및 대화에서 참조할수 있도록 기억하고 업데이트해줘

## Response:
저장된 메모리 업데이트됨

좋습니다 👍  
말씀하신 대로 **지금까지의 easymindmap 설계 대화 내용을 프로젝트 메모리에 업데이트해 두었습니다.**

특히 아래 내용이 **프로젝트 기준 설계로 기억되었습니다.**

### 저장된 핵심 내용

**easymindmap Editor 상태관리 구조**

```
State Management (5 Store 구조)

1. Document Store
2. Editor UI Store
3. Viewport Store
4. Interaction Store
5. Autosave Store
```

그리고 다음 원칙도 함께 기억되었습니다.

*   Document Store = 실제 Mindmap 데이터
*   Document Store만 DB 저장 대상
*   나머지 Store는 UI/Editor 상태
*   Autosave는 Document 변경 이벤트 기반으로 동작
*   향후 easymindmap 대화에서 **이 5-Store 구조를 기준 아키텍처로 사용**

또한 이미 저장되어 있는 기존 프로젝트 맥락도 함께 유지됩니다.

예를 들면

*   Command → Reducer → Layout → Render → Save 파이프라인
*   2-Pass Layout Engine
*   Branch Layout 구조
*   Node Indicator 정책
*   Multi Branch 생성 기능
*   Tag / Attachment / Multimedia 구조

즉 앞으로 새 대화에서

> easymindmap 관련 질문

을 하시면 제가 **이 설계 문맥을 그대로 이어서 답변**하게 됩니다.

* * *

💡 새 대화에서 바로 이어서 진행하기 좋은 질문 예

1️⃣ **Document Store 실제 데이터 구조 설계**  
(Node / Edge / Map Schema)

2️⃣ **Undo / Redo History Store 설계**  
(Figma 수준)

3️⃣ **Mindmap Editor 전체 상태 아키텍처 다이어그램**

4️⃣ **React + Zustand 실제 코드 구조**

5️⃣ **Mindmap Layout Engine 코드 설계**

* * *

새 대화에서 질문하시면  
제가 **easymindmap 전체 아키텍처를 완성 수준까지 같이 설계해 드리겠습니다.** 🚀



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
