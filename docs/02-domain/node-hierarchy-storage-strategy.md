# Node Hierarchy Storage Strategy

문서 버전: v3.0  
상태: Final  
최종 결정: 2026-03-29

---

## 목적

마인드맵의 계층 구조를 효율적으로 저장·조회하기 위한 전략 정의.  
subtree 조회 성능, 형제 노드 순서 삽입 용이성, 노드 이동 시 일괄 갱신 처리를 최적화한다.

---

## 최종 결정 요약

| 항목 | 결정 | 이유 |
|------|------|------|
| 저장 구조 | Flat (parent_id 기반) | 단순, 이동/삭제 용이 |
| subtree 조회 | **ltree (PostgreSQL extension)** | 재귀 CTE 대비 subtree 쿼리 성능 우수, GIST 인덱스 활용 |
| path 컬럼 | **채택 (ltree 타입)** | prefix-match 기반 subtree 조회, depth 없이도 레벨 계산 가능 |
| order_index 타입 | **FLOAT (NUMERIC)** | 형제 노드 중간 삽입 시 reorder 없이 O(1) 삽입 (예: 1.0 → 1.5 → 2.0) |
| 좌표 저장 | **manual_position JSONB** | `{ x: number, y: number }`, schema.sql 기준과 일치 |
| layout_type 저장 | **노드별 항상 저장 (NOT NULL)** | 부모 상속은 생성 시 값 복사로 처리, 런타임 NULL 해석 제거 |

---

## 설계 원칙

- **Flat 구조 저장**: 모든 노드를 단일 테이블에 저장, `parent_id`로 계층 표현
- **Tree는 렌더링 시 생성**: DB에서 flat으로 읽어 클라이언트에서 트리 구조 조립
- **ltree path**: subtree 조작 최적화를 위해 ltree extension 사용
- **GIST 인덱스**: `path` 컬럼에 GIST 인덱스를 생성하여 `@>`, `<@`, `~` 연산자 성능 극대화

---

## Extension 설치

```sql
-- ltree extension 활성화 (Supabase Self-hosted PostgreSQL 16)
CREATE EXTENSION IF NOT EXISTS ltree;
```

> Supabase Self-hosted 환경에서는 `postgresql.conf`에 별도 설정 없이  
> `CREATE EXTENSION IF NOT EXISTS ltree;` 한 줄로 활성화 가능하다.

---

## 테이블 구조

> **참고**: 아래는 ltree/order_index 전략 관점의 핵심 컬럼 위주 요약이다. 전체 DDL은 `docs/02-domain/db-schema.md § 3. nodes` 참조.

```sql
CREATE TABLE public.nodes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    parent_id        UUID REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- 콘텐츠
    text             TEXT NOT NULL DEFAULT '',
    -- note 컬럼 없음: 노트는 node_notes 테이블로 단일화 (db-schema.md § 3-1)

    -- 트리 구조
    depth            INTEGER NOT NULL DEFAULT 0,
    order_index      FLOAT   NOT NULL DEFAULT 0.0,   -- FLOAT: 중간 삽입 O(1)
    -- path: ltree 계층 경로 (예: 'root.n_abc.n_def')
    -- NULL 허용 없음, 기본값 'root' (루트 노드용)
    path             LTREE   NOT NULL DEFAULT 'root',

    -- 레이아웃
    -- layout_type은 항상 저장 (NOT NULL). 부모 상속은 생성 시 부모 값을 복사 저장
    layout_type      VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    collapsed        BOOLEAN      NOT NULL DEFAULT FALSE,

    -- 도형 & 스타일
    shape_type       VARCHAR(50)  NOT NULL DEFAULT 'rounded-rectangle',
    style_json       JSONB        NOT NULL DEFAULT '{}',

    -- 노드 타입 (V3 대시보드 대비)
    node_type        VARCHAR(30)  NOT NULL DEFAULT 'text',  -- 'text' | 'data-live'

    -- 협업: 노드 최초 생성자 (수정/삭제 권한 판단 기준) — db-schema.md v3.3
    created_by       UUID REFERENCES public.users(id),

    -- 자유배치 좌표 (freeform 전용)
    manual_position  JSONB,   -- { x: number, y: number }

    -- 렌더링 캐시
    size_cache       JSONB,   -- { width: number, height: number }

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 인덱스
CREATE INDEX idx_nodes_map_id    ON public.nodes(map_id);
CREATE INDEX idx_nodes_parent_id ON public.nodes(parent_id);
CREATE INDEX idx_nodes_map_order ON public.nodes(map_id, order_index);

-- ltree GIST 인덱스 (subtree 쿼리 성능 극대화)
CREATE INDEX idx_nodes_path_gist ON public.nodes USING GIST (path);

-- ltree B-Tree 인덱스 (exact match / ORDER BY 최적화)
CREATE INDEX idx_nodes_path_btree ON public.nodes USING BTREE (path);
```

