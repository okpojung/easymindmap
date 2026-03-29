# Edge 스타일 정책

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 1:28:04  
**Updated:** 3/16/2026 1:55:31  
**Exported:** 3/16/2026 2:04:09  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6de0c-a79c-83a7-acc0-1c9733729534](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6de0c-a79c-83a7-acc0-1c9733729534)  

## Prompt:
Edge 구조  즉 부모-자식 연결선은 보통 curve-line, tree-line, straight-line으로 지벙해줄수 있는데..
우리는 방사형은 curve-line을 기본으로 하고 나머지 layout은 tree-line으로 하자..

## Response:
좋습니다.  
지금 말씀하신 **Edge(부모-자식 연결선) 정책**은 **레이아웃 엔진 설계에서 매우 중요한 결정**입니다.  
그래서 이걸 **개발 문서 수준으로 정확히 정의**해 두는 것이 좋습니다.

사용자 의도를 정리하면 다음과 같습니다.

```
Edge Style 정책

1. 방사형 계열 Layout
   → curve-line (곡선)

2. 나머지 Layout
   → tree-line (직선 + 꺾임)
```

이 정책은 이미 정리된 **레이아웃 분류와도 정확히 맞습니다**.  
(방사형 / 트리형 / 계층형 / 진행트리 / 자유배치)

기능정의테이블

* * *

1️⃣ Edge Style 정책 (최종 권장안)
==========================

| Layout Group | Layout Type | Edge Style |
| --- | --- | --- |
| 방사형 | Radial-Bidirectional | curve-line |
| 방사형 | Radial-Right | curve-line |
| 방사형 | Radial-Left | curve-line |
| 트리형 | Tree-Up | tree-line |
| 트리형 | Tree-Down | tree-line |
| 트리형 | Tree-Right | tree-line |
| 트리형 | Tree-Left | tree-line |
| 계층형 | Hierarchy-Right | tree-line |
| 계층형 | Hierarchy-Left | tree-line |
| 진행트리 | ProcessTree-Right | tree-line |
| 진행트리 | ProcessTree-Left | tree-line |
| 진행트리 | ProcessTree-Right-A | tree-line |
| 진행트리 | ProcessTree-Right-B | tree-line |
| 자유배치 | Freeform | straight-line |

### 정리

```
방사형  → curve
트리형  → tree
계층형  → tree
진행트리 → tree
자유배치 → straight
```

* * *

2️⃣ Edge Type 정의 (엔진 내부)
========================

Edge 타입은 3개만 정의하면 충분합니다.

```
enum EdgeType {

  CURVE,      // 방사형
  TREE,       // 트리형 꺾인선
  STRAIGHT    // 직선

}
```

* * *

3️⃣ Layout → Edge 자동 매핑 규칙
==========================

레이아웃 엔진에서 자동으로 결정되도록 합니다.

```
function getEdgeType(layoutType){

  switch(layoutType){

    case "Radial-Bidirectional":
    case "Radial-Right":
    case "Radial-Left":
      return "curve"

    case "Freeform":
      return "straight"

    default:
      return "tree"
  }

}
```

* * *

4️⃣ 각 Edge 타입의 실제 모양
====================

1️⃣ curve-line (방사형)
--------------------

방사형 마인드맵

```
      node
       )
      )
root )
      )
       )
      node
```

SVG

```
Cubic Bezier Curve
```

예

```
M x1 y1
C cx1 cy1, cx2 cy2, x2 y2
```

특징

*   자연스러운 곡선
*   방사형에 적합
*   mymind / xmind 스타일

* * *

2️⃣ tree-line (트리형)
-------------------

트리 / 계층 / 프로세스

```
parent
   |
   └── child
```

또는

```
parent
   |
   ├─ child1
   |
   └─ child2
```

SVG

```
L (line)
또는

└ shape
```

예

```
M x1 y1
L x1 midY
L x2 midY
L x2 y2
```

장점

*   구조가 명확
*   조직도 / 프로세스에 좋음

* * *

3️⃣ straight-line (자유배치)
------------------------

```
node ───── node
```

