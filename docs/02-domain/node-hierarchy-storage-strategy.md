# Node Hierarchy Storage Strategy

문서 버전: v2.0  
상태: Final  
최종 결정: 2026-03-29

---

## 목적

마인드맵의 계층 구조를 효율적으로 저장/조회하기 위한 전략 정의

---

## 최종 결정 요약

| 항목 | 결정 | 이유 |
|------|------|------|
| 저장 구조 | Flat (parent_id 기반) | 단순, 이동/삭제 용이 |
| subtree 조회 | 재귀 CTE (`WITH RECURSIVE`) | PostgreSQL 16 성능 충분, path 컬럼 불필요 |
| path 컬럼 | **채택 안 함** | depth + parent_id + CTE로 대체 가능, 추가 관리 부담 없음 |
| order_index 타입 | **INTEGER 유지** | 노드 수 규모상 reorder 비용 미미 |
| 좌표 저장 | **manual_position JSONB** | `{ x: number, y: number }`, schema.sql 기준과 일치 |

---

## 설계 원칙

- **Flat 구조 저장**: 모든 노드를 단일 테이블에 저장, parent_id로 계층 표현
- **Tree는 렌더링 시 생성**: DB에서 flat으로 읽어 클라이언트에서 트리 구조 조립
- **subtree 조작 최적화**: 재귀 CTE 방식으로 처리

---

## 테이블 구조 (schema.sql 기준)

```sql
CREATE TABLE public.nodes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    parent_id        UUID REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- 콘텐츠
    text             TEXT NOT NULL DEFAULT '',

    -- 트리 구조
    depth            INT  NOT NULL DEFAULT 0,
    order_index      INT  NOT NULL DEFAULT 0,

    -- 레이아웃
    layout_type      VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional',
    collapsed        BOOLEAN NOT NULL DEFAULT FALSE,

    -- 도형 & 스타일
    shape_type       VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',
    style_json       JSONB NOT NULL DEFAULT '{}',

    -- 자유배치 좌표 (freeform 전용)
    manual_position  JSONB,   -- { x: number, y: number }

    -- 렌더링 캐시
    size_cache       JSONB,   -- { width: number, height: number }

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## path 컬럼 채택하지 않는 이유

초기 설계에서 PostgreSQL `ltree` 또는 text path 방식을 검토했으나 **채택하지 않기로 결정**한다.

### 이유

1. **depth + parent_id + 재귀 CTE로 충분**
   - PostgreSQL 16은 재귀 CTE 성능이 우수
   - Supabase 환경에서 추가 extension 없이 동작
   - 노드 수 수천 개 수준에서 성능 문제 없음

2. **path 컬럼 유지 비용**
   - 노드 이동 시 path + 모든 하위 노드 path 일괄 갱신 필요
   - 트랜잭션 복잡도 증가
   - ltree extension 설치 및 관리 부담

3. **schema.sql과의 일치**
   - 현재 `schema.sql`의 nodes 테이블에는 path 컬럼이 없음
   - 이 전략 문서도 schema.sql 기준으로 통일

### 대체 전략: 재귀 CTE

```sql
-- 특정 노드의 subtree 전체 조회
WITH RECURSIVE subtree AS (
    -- anchor: 시작 노드
    SELECT id, parent_id, depth, order_index, text
    FROM public.nodes
    WHERE id = $1  -- 시작 노드 ID

    UNION ALL

    -- recursive: 자식 노드 순서대로 조회
    SELECT n.id, n.parent_id, n.depth, n.order_index, n.text
    FROM public.nodes n
    JOIN subtree s ON n.parent_id = s.id
)
SELECT * FROM subtree
ORDER BY depth ASC, order_index ASC;
```

---

## order_index 전략: INTEGER 유지

### 결정

`order_index INTEGER` — schema.sql 기준 유지

### 이유

| 방식 | 중간 삽입 | 장기 관리 | 비고 |
|------|-----------|-----------|------|
| INTEGER | reorder 필요 | 단순 | **채택** |
| NUMERIC/FLOAT | O(1) 삽입 | 소수점 누적 시 재정규화 필요 | 미채택 |

MVP 수준의 노드 수(`< 1,000`)에서는 정렬 일괄 업데이트 비용이 미미하다.  
향후 노드 수가 크게 늘어날 경우 NUMERIC 방식으로 마이그레이션을 검토한다.

### 형제 노드 reorder 방식

```sql
-- 노드 삽입 시: 삽입 위치 이후 노드들의 order_index를 일괄 +1
UPDATE public.nodes
SET order_index = order_index + 1
WHERE map_id = $1
  AND parent_id = $2
  AND order_index >= $3;  -- 삽입 위치

-- 그 후 새 노드 INSERT
INSERT INTO public.nodes (map_id, parent_id, order_index, ...)
VALUES ($1, $2, $3, ...);
```

---

## 좌표계 저장 기준

| 좌표 종류 | 저장 여부 | 컬럼 | 설명 |
|-----------|-----------|------|------|
| computedX/Y | **저장 안 함** | — | Layout Engine이 매 렌더링 시 계산 |
| manualPosition | **저장** | `manual_position JSONB` | freeform layout 전용 사용자 drag 위치 |
| size cache | 저장 | `size_cache JSONB` | 렌더링 최적화용 노드 크기 캐시 |

### manual_position 형식

```json
{ "x": 320.5, "y": -150.0 }
```

- `freeform` layoutType인 노드에만 사용
- 그 외 레이아웃에서는 `null`
- drag 종료 시 autosave patch로 저장

---

## depth 컬럼 동기화 전략

`depth`는 `parent_id`로부터 파생 가능한 derived data이나, 조회 성능을 위해 DB에 저장한다.

### 동기화 원칙

- **앱단에서 계산하여 저장** (DB 트리거 사용 안 함)
- 노드 생성 시: `depth = parent.depth + 1` (루트는 `0`)
- 노드 이동 시: 이동된 노드와 **모든 하위 노드의 depth를 일괄 업데이트**

### 노드 이동 시 depth 갱신

```sql
-- 이동된 subtree의 depth 일괄 갱신 (재귀 CTE 활용)
WITH RECURSIVE moved_subtree AS (
    SELECT id, $new_depth AS new_depth
    FROM public.nodes
    WHERE id = $moved_node_id

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

> ⚠️ 노드 이동은 반드시 트랜잭션으로 처리:  
> `parent_id` 변경 + `order_index` 갱신 + `depth` 일괄 업데이트를 하나의 트랜잭션으로 묶는다.

---

## 맵 전체 로딩 패턴

```sql
-- 맵의 모든 노드를 depth/order 순서로 조회
SELECT *
FROM public.nodes
WHERE map_id = $1
ORDER BY depth ASC, order_index ASC;
```

클라이언트에서 이 flat 배열을 받아 `parent_id` 기준으로 트리 구조를 조립한다.  
`childIds`는 DB에 저장하지 않고 클라이언트 런타임에 파생한다. (→ `state-architecture.md` 참조)

---

## 결론

```
저장: Flat (parent_id 기반)
조회: 재귀 CTE (path 컬럼 없음)
정렬: INTEGER order_index (reorder 방식)
좌표: manual_position JSONB (freeform 전용)
depth: 앱단 계산 후 저장, 노드 이동 시 일괄 갱신
```