---

## 레이아웃 저장 정책 (최종 확정)

- `nodes.layout_type` 는 **항상 저장한다**.
- DB에서 `NULL = 부모 상속` 방식은 사용하지 않는다.
- 부모 상속은 **노드 생성 시 부모의 `layout_type` 값을 복사 저장**하는 방식으로 처리한다.
- 특정 노드의 `layout_type` 변경 시 해당 노드 subtree의 기본 레이아웃 기준이 된다.
- 렌더러는 DB의 `nodes.layout_type` 값을 신뢰하고, 별도의 상속 해석 로직을 최소화한다.

### 이유

- `schema.sql`에서 `nodes.layout_type` 는 `NOT NULL` + 허용 enum check로 강제된다.
- 협업/Undo/부분 relayout에서 `NULL 상속 해석`은 서버/클라이언트 복잡도를 높인다.
- 생성 시 복사 저장 방식이 API/서비스/렌더링 계층에서 가장 단순하고 안정적이다.

---

## path 컬럼 설계

### path 형식

```
root
root.n_<node_id_short>
root.n_<node_id_short>.n_<node_id_short>
```

- `root`는 루트 노드를 나타내는 고정 레이블
- 각 노드는 자신의 UUID 앞 8자리를 `n_` 접두사와 함께 레이블로 사용
- ltree 레이블은 알파벳·숫자·언더스코어만 허용 → UUID의 하이픈(`-`)을 제거하거나 언더스코어로 대체

예시:
```
node UUID: a1b2c3d4-...  → path label: n_a1b2c3d4
```

### path 초기값 설정

```sql
-- 루트 노드 삽입
INSERT INTO public.nodes (id, map_id, parent_id, path, depth, order_index, text)
VALUES (
    gen_random_uuid(),
    $map_id,
    NULL,
    'root',         -- 루트 노드의 path
    0,
    0.0,
    $text
);

-- 일반 노드 삽입 (부모 path에 자신의 레이블 추가)
INSERT INTO public.nodes (id, map_id, parent_id, path, depth, order_index, text)
SELECT
    $new_id,
    $map_id,
    $parent_id,
    (parent.path || ('n_' || replace(left($new_id::text, 8), '-', ''))::ltree),  -- path 연결
    parent.depth + 1,
    $order_index,
    $text
FROM public.nodes AS parent
WHERE parent.id = $parent_id;
```

### ⚠ ltree 제약 사항 및 최대 깊이 제한

PostgreSQL의 ltree extension에는 다음 물리적 제한이 있다.

| 제한 항목 | 제한값 | 비고 |
|---|---|---|
| 레이블당 최대 크기 | **256 바이트** | `n_a1b2c3d4` 같은 개별 레이블 하나 |
| 전체 path 최대 크기 | **2,000 바이트** | `root.n_xxx.n_yyy...` 문자열 전체 |

