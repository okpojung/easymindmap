# easymindmap — Layout Coordinate Algorithm

문서 버전: v3.0  
상태: Final Draft  
대상 파일: `docs/03-editor-core/layout-coordinate-algorithm.md`  
관련 문서:
- `docs/01-product/functional-spec.md`
- `docs/03-editor-core/edge-policy.md`
- `docs/03-editor-core/state-architecture.md`
- `docs/03-editor-core/bulk-branch-insert.md`
- `docs/02-domain/node-model.md`

---

# 1. 문서 목적

본 문서는 easymindmap의 **Node 좌표 계산 알고리즘**을 정의한다.

이 문서의 목적은 다음과 같다.

1. 각 노드를 화면의 어디에 배치할지 계산하는 공통 원칙을 정의한다.
2. 방사형, 트리형, 계층형, 진행트리, 자유배치형, Kanban까지 모두 수용하는 좌표 엔진 구조를 정의한다.
3. subtree 단위 Layout override, 다중 가지 추가, 접기/펼치기, drag 이동, partial relayout 요구를 모두 만족하는 전문가 수준의 설계를 제공한다.
4. 프론트엔드 구현, AI 코드 생성, 렌더링 최적화, 향후 협업 확장을 위한 기준 문서로 사용한다.

즉, 이 문서는 단순히 `x`, `y` 좌표를 계산하는 수학 공식 모음이 아니라  
**easymindmap Layout Engine 전체의 설계 기준서**이다.

---

# 2. 좌표 계산이란 무엇인가

아주 쉽게 말하면, 좌표 계산 알고리즘은 아래 질문에 답하는 규칙이다.

> “각 노드를 화면의 어디(x, y)에 놓을 것인가?”

예를 들어 마인드맵에서:

- 루트 노드는 가운데에 놓이고
- 첫 번째 자식은 오른쪽 위
- 두 번째 자식은 오른쪽 아래
- 트리형이면 자식이 아래로 줄지어 배치되고
- 방사형이면 중심에서 각도에 따라 퍼진다

이런 “예쁘고 안 겹치게 줄 세우는 규칙”이 좌표 계산 알고리즘이다.

좌표 계산은 보통 아래 정보를 사용한다.

- 노드 텍스트
- 부모-자식 관계
- 형제 순서 (`orderIndex`)
- 레이아웃 종류 (`layoutType`)
- 노드 크기 (`width`, `height`)
- 접힘/펼침 상태 (`collapsed`)
- 수동 위치 (`manualPosition`)
- subtree 전체 크기

그리고 최종적으로 다음 값을 계산한다.

```ts
node.computedX
node.computedY
```

---

# 3. 왜 중요한가

좌표 계산이 좋지 않으면 다음 문제가 생긴다.

- 노드가 서로 겹친다
- 선이 꼬여 보인다
- 자식이 많은 노드 주변이 엉망이 된다
- layout 변경 시 화면이 심하게 튄다
- 다중 가지 추가 후 전체 구조가 무너진다
- export HTML 품질이 나빠진다

반대로 좌표 계산이 좋으면:

- 구조가 자연스럽게 보인다
- subtree 단위 변경이 안정적이다
- 큰 맵도 정돈되어 보인다
- AI가 생성한 구조도 읽기 쉽게 배치된다
- 자유배치형과 자동배치형이 공존할 수 있다

즉, **좌표 계산 엔진의 품질이 곧 마인드맵 UX 품질**이다.

---

# 4. 초보자용 핵심 개념 5개

## 4.1 좌표는 x, y 두 값이다

웹에서 위치는 보통 다음으로 표현한다.

- `x` = 좌우 위치
- `y` = 상하 위치

예:

```ts
{ x: 300, y: 200 }
```

---

## 4.2 모든 노드는 기준점이 필요하다

노드는 혼자 떠 있는 것이 아니라:

- 루트 기준으로 퍼지거나
- 부모 기준으로 옆/아래/위에 배치된다

즉 좌표 계산은 보통:

> “이 노드를 부모에서 얼마나 떨어뜨릴까?”

를 계산하는 과정이다.

---

## 4.3 노드 크기도 함께 계산해야 한다

노드는 글자 수에 따라 크기가 다르다.

예:

- `"AI"` → 작은 노드
- `"Kubernetes Architecture Overview"` → 큰 노드

따라서 좌표를 배치하기 전에 보통 각 노드의 크기를 알아야 한다.