SVG

```
M x1 y1
L x2 y2
```

* * *

5️⃣ Edge Style 추가 옵션 (추천)
=========================

향후 사용자 설정을 위해 옵션을 남겨두는 것이 좋습니다.

```
EdgeStyle {

  width: number
  color: string
  dash?: boolean
  arrow?: boolean
  curvature?: number

}
```

예

```
width : 2px
color : #666
curvature : 0.4
```

* * *

6️⃣ Layout Engine 구조에 반영
========================

Edge 계산 순서

```
layout engine
     │
     │ node 위치 계산
     ▼
edge style 결정
     │
     │ layoutType
     ▼
edge path 생성
     │
     ▼
SVG 렌더링
```

구조

```
LayoutEngine
 ├─ NodeLayout
 ├─ EdgeRouter
 ├─ EdgeStyleResolver
 └─ SvgRenderer
```

* * *

7️⃣ 실제 코드 구조 예시
===============

```
class EdgeRouter {

  getPath(parent, child, layoutType){

     const edgeType = getEdgeType(layoutType)

     if(edgeType === "curve")
        return curvePath(parent, child)

     if(edgeType === "tree")
        return treePath(parent, child)

     if(edgeType === "straight")
        return straightPath(parent, child)

  }

}
```

* * *

8️⃣ 왜 이 정책이 좋은가 (중요)
====================

이 구조의 장점

### 1️⃣ UX가 자연스럽다

방사형 → 곡선  
트리형 → 꺾임

마인드맵 사용자들이 익숙한 스타일입니다.

* * *

### 2️⃣ 렌더링 성능이 좋다

edge 계산이 단순합니다.

```
curve
tree
straight
```

3개만 계산

* * *

### 3️⃣ 코드가 매우 단순해진다

Edge router 단순화

* * *

### 4️⃣ Layout별 UI 일관성

방사형은 항상 곡선  
트리는 항상 꺾임

사용자가 헷갈리지 않습니다.

* * *

9️⃣ 제가 하나만 추가 제안
================

지금 구조에서 **추가 옵션 하나만 넣으면 좋습니다.**

사용자 설정

```
Edge Style Override
```

예

```
Default
Curve
Tree
Straight
```

즉

```
기본 : layout 기반
사용자 : 강제 override 가능
```

이 기능은 나중에 매우 유용합니다.

* * *

🔟 지금 easymindmap 설계에서 이 결정은 매우 좋습니다
====================================

정리

```
방사형 → curve
트리/계층/프로세스 → tree
자유배치 → straight
```

이건 **XMind / MindManager / MindMeister 스타일과 거의 동일한 UX**입니다.

* * *

원하시면 다음으로 **easymindmap에서 가장 중요한 설계**인

👉 **Mindmap Layout Engine (좌표 계산 알고리즘)**  
을 **실제 구현 가능한 수준으로 설계**해 드리겠습니다.

이 부분이 \*\*마인드맵 프로그램 난이도의 70%\*\*입니다.

## Prompt:
자유배치는 tree-line이 좋지 않을까?

## Response:
네, **자유배치도 tree-line이 더 좋을 가능성이 큽니다.**  
오히려 easymindmap 방향에는 그쪽이 더 일관적입니다.

처음엔 자유배치는 노드 위치가 완전히 임의라서 `straight-line`을 떠올리기 쉬운데, 실제 사용성으로 보면 **부모-자식 관계를 더 또렷하게 보여주는 건 tree-line**입니다.

정리하면 이렇게 보는 게 좋습니다.

추천 최종안
------

```
방사형  → curve-line
그 외 전부 → tree-line
```

즉:

*   방사형: curve-line
*   트리형: tree-line
*   계층형: tree-line
*   진행트리: tree-line
*   자유배치형: tree-line

* * *

왜 자유배치도 tree-line이 더 좋은가
------------------------

### 1\. 관계가 더 잘 보임

자유배치는 노드 위치가 사용자의 드래그에 따라 달라지기 때문에,  
직선(straight-line)으로 연결하면 선이 대각선으로 많이 생기고 꽤 산만해질 수 있습니다.