**easymindmap의 레이블 크기 계산:**

```
레이블 형식: n_<UUID 앞 8자> = 10자 = 10 바이트 (ASCII)
구분자 (.)                  =  1 바이트
레이블 + 구분자 합계         = 11 바이트/노드

루트 레이블 "root"           =  4 바이트

이론적 최대 깊이 = (2000 - 4) / 11 ≈ 181 단계
```

> UUID 앞 8자를 레이블로 사용하면 이론적으로 매우 깊은 깊이가 가능하지만,
> 실제 UI/UX와 레이아웃 엔진 성능을 고려한 **운영 제한**을 별도로 설정한다.

**확정 정책: 최대 깊이 50단계 제한 (depth ≤ 50)**

```
권장 제한: depth ≤ 50 (DB CHECK 제약 또는 앱 레이어 검증)
```

- 일반적인 마인드맵 사용 패턴에서 depth 10을 초과하는 경우는 드물다.
- depth 50 제한은 ltree 물리 한계보다 충분히 여유 있으며, 엣지 케이스(무한 중첩 버그 등) 방어를 위한 안전망이다.
- **Kanban 레이아웃**은 별도 규칙에 의해 depth ≤ 2 로 더 엄격하게 제한된다 (→ `docs/02-domain/domain-models.md § 5.4`, `docs/03-editor-core/layout/08-layout.md § 6.6`).

**구현 가이드:**

```sql
-- 앱 레이어 또는 DB CHECK 제약으로 depth 상한 적용
ALTER TABLE public.nodes
  ADD CONSTRAINT chk_nodes_depth_limit CHECK (depth <= 50);

-- Kanban 전용 depth 제한 (board=0, column=1, card=2, 3+ 금지)
-- → docs/03-editor-core/layout/08-layout.md § 6.6 참조
ALTER TABLE public.nodes
  ADD CONSTRAINT chk_nodes_kanban_depth
    CHECK (layout_type != 'kanban' OR depth BETWEEN 0 AND 2);
```

```typescript
// 서비스 레이어에서 노드 생성 전 검증
if (parentDepth + 1 > MAX_NODE_DEPTH) {
  throw new AppError('NODE_DEPTH_LIMIT_EXCEEDED', `최대 깊이(${MAX_NODE_DEPTH})를 초과할 수 없습니다.`);
}
const MAX_NODE_DEPTH = 50;
```

---

## ltree 기반 subtree 조회

### GIST 인덱스를 활용한 subtree 전체 조회

```sql
-- 특정 노드의 subtree 전체 조회 (자신 포함)
-- @> 연산자: "path가 $ancestor를 조상으로 포함하는" 모든 노드
SELECT *
FROM public.nodes
WHERE path <@ (SELECT path FROM public.nodes WHERE id = $node_id)
ORDER BY depth ASC, order_index ASC;
```

> `<@` 는 "is descendant of or equal to" 연산자.  
> GIST 인덱스 덕분에 재귀 CTE 없이 O(log n) 수준 성능.

### subtree 존재 여부 확인

```sql
SELECT EXISTS (
    SELECT 1 FROM public.nodes
    WHERE path <@ (SELECT path FROM public.nodes WHERE id = $node_id)
      AND id != $node_id
) AS has_children;
```

### 특정 depth의 노드 조회

```sql
-- depth 2인 노드만 조회 (ltree nlevel 함수 활용)
SELECT * FROM public.nodes
WHERE map_id = $map_id
  AND nlevel(path) = 3;  -- root(1) + level1(2) + level2(3)
```

---

## ltree 기반 노드 이동 (path 일괄 갱신)

노드를 다른 부모 아래로 이동할 때, 해당 노드와 모든 하위 노드의 `path`를 일괄 갱신해야 한다.

### ⚠ 트랜잭션 격리 수준 요구사항

`move_node_subtree` 실행 시 다음 두 가지 동시성 문제가 발생할 수 있다.