```ts
node.width
node.height
```

이걸 알아야 노드가 겹치지 않는다.

---

## 4.4 자식이 많으면 subtree 전체 크기가 필요하다

부모 하나 아래에 자식 5개가 있으면,  
자식 하나씩만 보면 안 되고 **자식 전체 묶음이 차지하는 공간**을 먼저 계산해야 한다.

즉:

- 자식1 높이
- 자식2 높이
- 자식3 높이
- 자식 간 간격

을 모두 더해 “이 부모의 자식 subtree 전체 높이/폭”를 구해야 한다.

---

## 4.5 좌표 계산은 보통 2번 한다

전문가 설계에서는 보통 다음 2단계를 거친다.

### 1단계: Measure Pass
- 각 노드와 subtree가 차지하는 크기를 측정

### 2단계: Arrange Pass
- 측정된 크기를 바탕으로 실제 좌표 배치

이 2-pass 구조가 가장 안정적이다.

---

# 5. easymindmap에 맞는 최종 설계 원칙

easymindmap은 단순 tree editor가 아니다.  
이미 제품 요구사항상 다음이 포함된다.

- 방사형
- 트리형
- 계층형
- 진행트리
- 자유배치형
- Kanban
- subtree layout override
- auto layout
- 다중 가지 추가
- 접기/펼치기
- drag 이동
- layout reset

따라서 좌표 엔진은 아래 원칙을 반드시 만족해야 한다.

---

## 5.1 하나의 거대한 알고리즘이 아니라 공통 엔진 + 전략 패턴

즉:

- 공통 계산 파이프라인은 하나
- 실제 배치 규칙은 layout별 strategy 분리

예:

- `RadialLayoutStrategy`
- `TreeLayoutStrategy`
- `HierarchyLayoutStrategy`
- `ProcessLayoutStrategy`
- `FreeformLayoutStrategy`
- `KanbanLayoutStrategy`

---

## 5.2 노드 단위가 아니라 subtree 단위 계산

easymindmap은 subtree override를 허용하므로,  
좌표 계산의 기본 단위는 개별 노드 하나가 아니라 **subtree**여야 한다.

---

## 5.3 계산 좌표와 수동 좌표를 분리

```ts
computedX / computedY = 엔진 계산 결과
manualPosition        = 사용자 수동 위치
```

이 구조가 없으면 Freeform과 자동 Layout이 충돌한다.

---

## 5.4 논리 좌표와 화면 좌표를 분리

- 논리 좌표 = layout engine 내부 기준 좌표
- 화면 좌표 = zoom/pan 적용 후 실제 렌더링 좌표

즉 Viewport Store와 Layout Engine은 분리되어야 한다.

---

## 5.5 partial relayout를 지원해야 한다

다중 가지 추가, subtree layout 변경, 접기/펼치기, 텍스트 수정 시  
전체 맵을 매번 풀 리레이아웃하면 비효율적이다.

따라서 변경된 subtree만 다시 계산하는 구조가 필요하다.

---

# 6. 전체 계산 흐름

전문가 설계 기준 전체 흐름은 아래와 같다.

## Step 1. 입력 데이터 준비
필요 데이터:

- node tree
- parentId
- childIds
- orderIndex
- collapsed
- layoutType
- size (width, height)
- style / padding
- manualPosition
- edge anchor 규칙

---

## Step 2. 표시 대상 트리 생성
- 접힌 노드의 자식은 visible tree에서 제외
- 현재 렌더링 대상 노드 집합 생성

---

## Step 3. subtree bounding box 측정
각 노드별로:

- 자기 자신 크기 (`selfWidth`, `selfHeight`)
- 자식 포함 subtree 전체 크기 (`subtreeWidth`, `subtreeHeight`)

계산

---

## Step 4. layout strategy 선택
- radial-bi
- radial-right
- radial-left
- tree-right
- tree-left
- tree-up
- tree-down
- hierarchy-right
- hierarchy-left
- process-right
- process-left
- process-right-a
- process-right-b
- freeform
- kanban

---

## Step 5. Arrange Pass
부모 기준으로 자식 좌표를 배치한다.

---

## Step 6. Collision Detection & Resolution
겹침을 탐지하고 subtree를 밀어 충돌을 해소한다.

---

## Step 7. Edge Anchor 계산
node box의 시작점/끝점을 계산한다.

---