반면 tree-line은

*   어디가 부모인지
*   어디가 자식인지
*   연결 방향이 어떻게 흐르는지

를 더 명확하게 보여줍니다.

* * *

### 2\. 전체 제품 정책이 단순해짐

룰이 아주 깔끔해집니다.

```
if (layoutGroup === "radial") edgeType = "curve";
else edgeType = "tree";
```

이렇게 되면 개발도 단순하고, 사용자도 예측하기 쉽습니다.

* * *

### 3\. 자유배치여도 “관계형 마인드맵” 성격은 유지됨

easymindmap의 자유배치는 완전한 다이어그램 툴이 아니라  
기본적으로 **mindmap/tree 구조를 가진 상태에서 위치만 자유로운 것**에 가깝습니다.

그렇다면 edge도 완전 자유선보다는  
**관계가 드러나는 tree-line**이 더 잘 맞습니다.

* * *

### 4\. straight-line은 오히려 특수 옵션으로 두는 게 좋음

직선 연결은 기본값보다는 나중에 옵션으로 두는 편이 낫습니다.

예:

*   기본: tree-line
*   옵션: straight-line 강제 변경

이렇게 두면 일부 사용자가 “완전 다이어그램처럼” 쓰고 싶을 때만 쓰게 할 수 있습니다.

* * *

권장 정책 문구
--------

문서에는 이렇게 적으면 됩니다.

| Layout Group | Edge Style |
| --- | --- |
| 방사형 | curve-line |
| 트리형 | tree-line |
| 계층형 | tree-line |
| 진행트리 | tree-line |
| 자유배치형 | tree-line |

* * *

구현 규칙도 단순화 가능
-------------

```
function getEdgeType(layoutType: string): "curve" | "tree" {
  switch (layoutType) {
    case "Radial-Bidirectional":
    case "Radial-Right":
    case "Radial-Left":
      return "curve";
    default:
      return "tree";
  }
}
```

* * *

제 의견
----

저도 지금 말씀하신 쪽으로 수정하는 게 맞다고 봅니다.

**최종 권장안:**

*   **방사형만 curve-line**
*   **나머지는 모두 tree-line**

이게 UX, 가독성, 구현 단순성 셋 다 가장 좋습니다.

원하시면 제가 바로 이어서 **Layout/Edge 정책표를 최종 확정본 형태로 다시 깔끔하게 정리**해드릴게요.

## Prompt:
Layout/Edge 정책표를 최종 확정본 형태로 다시 깔끔하게 정리해줘

## Response:
좋습니다.  
아래처럼 **easymindmap Layout / Edge 정책표 최종 확정본**으로 정리하면 됩니다.  
레이아웃 그룹과 세부 타입은 기존 정의를 기준으로 반영했습니다.

기능정의테이블

* * *

easymindmap Layout / Edge 정책표
=============================

**Document Version:** v1.0  
**Status:** Final  
**Project:** easymindmap

1\. 정책 요약
---------

### 최종 원칙

*   **방사형 계열 Layout** → **curve-line**
*   **그 외 모든 Layout** → **tree-line**

즉, easymindmap의 부모-자식 연결선은 다음 원칙으로 통일합니다.

```
방사형만 curve-line
나머지는 모두 tree-line
```

* * *

2\. Layout Group별 Edge 정책표
--------------------------