| 문제 | 설명 |
|---|---|
| **Non-repeatable Read** | path 조회 직후 다른 트랜잭션이 부모 노드를 이동하면 계산된 `new_base`가 stale 값이 됨 |
| **Phantom node** | subtree UPDATE 도중 다른 트랜잭션이 하위 노드를 추가하면 해당 노드의 path가 갱신되지 않아 불일치 발생 |

**요구 격리 수준**: 최소 `REPEATABLE READ`, 안전을 위해 `SERIALIZABLE` 권장

```sql
-- 노드 이동 트랜잭션 시작 시 격리 수준 명시
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- 또는 더 엄격하게:
-- BEGIN ISOLATION LEVEL SERIALIZABLE;
```

- **Supabase/PostgreSQL 기본값은 `READ COMMITTED`**이므로 이동 로직에서는 반드시 격리 수준을 명시해야 한다.
- `SERIALIZABLE`은 직렬화 실패(40001 오류) 시 클라이언트가 재시도해야 하므로, 재시도 로직이 없는 경우 `REPEATABLE READ`를 사용한다.
- 재정규화(order_index housekeeping)는 `SELECT ... FOR UPDATE`로 충분하므로 별도 격리 수준 변경 불필요.

### 이동 전략

```sql
-- 1. 이동 전 기존 path와 새 path 계산
-- old_path: 이동할 노드의 현재 path
-- new_path: 새 부모의 path || 이동 노드의 레이블

-- 2. subtree 전체 path 일괄 교체 (REPEATABLE READ 이상 격리 수준 필수)
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- 새 부모의 path 조회
DO $$
DECLARE
    old_path  LTREE;
    new_base  LTREE;
    old_label LTREE;
BEGIN
    -- 이동할 노드의 현재 path 조회
    SELECT path INTO old_path FROM public.nodes WHERE id = $moved_node_id;

    -- 새 부모 path 조회
    SELECT path INTO new_base FROM public.nodes WHERE id = $new_parent_id;

    -- 이동 노드 자신의 레이블 (path의 마지막 부분)
    old_label := subpath(old_path, nlevel(old_path) - 1);

    -- subtree 전체 path 교체
    UPDATE public.nodes
    SET
        path       = new_base || subpath(path, nlevel(old_path) - 1),
        parent_id  = CASE WHEN id = $moved_node_id THEN $new_parent_id ELSE parent_id END,
        depth      = nlevel(new_base || subpath(path, nlevel(old_path) - 1)) - 1,
        updated_at = NOW()
    WHERE path <@ old_path;  -- 이동 노드 + 모든 하위 노드

    -- order_index 갱신 (새 위치에서의 순서)
    UPDATE public.nodes
    SET order_index = $new_order_index
    WHERE id = $moved_node_id;
END;
$$;

COMMIT;
```

### 요약: 노드 이동 시 3가지를 하나의 트랜잭션으로 처리

| 갱신 항목 | 대상 | 방법 |
|-----------|------|------|
| `path` | 이동 노드 + 모든 하위 노드 | ltree `subpath` 치환 |
| `parent_id` | 이동 노드만 | 새 parent_id로 교체 |
| `depth` | 이동 노드 + 모든 하위 노드 | `nlevel(new_path) - 1` |
| `order_index` | 이동 노드만 | 새 위치의 순서값 |

---

## order_index 전략: FLOAT 채택

### 결정

`order_index FLOAT` — 중간 삽입 O(1), 재정규화 주기적 실행

### 이유

| 방식 | 중간 삽입 | 장기 관리 | 비고 |
|------|-----------|-----------|------|
| INTEGER | reorder 필요 (형제 전체 UPDATE) | 단순 | 미채택 |
| FLOAT | O(1) 삽입 (예: 1.0↔2.0 사이 → 1.5) | 소수점 누적 시 재정규화 필요 | **채택** |