## Step 8. Bounds 계산
전체 맵 혹은 subtree bounds 계산 → fit screen, minimap, export에 사용

---

# 7. 2-Pass 알고리즘 (핵심)

이 문서에서 가장 중요한 핵심은 2-pass 구조이다.

---

## 7.1 Pass 1: Measure Pass

이 단계에서는 아직 정확한 좌표를 정하지 않는다.  
대신 **각 subtree가 얼마나 큰지** 계산한다.

예:

```ts
type LayoutBox = {
  selfWidth: number
  selfHeight: number
  subtreeWidth: number
  subtreeHeight: number
}
```

여기서 중요한 점은:

- 자기 노드만의 크기와
- 자식 전체를 포함한 subtree 크기를

구분한다는 것이다.

---

## 7.2 Pass 2: Arrange Pass

이제 실제 위치를 정한다.

예:

- 루트는 `(0, 0)`
- 자식 subtree 전체 높이를 기준으로 위아래 균형 배치
- 각 child의 중심점에 좌표 할당

이 방식이 좋은 이유:

- 긴 텍스트도 대응 가능
- 겹침 가능성이 낮다
- subtree 단위 재계산이 쉽다
- strategy 분리가 쉽다

---

# 8. 공통 데이터 구조

권장 구조는 아래와 같다.

```ts
type NodeLayoutType =
  | 'radial-bidirectional'
  | 'radial-right'
  | 'radial-left'
  | 'tree-right'
  | 'tree-left'
  | 'tree-up'
  | 'tree-down'
  | 'hierarchy-right'
  | 'hierarchy-left'
  | 'process-tree-right'
  | 'process-tree-left'
  | 'process-tree-right-a'
  | 'process-tree-right-b'
  | 'freeform'
  | 'kanban'
```

```ts
type LayoutBox = {
  selfWidth: number
  selfHeight: number
  subtreeWidth: number
  subtreeHeight: number
}
```

```ts
type LayoutNode = {
  id: string
  parentId: string | null
  childIds: string[]
  orderIndex: number
  collapsed: boolean

  layoutType?: NodeLayoutType

  width: number
  height: number

  computedX: number
  computedY: number

  manualPosition?: {
    x: number
    y: number
  } | null

  box: LayoutBox

  depth: number
}
```

---

# 9. Tree 계열 알고리즘

Tree는 가장 기본이 되는 구조다.

---

## 9.1 tree-right 개념

부모는 왼쪽, 자식은 오른쪽에 세로로 정렬된다.

예:

```text
Parent
   ├ Child A
   ├ Child B
   └ Child C
```

핵심은 자식을 무작정 줄 세우는 게 아니라,  
**부모 중심 기준으로 자식 묶음 전체가 균형 있게 배치**되도록 하는 것이다.

---

## 9.2 Measure Pass for Tree

자식이 없으면:

```ts
subtreeWidth  = selfWidth
subtreeHeight = selfHeight
```

자식이 있으면:

```text
subtreeWidth  = selfWidth + horizontalGap + max(child.subtreeWidth)
subtreeHeight = max(selfHeight, sum(child.subtreeHeight) + gaps)
```

---

## 9.3 Arrange Pass for tree-right

부모 좌표 `(x, y)`가 주어졌다고 하자.

자식들의 전체 높이:

```ts
totalChildrenHeight =
  sum(children.map(c => c.box.subtreeHeight))
  + (children.length - 1) * verticalGap
```

시작 y:

```ts
startY = parentY - totalChildrenHeight / 2
```

각 자식:

```ts
childX = parentX + parentWidth / 2 + horizontalGap + childWidth / 2
childY = cursorY + child.box.subtreeHeight / 2
```

배치 후:

```ts
cursorY += child.box.subtreeHeight + verticalGap
```

---

## 9.4 tree-right 의사코드

```ts
function arrangeTreeRight(node, x, y, options) {
  node.computedX = x
  node.computedY = y

  const children = getVisibleChildren(node)
  if (children.length === 0) return

  const totalHeight =
    children.reduce((sum, c) => sum + c.box.subtreeHeight, 0)
    + Math.max(0, children.length - 1) * options.verticalGap

  let cursorY = y - totalHeight / 2

  for (const child of children) {
    const childX =
      x + node.box.selfWidth / 2 + options.horizontalGap + child.box.selfWidth / 2

    const childY = cursorY + child.box.subtreeHeight / 2

    arrangeTreeRight(child, childX, childY, options)

    cursorY += child.box.subtreeHeight + options.verticalGap
  }
}
```

