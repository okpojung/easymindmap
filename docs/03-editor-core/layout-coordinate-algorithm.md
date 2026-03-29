# Node 좌표 계산 알고리즘

**User:** Anonymous (ok@baro.pro)  
**Created:** 3/16/2026 1:39:59  
**Updated:** 3/16/2026 2:02:59  
**Exported:** 3/16/2026 2:03:05  
**Link:** [https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6e0ba-2388-83a6-8629-c0799ac2dc6b](https://chatgpt.com/g/g-p-69b64962a1b8819187e5863aa1808e92-mindmap-gaebal/c/69b6e0ba-2388-83a6-8629-c0799ac2dc6b)  

## Prompt:
3️⃣ Node 좌표 계산 알고리즘를 IT초보자 기준으로 자세히 설명해주고 설계는 최고의 전문가답게 설계해줘

## Response:
11s 동안 생각함

좋습니다.  
이제 **3️⃣ Node 좌표 계산 알고리즘**을

*   **IT 초보자도 이해할 수 있게**
*   하지만 **실제 개발 가능한 전문가 수준 설계**로

정리해드리겠습니다.

이번 내용은 easymindmap의 핵심 엔진 설계이고, 특히 이미 확정해둔 **다양한 Layout 종류**, **Subtree 단위 Layout 적용**, **Auto Layout**, **다중 가지 생성** 요구를 모두 수용하는 방향으로 설명하겠습니다.

기능정의테이블

◆ ‘다중 가지’ 추가

맵진행방향

* * *

1\. Node 좌표 계산이란 무엇인가?
======================

아주 쉽게 말하면:

> **각 노드를 화면의 어디(x, y)에 놓을지 계산하는 규칙**입니다.

예를 들어 마인드맵에서

*   중심 노드는 가운데
*   첫 번째 자식은 오른쪽 위
*   두 번째 자식은 오른쪽 아래
*   트리형이면 자식들이 아래로 차례대로
*   방사형이면 둥글게 퍼짐

이런 식으로 **노드 위치를 자동으로 정하는 것**이 좌표 계산 알고리즘입니다.

즉,

*   **노드 내용(text)**
*   **부모-자식 관계**
*   **레이아웃 종류**
*   **노드 크기**
*   **형제 순서**
*   **접힘/펼침 상태**

를 보고 최종적으로

```
node.x = ?
node.y = ?
```

를 계산하는 것입니다.

* * *

2\. 왜 이게 중요한가?
==============

마인드맵은 그냥 글 목록이 아닙니다.

노드 좌표 계산이 잘못되면:

*   노드가 서로 겹침
*   선이 이상하게 꼬임
*   드래그 후 다시 자동정렬하면 화면이 튐
*   자식이 많을 때 보기 어려움
*   layout 바꿀 때 전체가 무너짐

반대로 좌표 계산이 좋으면:

*   보기 편함
*   가지 구조가 자연스러움
*   큰 맵도 정돈되어 보임
*   subtree 단위 layout 변경이 쉬움
*   export HTML 품질도 좋아짐

즉, **좌표 계산 엔진이 곧 마인드맵 품질**입니다.

* * *

3\. 초보자용 핵심 개념 5개
=================

3.1 좌표는 x, y 두 개다
-----------------

웹 화면에서 위치는 보통 이렇게 생각하면 됩니다.

*   `x` = 왼쪽/오른쪽 위치
*   `y` = 위/아래 위치

예:

```
{ x: 300, y: 200 }
```

뜻:

*   왼쪽에서 300px
*   위에서 200px

* * *

3.2 모든 노드는 “기준점”이 필요하다
----------------------

노드는 혼자 떠 있는 것이 아니라 보통

*   부모 기준으로 놓이거나
*   루트 기준으로 퍼집니다.

즉,

> “이 노드는 부모에서 얼마나 떨어질까?”

를 계산해야 합니다.

예:

*   부모 오른쪽으로 180px
*   부모 아래로 60px

* * *

3.3 노드 크기도 중요하다
---------------

노드는 다 똑같은 상자가 아닙니다.

예를 들어

*   “AI”는 짧아서 작고
*   “Kubernetes Architecture Overview”는 길어서 큽니다.

그래서 좌표 계산 전에 보통 각 노드의 크기를 알아야 합니다.

```
node.width
node.height
```

이걸 알아야 겹치지 않게 배치할 수 있습니다.

* * *

3.4 자식이 많으면 “묶음 높이”가 필요하다
-------------------------

부모 아래에 자식이 5개 있으면  
그 5개를 세로로 정렬할 때 전체 높이를 먼저 계산해야 합니다.

예:

*   자식1 높이 30
*   자식2 높이 40
*   자식3 높이 30
*   간격 20씩

그러면 자식 전체 묶음 높이가 계산됩니다.

이 전체 높이를 기준으로 부모 주변에 균형 있게 놓습니다.

* * *

3.5 좌표 계산은 보통 2번 한다
-------------------

전문가 설계에서는 대개 2단계로 합니다.

### 1단계: 크기 계산

*   각 subtree가 얼마나 큰지 계산

### 2단계: 실제 좌표 배치

*   그 크기를 바탕으로 x, y 배치

이 방식이 가장 안정적입니다.

* * *

4\. easymindmap에 맞는 최종 설계 원칙
============================

easymindmap은 일반 트리만 있는 제품이 아닙니다.

이미 정리된 요구사항상 다음이 들어갑니다.

*   방사형
*   트리형
*   계층형
*   진행트리
*   자유배치형
*   subtree layout 변경
*   auto layout
*   다중 가지 생성
*   접기/펼치기
*   drag 이동
*   layout reset
    기능정의테이블

따라서 좌표 엔진은 반드시 아래 원칙으로 가야 합니다.

최종 원칙
-----

### 원칙 1. “하나의 알고리즘”이 아니라 “공통 엔진 + layout별 전략”

즉:

*   공통 파이프라인은 하나
*   실제 배치 규칙은 layout 전략별로 분리

### 원칙 2. Node 단위가 아니라 “Subtree 단위”

부모 노드 하나가 `tree-right`면  
그 자식 전체 subtree는 그 규칙으로 배치

### 원칙 3. 실제 저장 좌표와 계산 좌표를 분리

*   `computedX`, `computedY` = 엔진이 계산한 값
*   `manualX`, `manualY` = 자유배치나 드래그 조정값

### 원칙 4. 화면 렌더링 좌표와 논리 좌표 분리

*   논리 좌표: layout 엔진 내부 값
*   화면 좌표: zoom/pan 적용 후 값

### 원칙 5. layout 변경 시 subtree만 재계산 가능해야 함

전체 맵을 매번 다시 계산하면 비효율적

* * *

5\. 전체 계산 흐름
============

전문가 설계로 보면 좌표 계산 흐름은 이렇게 갑니다.

Step 1. 입력 데이터 준비
-----------------

필요 데이터:

*   node tree
*   parentId
*   orderIndex
*   collapsed
*   layoutType
*   node size(width, height)
*   style padding/margin
*   edge anchor rule

Step 2. 표시 대상 트리 생성
-------------------

*   접힌 노드의 자식은 숨김 처리
*   현재 보이는 노드만 계산 대상으로 만듦

Step 3. subtree bounding box 계산
-------------------------------

각 노드에 대해

*   자기 자신 크기
*   자식 전체 크기
*   subtree 전체 폭/높이 계산

Step 4. layout strategy 선택
--------------------------

예:

*   `radial-bi`
*   `tree-right`
*   `tree-down`
*   `hierarchy-right`
*   `process-right`
*   `freeform`

Step 5. 좌표 계산
-------------

부모에서 자식으로 재귀적으로 x, y 할당

Step 6. 충돌 보정
-------------

*   너무 가까운 형제 간격 보정
*   레이블 긴 노드가 겹치면 추가 밀기

Step 7. edge anchor 계산
----------------------

*   연결선 시작점/끝점 계산

Step 8. viewport용 bounds 계산
---------------------------

*   전체 맵의 minX, minY, maxX, maxY 계산
*   fit screen에 사용

* * *

6\. 가장 중요한 구조: 2패스 알고리즘
=======================

이 부분이 진짜 핵심입니다.

Pass 1: Measure Pass
--------------------

각 subtree가 차지하는 공간을 먼저 계산

예:

```
type LayoutBox = {
  selfWidth: number
  selfHeight: number
  subtreeWidth: number
  subtreeHeight: number
}
```

이 단계에서는 아직 정확한 x, y는 안 정합니다.

그 대신

*   이 노드 한 개 크기
*   자식까지 포함한 전체 크기

를 계산합니다.

* * *

Pass 2: Arrange Pass
--------------------

이제 실제 좌표를 배치합니다.

예:

*   루트는 `(0, 0)`
*   자식 subtree 전체 높이를 보고
*   위에서 아래로 균형 있게 분산
*   각 자식 중심점에 좌표 할당

이 방식이 좋은 이유:

*   겹침이 적음
*   긴 텍스트도 대응 가능
*   subtree 단위 재계산 쉬움
*   layout별 전략 적용 쉬움

* * *

7\. 트리형(Tree) 좌표 계산 알고리즘
========================

먼저 가장 기본이 되는 트리형부터 설명하겠습니다.

* * *

7.1 tree-right 개념
-----------------

부모는 왼쪽, 자식은 오른쪽에 세로로 나열

예:

```
Parent
   ├ Child A
   ├ Child B
   └ Child C
```

화면상으로는:

*   부모 x = 100
*   자식 x = 100 + horizontalGap
*   자식 y는 위에서 아래로 배치

* * *

7.2 초보자식 이해
-----------

부모 옆에 자식을 “줄 세우는 것”입니다.

단, 무작정 줄 세우면 안 되고  
부모 기준으로 위아래 균형을 맞춰야 보기 좋습니다.

예를 들어 자식 3개면:

*   첫째는 위
*   둘째는 가운데
*   셋째는 아래

즉 부모 중심선 근처에 자식 묶음 전체가 오도록 합니다.

* * *

7.3 tree-right 계산식
------------------

부모 좌표가:

```
parent.x
parent.y
```

부모 오른쪽에 자식을 배치할 때:

```
child.x = parent.x + parent.width/2 + horizontalGap + child.width/2
```

세로 위치는 자식 묶음 전체 높이를 먼저 구한 뒤:

```
startY = parent.y - totalChildrenHeight / 2
```

그 다음 각 자식을 순서대로 배치:

```
child.y = currentY + child.subtreeHeight / 2
currentY += child.subtreeHeight + verticalGap
```

* * *

7.4 tree-right 의사코드
-------------------

```
function layoutTreeRight(node, x, y) {
  node.x = x
  node.y = y

  const children = visibleChildren(node)
  if (children.length === 0) return

  const totalHeight = sum(children.map(c => c.box.subtreeHeight)) 
                    + (children.length - 1) * verticalGap

  let cursorY = y - totalHeight / 2

  for (const child of children) {
    const childX = x + node.box.selfWidth / 2 + horizontalGap + child.box.selfWidth / 2
    const childY = cursorY + child.box.subtreeHeight / 2

    layoutTreeRight(child, childX, childY)

    cursorY += child.box.subtreeHeight + verticalGap
  }
}
```

* * *

7.5 tree-left / tree-down / tree-up
-----------------------------------

이건 사실 같은 알고리즘을 방향만 바꾸면 됩니다.

### tree-left

*   x 방향만 반대로

### tree-down

*   y 방향으로 내려감
*   자식은 가로로 분산

### tree-up

*   y 방향만 반대로

즉, 공통 엔진 + 방향 벡터만 바꾸면 됩니다.

* * *

8\. 방사형(Radial) 좌표 계산 알고리즘
==========================

이제 마인드맵다운 핵심인 방사형입니다.

기능 정의상 방사형은

*   양쪽 방사형
*   오른쪽 방사형
*   왼쪽 방사형

형태가 있습니다.

기능정의테이블

맵진행방향

* * *

8.1 방사형이란?
----------

루트나 부모를 중심으로  
자식이 **부채꼴 또는 원형 방향**으로 퍼지는 방식입니다.

즉 트리형처럼 반듯한 표가 아니라  
“각도(angle)”를 이용합니다.

* * *

8.2 초보자식 이해
-----------

트리형은

> “오른쪽으로 몇 칸, 아래로 몇 칸”

방사형은

> “몇 도 방향으로, 얼마나 멀리”

입니다.

예:

*   30도 방향
*   80도 방향
*   \-20도 방향

이런 식으로 각도를 나누어 자식을 뿌립니다.

* * *

8.3 핵심 개념: angle range
----------------------

부모가 자식들에게 줄 수 있는 각도 범위를 정합니다.

예:

*   오른쪽 방사형: `-60° ~ +60°`
*   왼쪽 방사형: `120° ~ 240°`
*   양쪽 방사형: 좌측/우측으로 자식 그룹 분할

그리고 그 범위 안에서 자식 수만큼 나눠 배치합니다.

* * *

8.4 좌표 계산식
----------

각도 `θ`, 반지름 거리 `r` 가 있으면

```
x = parent.x + cos(θ) * r
y = parent.y + sin(θ) * r
```

입니다.

이게 방사형의 핵심 공식입니다.

* * *

8.5 radial-right
----------------

자식이 모두 오른쪽 부채꼴에 위치

예:

*   자식 1: -40°
*   자식 2: 0°
*   자식 3: +40°

* * *

8.6 radial-bi
-------------

루트의 자식을

*   왼쪽 그룹
*   오른쪽 그룹

으로 나누고

각 그룹 안에서 다시 각도를 분배합니다.

보통 형제 순서 기준으로 절반씩 나누면 됩니다.

예:

*   1, 3, 5번 자식 → 오른쪽
*   2, 4, 6번 자식 → 왼쪽

또는

*   앞 절반 → 오른쪽
*   뒤 절반 → 왼쪽

이 정책은 별도 설정 가능하게 만드는 게 좋습니다.

* * *

8.7 방사형 의사코드
------------

```
function layoutRadial(node, centerX, centerY, startAngle, endAngle, radius) {
  node.x = centerX
  node.y = centerY

  const children = visibleChildren(node)
  if (children.length === 0) return

  const step = (endAngle - startAngle) / Math.max(children.length - 1, 1)

  children.forEach((child, i) => {
    const angle = children.length === 1
      ? (startAngle + endAngle) / 2
      : startAngle + step * i

    const childRadius = radius + radialLevelGap

    const childX = centerX + Math.cos(angle) * childRadius
    const childY = centerY + Math.sin(angle) * childRadius

    layoutRadial(child, childX, childY, angle - childSpread/2, angle + childSpread/2, childRadius)
  })
}
```

* * *

8.8 실무 보정 포인트
-------------

방사형은 공식만으로 끝나면 안 됩니다.

꼭 필요한 보정:

*   텍스트 긴 노드는 더 바깥으로 밀기
*   같은 각도대에서 subtree 큰 노드는 더 넓은 각도 부여
*   좌우 라벨 정렬 방식 다르게
*   선 꺾임 최소화

즉, 단순 equal angle보다  
**subtree weight 기반 angle allocation**이 훨씬 좋습니다.

* * *

9\. 계층형(Hierarchy) 알고리즘
=======================

기능정의상 계층형은 레벨 정렬이 강조되는 구조입니다.

기능정의테이블

이건 트리형과 비슷하지만 차이가 있습니다.

차이점
---

트리형:

*   부모 중심 기준으로 자식 묶음을 균형 있게 배치

계층형:

*   같은 레벨 노드들을 한 기준선에 정렬
*   조직도/단계형 문서 느낌

즉 계층형은 **레벨(level)** 이 중요합니다.

* * *

계산 방식
-----

### 1단계

BFS 또는 DFS로 각 노드의 level 계산

```
root.level = 0
child.level = parent.level + 1
```

### 2단계

레벨별로 노드 묶기

```
levelMap[0] = [root]
levelMap[1] = [A, B, C]
levelMap[2] = [A1, A2, B1]
```

### 3단계

레벨 기준으로 x 또는 y 고정

예: hierarchy-right

```
x = level * levelGap
y = sameLevelNodes를 위아래로 분산
```

이 방식은 조직도, 절차 문서, 구조 분류형 맵에 좋습니다.

* * *

10\. 진행트리(Process Tree) 알고리즘
============================

기능정의상 진행트리는

*   진행트리-오른쪽
*   왼쪽
*   오른쪽A
*   오른쪽B

등이 있습니다.

기능정의테이블

이 레이아웃은 일반 tree보다 **흐름(flow)** 이 더 중요합니다.

* * *

10.1 핵심 개념
----------

진행트리는 “생각의 분기”보다  
“절차/순서/단계”를 보여주는 구조입니다.

예:

*   Step 1
*   Step 2
*   Step 3

그래서 형제 순서가 매우 중요하고  
각 노드가 “이전 단계 → 다음 단계”처럼 보여야 합니다.

* * *

10.2 추천 계산 방식
-------------

### process-right

*   주 흐름 축을 x축으로 둠
*   형제는 순서대로 오른쪽으로 나열
*   필요 시 보조 자식은 위/아래에 배치

### process-right-a

*   메인 라인 아래로 상세 단계가 달리는 구조

### process-right-b

*   타임라인처럼 같은 수평선 위에 배치

즉, process 계열은 일반 tree 엔진을 그대로 쓰는 게 아니라  
**main path + secondary branches** 구조로 가는 것이 좋습니다.

* * *

11\. 자유배치형(Freeform) 알고리즘
=========================

자유배치형은 자동배치보다 사용자가 놓은 위치가 우선입니다.

기능정의테이블

따라서 이 경우 좌표 엔진 역할이 달라집니다.

원칙
--

*   자동 계산 좌표보다 `manualX`, `manualY` 우선
*   단, 새 자식 추가 시 기본 추천 위치는 자동 계산
*   layout reset 시만 auto 좌표로 복귀

즉 자유배치형은

> “완전 자동 layout”이 아니라  
> “자동 추천 + 수동 우선”

으로 설계해야 합니다.

* * *

12\. 다중 가지 추가와 좌표 계산의 관계
========================

다중 가지 추가는 한 번에 여러 줄을 넣고, 앞 공백으로 계층을 표현해 여러 노드를 한꺼번에 생성하는 기능입니다.

◆ ‘다중 가지’ 추가

이 기능이 좌표 계산에서 중요한 이유는:

*   노드가 한 번에 여러 개 생김
*   subtree가 갑자기 커짐
*   parent 주변 공간이 즉시 재배치되어야 함

설계 원칙
-----

다중 가지 입력 후에는

1.  텍스트를 파싱해 임시 subtree 생성
2.  parent 밑에 삽입
3.  삽입된 subtree의 bounding box 측정
4.  **parent subtree만 부분 재계산**
5.  전체 맵 bounds 갱신

즉, 전체 맵 풀 리레이아웃보다  
**부분 리레이아웃(partial relayout)** 이 중요합니다.

* * *

13\. 실제 구현용 데이터 구조
==================

아래 구조로 가는 것을 추천합니다.

```
type NodeLayoutType =
  | 'radial-bi'
  | 'radial-right'
  | 'radial-left'
  | 'tree-right'
  | 'tree-left'
  | 'tree-up'
  | 'tree-down'
  | 'hierarchy-right'
  | 'hierarchy-left'
  | 'process-right'
  | 'process-left'
  | 'process-right-a'
  | 'process-right-b'
  | 'freeform'
```

```
type MindNode = {
  id: string
  parentId: string | null
  children: string[]
  text: string
  orderIndex: number
  collapsed: boolean

  layoutType?: NodeLayoutType

  width: number
  height: number

  computedX: number
  computedY: number

  manualX?: number
  manualY?: number

  subtreeWidth: number
  subtreeHeight: number

  level: number
}
```

* * *

14\. 엔진 구조 설계
=============

전문가답게 설계하면 이렇게 나누는 것이 좋습니다.

14.1 LayoutEngine
-----------------

전체 진입점

```
layoutDocument(document, options)
```

역할:

*   루트부터 전체/부분 리레이아웃 호출

* * *

14.2 MeasureEngine
------------------

subtree 크기 계산

```
measureSubtree(nodeId)
```

역할:

*   노드 자신 크기
*   자식 포함 전체 크기 계산

* * *

14.3 Strategy Resolver
----------------------

노드의 layoutType에 따라 전략 선택

```
resolveStrategy(node.layoutType)
```

* * *

14.4 Layout Strategies
----------------------

각 레이아웃 전용 구현

*   `RadialLayoutStrategy`
*   `TreeLayoutStrategy`
*   `HierarchyLayoutStrategy`
*   `ProcessLayoutStrategy`
*   `FreeformLayoutStrategy`

* * *

14.5 CollisionResolver
----------------------

겹침 보정

*   노드 간 최소 간격 확보
*   subtree bounding box 충돌 완화

* * *

14.6 EdgeRouter
---------------

연결선 anchor와 경로 계산

*   curve-line
*   tree-line
*   straight-line 정책과 연결 가능

* * *

15\. 좌표 계산 시 반드시 필요한 옵션
=======================

```
type LayoutOptions = {
  horizontalGap: number
  verticalGap: number
  radialGap: number
  levelGap: number
  siblingGap: number
  subtreePadding: number
  minNodeGap: number
  processStepGap: number
}
```

그리고 맵 전체 기본값 + layout별 override 가능하게 해야 합니다.

예:

*   radial은 `radialGap` 크게
*   tree는 `horizontalGap`, `verticalGap` 중심
*   process는 `processStepGap` 중심

* * *

16\. 성능 설계
==========

큰 맵에서는 성능이 매우 중요합니다.

추천 원칙
-----

### 1\. 전체 리레이아웃 최소화

*   노드 텍스트 수정 → 해당 노드 조상 방향만 재측정
*   자식 추가 → 해당 subtree만 재계산

### 2\. measure 캐시

*   text, style, children 변화 없으면 크기 재사용

### 3\. viewport 바깥은 렌더 최적화

*   좌표는 계산하되 렌더는 가상화 가능

### 4\. animation은 선택적

*   layout 변경 시 부드럽게 이동 가능
*   대형 문서에서는 끌 수 있게

* * *

17\. 가장 추천하는 최종 알고리즘
====================

easymindmap에 가장 적합한 최종안은 이것입니다.

추천 최종안
------

### A. 공통 기반

*   **2-pass layout**
    *   Measure Pass
    *   Arrange Pass

### B. 전략 패턴

*   layoutType별 strategy 분리

### C. subtree 단위 계산

*   노드별 layoutType 적용 가능

### D. bounding box 기반

*   subtree 크기 먼저 계산 후 배치

### E. partial relayout 지원

*   다중 가지 추가, 드래그, 접기/펼치기에 효율적

### F. manual/freeform 공존

*   자유배치형도 같은 엔진 틀 안에서 수용

* * *

18\. IT초보자용 한 줄 비유
==================

아주 쉽게 비유하면 이렇습니다.

트리형
---

가족사진 찍을 때  
부모 옆에 아이들을 키 순서대로 세우는 것

방사형
---

불꽃놀이처럼  
가운데서 바깥으로 퍼뜨리는 것

계층형
---

회사 조직도처럼  
같은 직급을 한 줄에 맞추는 것

진행트리
----

일정표처럼  
순서대로 옆으로 이어 붙이는 것

즉 좌표 계산 알고리즘은  
\*\*“노드를 예쁘고 안 겹치게 줄 세우는 규칙”\*\*입니다.

* * *

19\. easymindmap용 최종 설계안 요약
===========================

제가 최종적으로 추천하는 설계는 아래입니다.

좌표 계산 엔진 최종안
------------

1.  **Node 크기 측정**
2.  **Visible subtree 생성**
3.  **Subtree bounding box 계산**
4.  **layoutType별 strategy 선택**
5.  **부모 기준 재귀 배치**
6.  **충돌 보정**
7.  **edge anchor 계산**
8.  **viewport bounds 계산**

핵심 기술 포인트
---------

*   `computedX / computedY` 분리
*   `manualX / manualY` 분리
*   subtree partial relayout
*   전략 패턴
*   2-pass algorithm
*   bounding box 기반
*   freeform 공존

* * *

20\. 제가 권장하는 다음 단계
==================

이제 다음 문서로 바로 이어가면 가장 좋습니다.

**4️⃣ Radial / Tree / Process 실제 좌표 계산 수식 + TypeScript 의사코드 설계서**

이 단계로 가면 진짜 개발자에게 바로 넘길 수준으로 정리됩니다.

## Prompt:
#이제 이 대화는 여기서 종료하고 추가 대화는 새 대화에서 질문할께..
#여때까지의 대화 내용을 프로젝트의 다른 질문및 대화에서 참조할수 있도록 기억하고 업데이트해줘

## Response:
저장된 메모리 업데이트됨

좋습니다.  
여기까지 논의한 **easymindmap의 Node 좌표 계산 알고리즘 설계 내용**까지 반영해서 기억 업데이트해두었습니다.

새 대화에서 이어서 말씀하시면,  
이전 합의 문맥 기준으로 바로 이어서 답변드리겠습니다.



---
Powered by [ChatGPT Exporter](https://www.chatgptexporter.com)