### 중간 삽입 예시

```sql
-- 형제 노드 A(order=1.0)와 B(order=2.0) 사이에 신규 노드 삽입
-- 신규 노드의 order_index = (1.0 + 2.0) / 2 = 1.5
INSERT INTO public.nodes (map_id, parent_id, path, depth, order_index, text)
VALUES ($map_id, $parent_id, $path, $depth, 1.5, $text);
```

### 재정규화 (housekeeping)

소수점이 일정 깊이 이상 누적되면 서버 측 백그라운드 잡에서 재정규화를 실행한다.

#### 트리거 조건

재정규화는 다음 두 조건 중 하나를 만족할 때 실행된다.

| # | 조건 | 설명 |
|---|------|------|
| 1 | **인접 간격 임계값 이하** | 새 노드 삽입 직전, `\|prev_order - next_order\| < 0.001` 이면 해당 `parent_id` 전체 재정규화 |
| 2 | **소수점 깊이 초과** | `order_index`의 소수부 자릿수가 15자리(IEEE 754 float 정밀도 한계)를 초과할 위험이 있을 때 (삽입 시 계산된 `mid` 값이 `prev`와 `next`와 동일한 부동소수점 값이 되는 경우) |

**조건 1 적용 예시 (서버 삽입 로직)**

```typescript
// apps/api/src/services/nodeOrder.ts

const RENORMALIZE_THRESHOLD = 0.001;

async function getInsertOrderIndex(
  db: D1Database,
  mapId: string,
  parentId: string,
  prevOrderIndex: number | null,
  nextOrderIndex: number | null
): Promise<number> {
  const prev = prevOrderIndex ?? 0.0;
  const next = nextOrderIndex ?? prev + 1.0;
  const gap = Math.abs(next - prev);

  if (gap < RENORMALIZE_THRESHOLD) {
    // 간격이 임계값 미만 → 먼저 재정규화 실행 후 새 order_index 계산
    await renormalizeOrderIndex(db, mapId, parentId);
    // 재정규화 후 prev/next를 다시 조회해야 하므로 caller에서 처리
    throw new RenormalizedError('Order index renormalized, retry insert');
  }

  return (prev + next) / 2;
}

class RenormalizedError extends Error {}
```

**조건 2 적용 기준**: JavaScript `Number` (IEEE 754 double)는 약 15~17자리의 유효 십진수를 표현한다.  
`prev = 1.0`, `next = 1.0 + ε (machine epsilon ≈ 2.22e-16)` 같은 상황이 되면 `mid = prev`가 되어 삽입이 불가능해진다.  
이 경우 서버는 새 `mid` 계산 전에 재정규화를 강제 실행한다.

#### 재정규화 SQL

```sql
-- 특정 부모 하위 형제 노드를 1.0 간격으로 재정규화
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY order_index) AS rn
    FROM public.nodes
    WHERE parent_id = $parent_id AND map_id = $map_id
)
UPDATE public.nodes n
SET order_index = r.rn * 1.0
FROM ranked r
WHERE n.id = r.id;
```

#### 재정규화 실행 시점 요약

```
삽입 요청
    │
    ├─ gap = |next - prev|
    │
    ├─ gap >= 0.001 → mid = (prev + next) / 2 사용, 삽입 완료
    │
    └─ gap < 0.001  → renormalizeOrderIndex(mapId, parentId) 실행
                          → 1.0 간격으로 재배열
                          → 삽입 재시도 (새 prev/next 기준)
```

> **참고**: 재정규화는 형제 노드의 상대 순서를 유지하면서 절대값만 재설정한다.  
> 진행 중인 다른 트랜잭션과의 충돌을 피하기 위해 `SELECT ... FOR UPDATE` 로 잠금 후 실행한다.

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

### size_cache 갱신 주체: 클라이언트 확정