---

## 9.5 tree-left / tree-up / tree-down

실제로는 같은 알고리즘을 방향만 바꾸면 된다.

- tree-left → x 방향만 반대로
- tree-down → y 방향으로 확장하고, 자식을 가로 분산
- tree-up → y 방향만 반대로

즉 Tree 계열은 공통 엔진 + 방향 벡터로 구현할 수 있다.

---

# 10. Radial 계열 알고리즘

방사형은 마인드맵다운 느낌을 가장 강하게 주는 구조다.

---

## 10.1 핵심 개념

Tree가 “줄 세우기”라면,  
Radial은 “각도(angle)와 반지름(radius)로 퍼뜨리기”이다.

즉 각 노드는 부모 주변의 특정 방향과 특정 거리로 배치된다.

---

## 10.2 angle range

부모는 자식에게 특정 각도 범위를 할당한다.

예:

- radial-right → `-60° ~ +60°`
- radial-left → `120° ~ 240°`
- radial-bidirectional → 좌측 그룹 / 우측 그룹 분리

그 범위 안에서 자식에게 각도를 분배한다.

---

## 10.3 기본 좌표 공식

각도 `θ`, 거리 `r` 이 있을 때:

```ts
x = parentX + Math.cos(theta) * r
y = parentY + Math.sin(theta) * r
```

---

## 10.4 radial-right

자식이 모두 오른쪽 부채꼴에 위치한다.

예:

- child 1: -40°
- child 2:   0°
- child 3: +40°

---

## 10.5 radial-left

자식이 모두 왼쪽 부채꼴에 위치한다.

예:

- child 1: 140°
- child 2: 180°
- child 3: 220°

---

## 10.6 radial-bidirectional

자식을 좌/우 그룹으로 나눈 뒤,  
각 그룹 안에서 다시 각도를 나눈다.

권장 방식:

- 앞 절반 → 오른쪽
- 뒤 절반 → 왼쪽

또는

- 홀수 index → 오른쪽
- 짝수 index → 왼쪽

이 정책은 옵션화 가능하다.

---

## 10.7 subtree weight 기반 angle allocation (권장)

단순히 자식 수만큼 동일 각도를 나누는 것보다,  
**subtree 크기(weight)** 에 따라 더 넓은 각도를 배정하는 것이 더 자연스럽다.

예:

```ts
childWeight = max(child.box.subtreeWidth, child.box.subtreeHeight)
```

또는

```ts
childWeight = 1 + descendantCount
```

그 다음 총합으로 비율 계산:

```ts
allocatedAngle = totalAngleRange * (childWeight / totalWeight)
```

이 방식이 큰 subtree에게 더 넓은 공간을 주므로 겹침이 줄고 readability가 올라간다.

---

## 10.8 Radial 의사코드

```ts
function arrangeRadial(
  node,
  x,
  y,
  startAngle,
  endAngle,
  radius,
  options
) {
  node.computedX = x
  node.computedY = y

  const children = getVisibleChildren(node)
  if (children.length === 0) return

  const totalWeight = children.reduce(
    (sum, child) => sum + getSubtreeWeight(child),
    0
  )

  let cursorAngle = startAngle

  for (const child of children) {
    const ratio = getSubtreeWeight(child) / totalWeight
    const childAngleRange = (endAngle - startAngle) * ratio
    const childMidAngle = cursorAngle + childAngleRange / 2

    const childRadius = radius + options.radialLevelGap
    const childX = x + Math.cos(childMidAngle) * childRadius
    const childY = y + Math.sin(childMidAngle) * childRadius

    arrangeRadial(
      child,
      childX,
      childY,
      childMidAngle - childAngleRange / 2,
      childMidAngle + childAngleRange / 2,
      childRadius,
      options
    )

    cursorAngle += childAngleRange
  }
}
```

---

# 11. Hierarchy 계열 알고리즘

Hierarchy는 Tree와 비슷하지만 차이가 있다.

Tree:
- 부모 중심 균형 정렬

Hierarchy:
- 같은 레벨 노드 정렬 강조
- 조직도/단계형 구조에 적합

---

## 11.1 계산 방식

### 1단계
BFS/DFS로 level 계산:

```ts
root.level = 0
child.level = parent.level + 1
```

