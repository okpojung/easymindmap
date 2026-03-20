# easymindmap — Layout Engine 개발 명세

> 문서 위치: `docs/dev/layout-engine.md`

---

## 1. 핵심 원칙

```
1. 2-pass algorithm (Measure → Arrange)
2. subtree 단위 계산
3. computedX / computedY = 계산값 (DB 저장 안 함)
4. manualX / manualY = 사용자 지정 (DB 저장)
5. partial relayout (변경된 subtree만 재계산)
6. bounding box 기반 배치
```

---

## 2. 엔진 구조

```
LayoutEngine
 ├── StrategyResolver      레이아웃 타입 → Strategy 선택
 ├── MeasureEngine         노드 크기 측정 (DOM 또는 추정)
 │
 ├── RadialStrategy        방사형 (radial-bidirectional, radial-right, radial-left)
 ├── TreeStrategy          트리 (tree-up, tree-down, tree-right, tree-left)
 ├── HierarchyStrategy     계층형 (hierarchy-right, hierarchy-left)
 ├── ProcessStrategy       프로세스 (process-right, process-left, process-right-a/b)
 └── FreeformStrategy      자유배치 (freeform)
 │
 ├── CollisionResolver     노드 겹침 해소
 └── EdgeRouter            엣지 경로 계산 (curve-line / tree-line)
```

---

## 3. 2-Pass 알고리즘

### Pass 1: Measure (바텀업)

```
리프 노드부터 루트 방향으로 bounding box 계산

measureNode(node):
  if node.isLeaf:
    node.measured = { width: nodeWidth, height: nodeHeight }
    return node.measured

  childrenBounds = node.children.map(measureNode)
  node.measured = calculateSubtreeBounds(childrenBounds, layoutType)
  return node.measured
```

### Pass 2: Arrange (탑다운)

```
루트에서 리프 방향으로 실제 좌표 배정

arrangeNode(node, parentPos, depth):
  node.computedX = calculateX(node, parentPos, depth)
  node.computedY = calculateY(node, parentPos, depth)

  childOffset = calculateChildStartOffset(node)
  node.children.forEach((child, i) => {
    arrangeNode(child, { x: node.computedX, y: node.computedY }, depth + 1)
  })
```

---

## 4. 레이아웃 타입별 규칙

```
radial-bidirectional   루트 중심, 자식 좌우 분산
radial-right           루트 중심, 자식 오른쪽으로만
radial-left            루트 중심, 자식 왼쪽으로만
tree-down              루트 상단, 자식 아래로
tree-up                루트 하단, 자식 위로
tree-right             루트 왼쪽, 자식 오른쪽으로
tree-left              루트 오른쪽, 자식 왼쪽으로
hierarchy-right        들여쓰기 계층 (오른쪽 확장)
hierarchy-left         들여쓰기 계층 (왼쪽 확장)
process-right          가로 플로우차트
process-left           가로 플로우차트 (왼쪽)
freeform               manual_x / manual_y 그대로 사용
```

---

## 5. Edge 정책 (최종 확정)

```typescript
function getEdgeType(node: Node): EdgeType {
  const rootLayout = getRootLayoutType(node);

  if (rootLayout.startsWith('radial-')) {
    return 'curve-line';   // 방사형 → 곡선
  }
  return 'tree-line';      // 그 외 → 직각 연결선
}
```

---

## 6. Partial Relayout

노드 하나가 변경될 때 전체 맵을 재계산하지 않습니다.

```typescript
function relayout(changedNodeId: string): void {
  // 변경된 노드의 최상위 subtree root 찾기
  const subtreeRoot = findSubtreeRoot(changedNodeId);

  // 해당 subtree만 measure + arrange
  measureNode(subtreeRoot);
  arrangeNode(subtreeRoot, getParentPos(subtreeRoot), getDepth(subtreeRoot));
}
```

---

## 7. 좌표 저장 정책

```
computedX / computedY  → 렌더링 전용, DB 저장 안 함
manualX / manualY      → position_mode='manual'인 경우에만 DB 저장

nodes 테이블:
  manual_x    NUMERIC(14,2)  NULL
  manual_y    NUMERIC(14,2)  NULL
  position_mode VARCHAR(20)  DEFAULT 'auto'  -- 'auto' | 'manual'
```