`size_cache JSONB` (`{ width: number, height: number }`) 컬럼의 갱신 주체는 **클라이언트(브라우저)**로 확정한다.

**이유:**

- 노드의 실제 렌더링 크기(width/height)는 **브라우저의 폰트 렌더링 엔진**에 의존한다.
- 동일 텍스트라도 OS, 브라우저, 폰트 hinting, DPI 설정에 따라 픽셀 단위 크기가 달라질 수 있다.
- 서버 측에서는 정확한 렌더링 크기를 계산할 수 없다.

**갱신 시점 및 흐름:**

```
1. 노드 텍스트 변경 (commitEdit)
   → 레이아웃 재계산 전 클라이언트가 DOM 측정 (MeasureEngine)
   → { width, height } 값 획득

2. autosave patch에 size_cache 포함하여 서버 전송
   → PATCH /maps/:id/nodes 의 patch payload에 포함

3. 서버는 전달된 size_cache를 그대로 nodes 테이블에 저장
   → 서버 독자 계산 없음
```

**주의사항:**

| 항목 | 정책 |
|---|---|
| 서버가 size_cache를 직접 계산 | ❌ 금지 |
| 클라이언트가 undefined로 전송 | NULL 유지 (레이아웃 엔진이 추정값 사용) |
| size_cache가 NULL인 노드 | Layout Engine의 `estimateNodeSize()` 함수로 폴백 |

```typescript
// MeasureEngine.ts — 클라이언트 측 DOM 측정
function measureNodeSize(nodeId: string): { width: number; height: number } {
  const el = document.getElementById(`node-${nodeId}`);
  if (!el) return estimateNodeSize(nodeId); // DOM 없으면 추정값
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
```

---

## depth 컬럼 동기화 전략

`depth`는 `path`의 `nlevel()` 값으로부터 파생 가능하지만, 조회 편의성을 위해 별도 컬럼으로 유지한다.

### 동기화 원칙

- **앱단에서 계산하여 저장** (DB 트리거 사용 안 함)
- 노드 생성 시: `depth = parent.depth + 1` (루트는 `0`)
- 노드 이동 시: `depth = nlevel(new_path) - 1`
- ltree path 갱신과 동일 트랜잭션 내에서 처리

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
`childIds`는 DB에 저장하지 않고 클라이언트 런타임에 파생한다. (→ `docs/03-editor-core/state-architecture.md` 참조)

---

## 삭제 정책 (Cascade vs Soft-Delete)

삭제 정책에 관한 상세 내용은 아래 섹션 및 `schema.sql`의 삭제 정책 주석을 참조한다.  
개요:
- **맵(maps)**: soft-delete (`deleted_at`) — 실수 삭제 방지, 휴지통 구현
- **노드(nodes)**: cascade hard-delete — 부모 삭제 시 하위 노드 자동 삭제  
  단, 노드 단독 삭제는 **"삭제 취소 가능 시간 창"(5초 debounce)** 내에서 Undo 가능

> 삭제 정책 전체 내용은 → **삭제 정책 & Trash 메커니즘** 섹션 참조

---

## 협업 중 노드 이동 충돌 처리

> **관련 문서**: `docs/04-extensions/collaboration/25-map-collaboration.md § LWW 충돌 해소`  
> **관련 문서**: `docs/03-editor-core/node/02-node-editing.md § 16. 협업 충돌 처리 규칙`

협업 중 두 사용자가 동시에 노드를 이동하면 `path`, `parent_id`, `order_index` 갱신이 충돌할 수 있다. 다음 정책을 따른다.

### 충돌 유형별 처리