### 2단계
레벨별 그룹화:

```ts
levelMap[0] = [root]
levelMap[1] = [A, B, C]
levelMap[2] = [A1, A2, B1]
```

### 3단계
레벨 위치 고정:

예: hierarchy-right

```ts
x = level * levelGap
y = levelMap[level] 내에서 순서대로 분산
```

---

## 11.2 특징

- 같은 깊이의 노드가 같은 축에 정렬되어 “조직도 느낌”을 준다.
- subtree 균형보다 level 기준 시각 정렬이 더 중요하다.

---

# 12. ProcessTree 계열 알고리즘

ProcessTree는 일반 Tree보다 **흐름(flow)** 이 중요하다.

---

## 12.1 핵심 개념

예:

```text
Step 1 → Step 2 → Step 3
```

형제 순서가 곧 절차 순서가 되므로,  
`orderIndex` 의 중요도가 매우 높다.

---

## 12.2 process-tree-right

- main path를 x축 방향으로 연속 배치
- 상세 branch는 위/아래 또는 하위 line으로 분산

---

## 12.3 process-tree-right-a

- 메인 라인을 유지하면서 세부 단계가 아래로 달리는 구조
- roadmap보다는 절차 상세형에 적합

---

## 12.4 process-tree-right-b

- 같은 수평선 위에 step을 나란히 놓는 타임라인형 구조
- roadmap, 진행 순서, 발표 흐름에 적합

---

## 12.5 권장 구현 방식

ProcessTree는 일반 Tree를 그대로 쓰기보다:

```text
main path + secondary branches
```

구조로 구현하는 편이 더 낫다.

즉:
- 메인 path는 순차 좌표 계산
- 부가 branch는 보조 subtree로 계산

---

# 13. Freeform 알고리즘

Freeform은 “완전 자동배치”가 아니라  
**자동 추천 + 수동 우선** 구조로 가야 한다.

---

## 13.1 핵심 원칙

- `manualPosition` 이 있으면 그 좌표 우선
- 없으면 auto suggested position 사용
- layout reset 시 auto position으로 복귀 가능

즉:

```text
computed position = 추천
manual position   = 최종 우선
```

---

## 13.2 새 자식 추가 시

부모 주변에 기본 추천 위치를 계산한다.

예:

- 부모 오른쪽 아래 약간 offset
- 기존 형제와 겹치지 않는 근처 위치

---

## 13.3 Freeform에서 엔진의 역할

- 수동 위치를 존중
- edge 연결성 유지
- 충돌이 심할 경우 약한 보정
- reset 시 다시 자동화 가능하게 기준 유지

---

# 14. Kanban 알고리즘

Kanban은 일반 subtree layout과 다르다.  
컬럼과 카드 중심의 보드형 구조이다.

---

## 14.1 기본 구조

- depth 0 = board
- depth 1 = column
- depth 2 = card
- depth 3 이상 = 금지 또는 확장 옵션

---

## 14.2 좌표 규칙

### column
```ts
x = boardLeft + columnIndex * (columnWidth + columnGap)
y = fixedTop
```

### card
```ts
x = columnX
y = columnTop + orderIndex * (cardHeight + cardGap)
```

---

## 14.3 Measure Pass for Kanban

- 컬럼 폭 = 최소폭 또는 컨텐츠 기준 폭
- 보드 전체 폭 = 컬럼 폭 합 + gap
- 컬럼 높이 = 내부 카드 높이 합 + gap
- 보드 전체 높이 = 가장 큰 컬럼 높이

---

## 14.4 Arrange Pass for Kanban

- 컬럼을 좌→우로 배치
- 각 컬럼 내부 카드는 상→하로 배치
- 카드 이동 시 `parentId`, `orderIndex` 갱신

---

## 14.5 Kanban과 partial relayout

Kanban에서 카드 하나를 이동할 경우 전체 보드가 아니라  
다음 두 컬럼만 재계산하면 충분하다.

- source column
- target column

따라서 Kanban은 partial relayout 효율이 매우 좋다.

---

# 15. Collision Detection & Resolution

레이아웃 계산 후에도 노드가 겹칠 수 있다.  
특히 긴 라벨, 큰 subtree, radial 밀집 구간에서 자주 발생한다.

---

## 15.1 기본 원칙