| 그룹 | Layout 명칭(한글) | Layout 명칭(영문) | Edge Style | 비고 |
| --- | --- | --- | --- | --- |
| 방사형 | 방사형-양쪽 | Radial-Bidirectional | curve-line | 전통적 마인드맵 기본형 |
| 방사형 | 방사형-오른쪽 | Radial-Right | curve-line | 우측 확장형 |
| 방사형 | 방사형-왼쪽 | Radial-Left | curve-line | 좌측 확장형 |
| 트리형 | 트리형-위쪽 | Tree-Up | tree-line | 상향 트리 |
| 트리형 | 트리형-아래쪽 | Tree-Down | tree-line | 기본 수직 트리 |
| 트리형 | 트리형-오른쪽 | Tree-Right | tree-line | 일반 수평 트리 |
| 트리형 | 트리형-왼쪽 | Tree-Left | tree-line | 역방향 수평 트리 |
| 계층형 | 계층형-오른쪽 | Hierarchy-Right | tree-line | 조직도/단계형 |
| 계층형 | 계층형-왼쪽 | Hierarchy-Left | tree-line | 역방향 계층형 |
| 진행트리 | 진행트리-오른쪽 | ProcessTree-Right | tree-line | 좌→우 절차형 |
| 진행트리 | 진행트리-왼쪽 | ProcessTree-Left | tree-line | 우→좌 절차형 |
| 진행트리 | 진행트리-오른쪽A | ProcessTree-Right-A | tree-line | 메인라인 기반 분기형 |
| 진행트리 | 진행트리-오른쪽B | ProcessTree-Right-B | tree-line | 타임라인/로드맵형 |
| 자유배치형 | 자유배치형 | Freeform | tree-line | 자유 위치 배치, 관계선은 tree-line 유지 |

* * *

3\. Edge Style 정의
-----------------

| Edge Style | 설명 | 적용 대상 |
| --- | --- | --- |
| curve-line | 부모와 자식을 곡선으로 연결하는 방식 | 방사형 |
| tree-line | 부모-자식 관계를 직선 + 꺾임 구조로 연결하는 방식 | 트리형, 계층형, 진행트리, 자유배치형 |

* * *

4\. 정책 적용 규칙
------------

### 4.1 기본 규칙

1.  각 노드는 자신의 `layoutType` 또는 상속된 레이아웃 정책에 따라 Edge Style이 결정된다.
2.  방사형 계열은 항상 `curve-line`을 사용한다.
3.  방사형 이외의 모든 계열은 항상 `tree-line`을 사용한다.
4.  자유배치형은 노드 위치는 자유롭게 이동 가능하지만, 부모-자식 관계선은 `tree-line`으로 유지한다.

### 4.2 설계 의도

*   방사형은 곡선이 시각적으로 자연스럽고 마인드맵다운 느낌이 강함
*   트리형/계층형/진행트리는 구조와 흐름을 명확히 보여주는 것이 중요함
*   자유배치형도 위치는 자유롭지만 데이터 구조는 부모-자식 관계를 유지하므로 `tree-line`이 더 적합함
*   전체 정책을 단순화하여 사용성과 개발 일관성을 높임

* * *

5\. 구현 기준
---------

### 5.1 내부 enum 예시

```
export type EdgeType = "curve-line" | "tree-line";
```

### 5.2 Layout → Edge 매핑 규칙

```
function resolveEdgeType(layoutType: string): EdgeType {
  switch (layoutType) {
    case "Radial-Bidirectional":
    case "Radial-Right":
    case "Radial-Left":
      return "curve-line";

    default:
      return "tree-line";
  }
}
```

* * *

6\. 최종 정책 문구
------------

아래 문구를 기능명세/아키텍처 설계서에 공통으로 넣으면 됩니다.

> easymindmap의 부모-자식 연결선(Edge)은 레이아웃 유형에 따라 자동 결정한다.  
> 방사형 계열 Layout은 `curve-line`을 사용하며,  
> 트리형 / 계층형 / 진행트리 / 자유배치형 Layout은 모두 `tree-line`을 사용한다.

* * *

7\. 한 줄 최종 결론
-------------

```
방사형 = curve-line
그 외 전부 = tree-line
```

원하시면 다음 단계로 이어서 **Layout/Edge/Node 상속 규칙까지 포함한 “레이아웃 엔진 정책서”** 형태로 확장해서 정리해드리겠습니다.

## Prompt:
Layout/Edge/Node 상속 규칙까지 포함한 “레이아웃 엔진 정책서” 형태로 확장해서 정리해줘

## Response:
좋습니다.  
지금까지 정리된 내용(레이아웃 종류, Edge 정책, Node 상속 규칙)을 모두 포함해서 **easymindmap Layout Engine 정책서 (Layout / Edge / Node Inheritance)** 형태로 정리해 드리겠습니다.  
이 문서는 **개발 기준 문서 + AI 코드 생성 기준 문서**로 바로 사용할 수 있는 수준으로 작성합니다.