| 충돌 유형 | 처리 정책 |
|---------|---------|
| 동일 노드를 두 사용자가 동시에 다른 부모로 이동 | **Server-First** — 서버에 먼저 도착한 이동 요청을 승인, 이후 요청은 409 Conflict로 반환 후 클라이언트 재시도 |
| 한 사용자가 이동 중 다른 사용자가 이동 대상 노드 삭제 | 삭제가 우선 처리되면 이동 요청 거부 ("편집 대상 노드가 삭제되었습니다" 알림) |
| 동일 부모 아래 같은 위치에 두 사용자가 동시 삽입 (`order_index` 충돌) | LWW — 두 값 모두 수용하되 `order_index`를 재정규화로 구분 |
| 한 사용자의 이동 대상 부모가 다른 사용자에 의해 이동됨 | 서버가 최신 path 기준으로 재계산 후 적용 |

### 동시성 보호 메커니즘

1. **REPEATABLE READ 트랜잭션**: 노드 이동(`move_node_subtree`) 실행 시 최소 `REPEATABLE READ` 격리 수준 적용 (→ 본 문서 § 트랜잭션 격리 수준 요구사항)
2. **Soft Lock**: 클라이언트는 `node:editing:start` 이벤트로 이동 중인 노드를 Soft Lock 표시 — TTL 5초 (→ `docs/04-extensions/collaboration/25-map-collaboration.md § 14.6`)
3. **baseVersion 검증**: Autosave patch 처리 시 `baseVersion` vs `current_version` 불일치 → 409 Conflict 반환 → 클라이언트 3단계 충돌 해소 적용 (→ `docs/03-editor-core/save/14-save.md § 5.3`)
4. **순환 참조 방지**: 이동 요청 시 서버에서 `path <@` 연산으로 자기 자신 또는 자기 하위 노드 아래 이동 시도를 차단

---

## 결론

```
저장: Flat (parent_id 기반)
조회: ltree path 기반 prefix-match (GIST 인덱스)
정렬: FLOAT order_index (중간 삽입 O(1), 주기적 재정규화)
이동: ltree subpath 치환 + depth 갱신 (REPEATABLE READ 이상 격리 수준 필수)
좌표: manual_position JSONB (freeform 전용)
depth: 앱단 계산 후 저장 (ltree nlevel 기준)
깊이 제한: 최대 depth 50단계 (ltree 물리 한계 ~181단계 대비 운영 안전망)
           Kanban 레이아웃은 depth ≤ 2 (chk_nodes_kanban_depth CHECK 제약)
size_cache: 클라이언트(브라우저)가 DOM 측정 후 autosave patch로 전송
협업 충돌: Server-First (구조 이동) + LWW (텍스트/스타일) + Soft Lock TTL 5초
node_type: 'text' | 'data-live' (기본값 'text', V3 대시보드 대비)
```

---

## 삭제 정책 & Trash 메커니즘

### 정책 분류

| 대상 | 방식 | 이유 |
|------|------|------|
| 맵 (maps) | **Soft-delete** (`deleted_at` 설정) | 실수 삭제 방지, 30일 보관 후 auto-purge |
| 노드 하위 트리 | **Cascade hard-delete** | 부모 삭제 시 DB `ON DELETE CASCADE` 자동 처리 |
| 단일 노드 삭제 | **즉시 hard-delete** + 클라이언트 Undo | 5초 이내 `Ctrl+Z` / Undo 버튼으로 복구 가능 |

### 맵 Soft-Delete

```sql
-- 맵 삭제: deleted_at 설정 (soft-delete)
UPDATE public.maps
SET deleted_at = NOW()
WHERE id = $map_id AND owner_id = auth.uid();

-- 삭제된 맵 목록 조회 (휴지통)
SELECT * FROM public.maps
WHERE owner_id = auth.uid()
  AND deleted_at IS NOT NULL
ORDER BY deleted_at DESC;

-- 맵 복구 (30일 이내)
UPDATE public.maps
SET deleted_at = NULL
WHERE id = $map_id AND owner_id = auth.uid()
  AND deleted_at > NOW() - INTERVAL '30 days';

-- 30일 경과 맵 자동 삭제 (pg_cron 또는 BullMQ Worker 배치)
DELETE FROM public.maps
WHERE deleted_at < NOW() - INTERVAL '30 days';
```