- sibling 간 최소 gap 유지
- subtree bounding box 간 최소 gap 유지
- MVP에서는 “겹치지 않게 하는 것”을 우선 (Hard Constraint)

---

## 15.2 Bounding Box 구조

```ts
type BoundingBox = {
  minX: number
  minY: number
  maxX: number
  maxY: number
}
```

---

## 15.3 충돌 탐지

조건:

```ts
boxesOverlap(a, b) =
  a.minX < b.maxX &&
  a.maxX > b.minX &&
  a.minY < b.maxY &&
  a.maxY > b.minY
```

---

## 15.4 Subtree Push Algorithm

충돌 시:

1. 충돌 subtree 탐색
2. 이동 방향 계산
3. subtree 전체를 밀기
4. 하위 subtree bounding box 함께 갱신

예:

- Tree-Right에서 아래 sibling과 겹치면 아래 subtree를 아래로 민다.
- Radial에서 같은 angle band가 겹치면 바깥 반지름을 늘리거나 angle을 조금 조정한다.

---

## 15.5 Soft vs Hard Constraint

- Soft: gap을 선호하지만 조금 겹쳐도 허용
- Hard: 겹침 금지

초기 MVP에서는 **Hard Constraint** 권장.

---

# 16. Partial Relayout

대형 맵에서 전체 relayout는 비싸다.  
따라서 partial relayout가 매우 중요하다.

---

## 16.1 partial relayout가 필요한 경우

- 노드 텍스트 수정
- 자식 추가/삭제
- 접기/펼치기
- 다중 가지 추가
- subtree layout 변경
- Freeform drag
- Kanban card 이동

---

## 16.2 원칙

변경이 발생한 node를 기준으로:

1. 해당 node subtree 재측정
2. 조상 방향으로 bounding box 업데이트
3. 필요한 범위만 재배치
4. viewport bounds 갱신

즉:

```text
local update → upward propagate → limited arrange
```

---

## 16.3 다중 가지 추가와의 관계

다중 가지 추가 후에는:

1. 텍스트 파싱
2. 임시 subtree 생성
3. parent 밑에 삽입
4. parent subtree만 재계산
5. 필요 시 조상까지 propagate

즉 full relayout보다 **subtree relayout** 가 핵심이다.

---

# 17. Engine 구조 설계

전문가 구현 기준으로는 아래처럼 분리하는 것이 좋다.

```text
LayoutEngine
 ├ MeasureEngine
 ├ ArrangeEngine
 ├ StrategyResolver
 ├ CollisionResolver
 ├ EdgeAnchorResolver
 └ BoundsCalculator
```

---

## 17.1 LayoutEngine
진입점

```ts
layoutDocument(document, options)
layoutSubtree(nodeId, document, options)
```

---

## 17.2 MeasureEngine
역할:
- 노드 자체 크기
- subtree 전체 크기 측정

```ts
measureSubtree(nodeId)
```

---

## 17.3 StrategyResolver
역할:
- `layoutType` → strategy 선택

```ts
resolveStrategy(layoutType)
```

---

## 17.4 ArrangeEngine
역할:
- strategy에 맞는 실제 배치 실행

---

## 17.5 CollisionResolver
역할:
- bounding box 충돌 해소

---

## 17.6 EdgeAnchorResolver
역할:
- 부모/자식 box에서 edge 시작점과 끝점 계산

---

## 17.7 BoundsCalculator
역할:
- 전체/부분 bounds 계산
- fit screen, minimap, export와 연결

---

# 18. Layout 옵션 설계

```ts
type LayoutOptions = {
  horizontalGap: number
  verticalGap: number
  radialLevelGap: number
  levelGap: number
  siblingGap: number
  subtreePadding: number
  minNodeGap: number
  processStepGap: number
  kanbanColumnGap: number
  kanbanCardGap: number
}
```

권장 해석:

- Tree → `horizontalGap`, `verticalGap`
- Radial → `radialLevelGap`, `siblingGap`
- Hierarchy → `levelGap`
- Process → `processStepGap`
- Kanban → `kanbanColumnGap`, `kanbanCardGap`

---

# 19. computed / manual / render 좌표 분리

좌표는 최소 3단계로 생각하는 것이 좋다.

## 19.1 computed
layout engine이 계산한 논리 좌표

## 19.2 manual
사용자가 직접 조정한 위치 (주로 Freeform)

## 19.3 render
viewport zoom/pan이 적용된 최종 화면 좌표

즉:

```text
document/layout layer ≠ viewport layer
```

이 분리가 없으면 state 구조와 충돌한다.

---

# 20. 성능 설계

대형 맵에서는 성능이 중요하다.

## 권장 원칙

### 1. 전체 리레이아웃 최소화
- partial relayout 우선

### 2. measure 캐시
- text/style/children 변화 없으면 재사용

### 3. bounds 캐시
- subtree 단위 캐시 가능

### 4. viewport culling
- 좌표는 계산하되 렌더는 생략 가능

### 5. animation 옵션화
- 대형 문서에서는 layout animation 끌 수 있게

---

# 21. IT 초보자용 비유

- Tree = 가족사진 줄 세우기
- Radial = 불꽃놀이처럼 퍼뜨리기
- Hierarchy = 회사 조직도 맞추기
- ProcessTree = 일정표처럼 순서대로 이어 붙이기
- Freeform = 사람이 놓은 위치를 최대한 존중
- Kanban = 게시판 칸에 카드 붙이기

즉 좌표 계산 알고리즘은  
**“노드를 보기 좋게, 안 겹치게, 구조가 드러나게 줄 세우는 규칙”**이다.

---

# 22. depth 컬럼 동기화 전략

`depth`는 `parent_id`에서 파생 가능한 derived data이지만, 렌더링/조회 성능을 위해 DB에 저장한다.

---

## 22.1 depth 계산 원칙

- **앱단(클라이언트 또는 NestJS 서비스)에서 계산 후 저장** — DB 트리거 사용 안 함
- 노드 생성 시: `depth = parent.depth + 1` (루트 노드는 `0`)
- 노드 이동 시: 이동된 노드와 **모든 하위 노드의 depth를 일괄 갱신**

---

## 22.2 노드 이동 시 depth 갱신 방법

노드를 다른 부모 아래로 이동하면 아래 순서로 처리한다.

```text
1. 이동 대상 노드의 새 parent.depth 확인
2. 이동 대상 노드의 new_depth = new_parent.depth + 1
3. 이동 대상 노드를 root로 하는 subtree 전체의 depth를 재귀적으로 갱신
4. parent_id + order_index + depth 변경을 하나의 트랜잭션으로 처리
```

구현 예시 (재귀 CTE):

```sql
WITH RECURSIVE moved_subtree AS (
    SELECT id, $new_depth AS new_depth
    FROM public.nodes WHERE id = $moved_node_id

    UNION ALL

    SELECT n.id, ms.new_depth + 1
    FROM public.nodes n
    JOIN moved_subtree ms ON n.parent_id = ms.id
)
UPDATE public.nodes n
SET depth = ms.new_depth
FROM moved_subtree ms
WHERE n.id = ms.id;
```

---

## 22.3 Layout Engine에서 depth 활용

Layout Engine은 `depth`를 다음 목적으로 직접 사용한다.

- Font size 기본값 결정 (depth → level rule)
- Radial layout의 반지름 계산 (`radius = baseRadius + depth * radialLevelGap`)
- Kanban depth 제한 검증 (`depth ≤ 2`)
- 렌더링 우선순위 및 collapse 처리

> ⚠️ depth는 DB 저장값이지만, Layout Engine이 직접 수정하지는 않는다.  
> depth 변경은 반드시 Document Store → autosave → API → DB 경로로만 처리한다.

---

# 23. 최종 설계안 요약

easymindmap에 가장 적합한 최종 좌표 계산 엔진은 다음과 같다.

1. **2-pass layout**
   - Measure Pass
   - Arrange Pass

2. **전략 패턴**
   - layoutType별 strategy 분리

3. **subtree 중심 계산**
   - 개별 노드가 아니라 subtree 기준

4. **bounding box 기반**
   - 크기를 먼저 계산 후 배치

5. **partial relayout 지원**
   - 다중 가지, drag, 접기/펼치기에 대응

6. **manual/freeform 공존**
   - 자동 추천 + 수동 우선

7. **Kanban 별도 지원**
   - column/card 구조 수용

8. **depth 앱단 동기화**
   - DB 트리거 없이 앱이 직접 계산/갱신

---

# 24. 한 줄 최종 결론

> easymindmap의 Node 좌표 계산 엔진은  
> **2-pass(Measure → Arrange) + layoutType별 전략 패턴 + subtree bounding box 기반 + partial relayout 지원** 구조로 설계한다.