* * *

easymindmap Layout Engine 정책서
=============================

**Document Version:** v1.0  
**Project:** easymindmap  
**Scope:** Mindmap Layout / Edge Routing / Node Inheritance  
**Status:** Final Design

* * *

1\. Layout Engine 목적
====================

Layout Engine은 다음을 담당한다.

1.  Node의 **좌표 계산**
2.  부모-자식 **Edge 연결선 생성**
3.  Node의 **Layout 상속 규칙 관리**
4.  Node 이동 시 **자동 재배치**
5.  Subtree 단위 **Layout 변경 지원**

즉,

```
Mindmap Data
      ↓
Layout Engine
      ↓
Node Position + Edge Path
      ↓
SVG Renderer
```

* * *

2\. Layout 그룹 정의
================

easymindmap은 다음 **5개 Layout 그룹**을 사용한다.

| Layout Group | 설명 |
| --- | --- |
| 방사형 | 중심에서 퍼지는 마인드맵 |
| 트리형 | 일반적인 Tree 구조 |
| 계층형 | 레벨 정렬 강조 |
| 진행트리 | 절차 / 프로세스 흐름 |
| 자유배치형 | 사용자가 위치 결정 |

레이아웃 종류는 아래와 같다.

기능정의테이블

| Layout Group | Layout Type |
| --- | --- |
| 방사형 | Radial-Bidirectional |
| 방사형 | Radial-Right |
| 방사형 | Radial-Left |
| 트리형 | Tree-Up |
| 트리형 | Tree-Down |
| 트리형 | Tree-Right |
| 트리형 | Tree-Left |
| 계층형 | Hierarchy-Right |
| 계층형 | Hierarchy-Left |
| 진행트리 | ProcessTree-Right |
| 진행트리 | ProcessTree-Left |
| 진행트리 | ProcessTree-Right-A |
| 진행트리 | ProcessTree-Right-B |
| 자유배치형 | Freeform |

* * *

3\. Edge 정책
===========

Edge는 **2가지 타입만 사용한다.**

| Edge Type | 설명 |
| --- | --- |
| curve-line | 곡선 연결 |
| tree-line | 직선 + 꺾임 연결 |

* * *

Edge 정책 규칙
----------

| Layout Group | Edge Style |
| --- | --- |
| 방사형 | curve-line |
| 트리형 | tree-line |
| 계층형 | tree-line |
| 진행트리 | tree-line |
| 자유배치형 | tree-line |

즉

```
방사형 → curve
나머지 → tree
```

* * *

4\. Node Layout 상속 규칙
=====================

Node는 기본적으로 **부모 Layout을 상속한다.**

기본 규칙
-----

```
child.layoutType = parent.layoutType
```

예

```
Root (Radial)
 ├ Node A
 └ Node B
```

Node A / B는 모두 Radial Layout

* * *

Subtree Layout Override
-----------------------

Node는 자신의 Layout을 변경할 수 있다.

예

```
Root (Radial)

 ├ Node A (Radial)
 │   ├ A1
 │   └ A2

 └ Node B (Tree)
     ├ B1
     └ B2
```

Node B subtree만 Tree Layout

* * *

Layout 결정 순서
------------

Layout 계산 순서

```
node.layoutType 존재
      ↓
사용
      ↓
없으면
      ↓
parent.layoutType 상속
      ↓
없으면
      ↓
map.defaultLayout 사용
```

* * *

5\. Node Style 상속 규칙
====================

Node 생성 시 다음 속성을 **부모에서 상속**한다.

| 속성 | 상속 여부 |
| --- | --- |
| Layout | O |
| Shape | O |
| Node 색상 | O |
| Border 스타일 | O |
| Font Family | O |
| Font Size | Level 기준 |
| Edge Style | Layout 기반 |

* * *

Node Style 상속 구조
----------------