> 맵이 soft-delete 상태이면 해당 맵의 노드는 DB에 그대로 보존된다.  
> 복구 시 `deleted_at = NULL`로 설정하면 노드까지 함께 복구된다.

### 노드 단독 삭제: 클라이언트 Undo 메커니즘

노드 단독 삭제는 즉시 DB에서 삭제하되, 클라이언트의 **Command 히스토리**를 통해 취소할 수 있다.

```
사용자 노드 삭제
   ↓
1. 클라이언트: Command 히스토리에 DeleteNodeCommand 기록
              (삭제된 노드 데이터 스냅샷 포함)
   ↓
2. PATCH /maps/:id/nodes → 노드 삭제 패치 서버 전송
   ↓
3. 서버: DB에서 노드 hard-delete (CASCADE로 하위 노드 함께 삭제)
   ↓
4. 5초 이내 Ctrl+Z → Command 히스토리에서 DeleteNodeCommand 복원
   ↓
5. 클라이언트: 스냅샷 기반으로 POST /maps/:id/nodes (재삽입)
              → DB에 노드 재생성
```

```typescript
// 클라이언트 DeleteNodeCommand 예시
class DeleteNodeCommand implements Command {
  private snapshot: NodeSnapshot;  // 삭제 전 노드 데이터 전체

  execute(store: DocumentStore) {
    this.snapshot = store.captureNodeSnapshot(this.nodeId);
    store.removeNode(this.nodeId);
    // autosave patch 발행
  }

  undo(store: DocumentStore) {
    store.restoreNodeSnapshot(this.snapshot);
    // 서버에 재삽입 요청
  }
}
```

### 대규모 삭제 방지 가이드라인

- **subtree 삭제 시 경고 모달**: 자식 노드가 3개 이상인 노드 삭제 시 확인 다이얼로그 표시
- **Undo 가능 시간 창**: 단일 노드 삭제는 5초, subtree 삭제는 10초
- **Undo 스택 한도**: 최대 100개 명령어 (초과 시 가장 오래된 항목 제거 — `12-history-undo-redo.md § 6.6`)

### 삭제 관련 RLS

```sql
-- 맵 소유자만 맵을 soft-delete할 수 있음 (이미 schema.sql에 정의됨)
-- "users can delete own maps" 정책이 DELETE를 처리
-- soft-delete는 UPDATE로 처리 → "users can update own maps" 정책 적용

-- 노드 삭제: 맵 소유자 또는 workspace editor/owner만 가능
-- "map owners can manage nodes" 및 "workspace members can manage nodes" 정책이 커버
```

---

## 관련 문서 (Cross-Reference)

| 문서 | 관련 내용 |
|------|---------|
| `docs/02-domain/db-schema.md` | nodes 테이블 전체 DDL, RLS 정책, ERD |
| `docs/02-domain/domain-models.md` | NodeObject 타입 정의, LayoutType, ShapeType, kanban depth 규칙 |
| `docs/03-editor-core/state-architecture.md` | childIds 런타임 파생, MindmapNode 타입, Autosave Store |
| `docs/03-editor-core/save/14-save.md` | Autosave patch 흐름, orderIndex 재정규화 트리거, 충돌 해소 3단계 |
| `docs/03-editor-core/history/12-history-undo-redo.md` | 노드 삭제 Undo 메커니즘, Command 히스토리 구조 |
| `docs/03-editor-core/node/02-node-editing.md` | 노드 이동 규칙, 협업 충돌 처리 규칙 (§ 16) |
| `docs/03-editor-core/layout/08-layout.md` | LayoutType 목록, Kanban depth 제약, freeform manualPosition |
| `docs/04-extensions/collaboration/25-map-collaboration.md` | Soft Lock TTL, LWW 충돌 정책, 실시간 동기화 흐름 |