```
Map Default Style
      ↓
Root Node
      ↓
Parent Node
      ↓
Child Node
```

* * *

6\. Font Size 규칙
================

폰트는 **Level 기반 자동 설정**

| Level | Font Size |
| --- | --- |
| Root | 18pt |
| Level 1 | 16pt |
| Level 2 | 15pt |
| Level 3 | 14pt |
| Level 4 | 13pt |
| Level 5+ | 12pt |

사용자는 Map 설정에서 변경 가능

* * *

7\. Node 좌표 계산 정책
=================

Layout Engine은 다음 순서로 좌표를 계산한다.

```
Root Node 위치 계산
      ↓
Level 계산
      ↓
Sibling 정렬
      ↓
Subtree 폭 계산
      ↓
Node Position 확정
```

* * *

기본 Node 좌표 데이터
--------------

```
node.x
node.y
node.width
node.height
```

* * *

8\. Layout별 Node 배치 정책
======================

8.1 Radial Layout
-----------------

```
        Node
      /     \
   Node     Node
```

특징

*   Root 중심
*   angle 기반 배치
*   subtree 각도 분배

좌표 계산

```
x = centerX + radius * cos(angle)
y = centerY + radius * sin(angle)
```

* * *

8.2 Tree Layout
---------------

```
Root
  |
  ├ Node
  |
  └ Node
```

특징

*   Level 기반
*   subtree width 계산

좌표

```
x = level * levelSpacing
y = subtreeCenter
```

* * *

8.3 Hierarchy Layout
--------------------

```
CEO
 |
 ├ Manager
 |   └ Staff
 |
 └ Manager
```

특징

*   레벨 정렬 강조
*   조직도 스타일

* * *

8.4 Process Tree
----------------

```
Step1 → Step2 → Step3
```

특징

*   흐름 강조
*   일정 간격 유지

* * *

8.5 Freeform
------------

특징

*   Node 위치는 사용자 Drag 우선
*   Layout Engine은 충돌 방지만 수행

* * *

9\. Edge Routing 정책
===================

Edge는 **EdgeRouter**가 계산한다.

구조

```
EdgeRouter
 ├ CurveEdgeRouter
 └ TreeEdgeRouter
```

* * *

Curve Edge
----------

방사형

```
M x1 y1
C cx1 cy1 cx2 cy2 x2 y2
```

* * *

Tree Edge
---------

```
parent
   |
   └── child
```

SVG

```
M x1 y1
L x1 midY
L x2 midY
L x2 y2
```

* * *

10\. Layout Engine 구조
=====================

```
LayoutEngine
 ├ LayoutResolver
 ├ NodeLayout
 ├ EdgeRouter
 ├ SubtreeCalculator
 └ CollisionResolver
```

* * *

11\. Layout 계산 흐름
=================

```
Map Load
   ↓
Node Tree Build
   ↓
Layout Resolve
   ↓
Subtree Size Calculate
   ↓
Node Position Compute
   ↓
Edge Path Compute
   ↓
SVG Render
```

* * *

12\. Node 생성 시 동작
=================

Node 생성 시

```
1 Node 생성
2 부모 Layout 상속
3 부모 Style 상속
4 Level 계산
5 좌표 계산
6 Edge 생성
```

* * *

13\. 다중 가지 생성 정책
================

사용자는 한 번에 여러 Node 생성 가능

동작 방식은 아래와 같다.

◆ ‘다중 가지’ 추가

```
Ctrl + Space
```

입력 예

```
A
 B
 C
  D
```

결과

```
Parent
 └ A
     ├ B
     └ C
         └ D
```

* * *

14\. Layout 변경 정책
=================

사용자는 다음 두 가지 변경 가능

### Map Layout 변경

```
Map 전체 Layout 변경
```

### Subtree Layout 변경

```
특정 Node 이하 Layout 변경
```

* * *

15\. Layout Reset 정책
====================

Reset 수행 시

```
Node Position 초기화
Layout 재계산
Edge 재생성
```

* * *

16\. Layout Engine 성능 기준
========================

목표 성능

| Node 수 | 반응 속도 |
| --- | --- |
| 100 | 즉시 |
| 500 | < 50ms |
| 1000 | < 100ms |
| 3000 | < 300ms |

* * *

17\. 미래 확장 고려
=============

향후 추가 가능

*   Fishbone Layout
*   Timeline Layout
*   OrgChart Layout
*   Mindmap AI Auto Layout

* * *

18\. 최종 정책 요약
=============

### Layout 정책

```
Radial
Tree
Hierarchy
Process
Freeform
```

* * *

### Edge 정책

```
Radial → curve-line
others → tree-line
```

* * *

### Node 상속 정책

```
child inherits parent layout
child inherits parent style
font = level based
```

* * *

⭐ 중요
====

이 문서는 **easymindmap에서 가장 중요한 설계 문서 중 하나입니다.**

왜냐하면

```
Mindmap Editor 난이도 70% =
Layout Engine
```

입니다.

* * *

원하시면 다음 단계로 **실제 개발에서 가장 중요한 설계**인

👉 **Node 좌표 계산 알고리즘 (세계 수준 설계)**  
👉 **Undo / Redo 구조 (Figma급 설계)**  
👉 **Mindmap Editor 상태 아키텍처**

를 이어서 정리해 드리겠습니다.

## Prompt:
#이제 이 대화는 여기서 종료하고 추가 대화는 새 대화에서 질문할께..
#여때까지의 대화 내용을 프로젝트의 다른 질문및 대화에서 참조할수 있도록 기억하고 업데이트해줘

## Response:
저장된 메모리 업데이트됨

알겠습니다 👍  
지금까지의 **핵심 설계 내용은 프로젝트 메모리에 업데이트해 두었습니다.**

특히 다음 내용이 **easymindmap 프로젝트 기준 설계로 저장되었습니다.**

### 저장된 주요 내용

1️⃣ **Layout / Edge 정책**

*   **Radial (방사형)** → `curve-line`
*   **Tree / Hierarchy / ProcessTree / Freeform** → `tree-line`

즉

```
Radial → curve-line
Others → tree-line
```

* * *

2️⃣ **Node 상속 규칙**

*   Node는 기본적으로 **부모 layout 상속**
*   Node는 **부모 스타일 상속**
*   **Subtree Layout override 가능**

```
child.layoutType = parent.layoutType
```

* * *

3️⃣ **Layout Engine 기본 정책**

Layout Engine 역할

```
Node Tree
   ↓
Layout Resolve
   ↓
Node Position 계산
   ↓
Edge Path 생성
   ↓
Render
```

* * *

4️⃣ **Font Level 정책**

```
Root        18pt
Level1      16pt
Level2      15pt
Level3      14pt
Level4      13pt
Level5+     12pt
```

* * *

5️⃣ **다중 가지 생성 규칙**

```
Ctrl + Space
```

입력 텍스트의 **space 들여쓰기 기반으로 계층 생성**  
(이미지 문서 기준 설계)

◆ ‘다중 가지’ 추가

* * *

앞으로 **새 대화에서 easymindmap 관련 질문을 하시면**

제가 자동으로 다음을 **기존 합의 설계로 간주하고 이어서 답변합니다.**

*   Layout Engine 정책
*   Layout / Edge 정책
*   Node 상속 규칙
*   다중 가지 생성
*   Tag 시스템
*   Store 아키텍처
*   2-pass Layout 알고리즘

즉 **새 대화에서도 설계 문맥이 끊기지 않습니다.**

* * *

👍 다음 대화에서 이어서 추천드리는 주제 (중요도 순)

1️⃣ **Node 좌표 계산 알고리즘 (실제 구현 수준)**  
2️⃣ **Edge routing 알고리즘**  
3️⃣ **Mindmap Editor 내부 아키텍처 (Figma급)**  
4️⃣ **Undo / Redo History 구조**  
5️⃣ **대형 Mindmap 성능 설계 (1000~10000 node)**

* * *

새 대화에서 \*\*“easymindmap 계속”\*\*이라고만 시작하셔도  
지금까지 설계를 기준으로 이어서 진행하겠습니다.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
