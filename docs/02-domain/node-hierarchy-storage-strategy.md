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

```sql
CREATE TABLE public.nodes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    parent_id        UUID REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- 콘텐츠
    text             TEXT NOT NULL DEFAULT '',
    -- note 컬럼 없음: 노트는 node_notes 테이블로 단일화

    -- 트리 구조
    depth            INT    NOT NULL DEFAULT 0,
    order_index      FLOAT  NOT NULL DEFAULT 0.0,   -- FLOAT: 중간 삽입 O(1)
    path             LTREE  NOT NULL,                -- ltree 계층 경로 (예: 'root.n_abc.n_def')

    -- 레이아웃
    layout_type      VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    collapsed        BOOLEAN      NOT NULL DEFAULT FALSE,

    -- 도형 & 스타일
    shape_type       VARCHAR(50)  NOT NULL DEFAULT 'rounded-rectangle',
    style_json       JSONB        NOT NULL DEFAULT '{}',

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

### 이동 전략

```sql
-- 1. 이동 전 기존 path와 새 path 계산
-- old_path: 이동할 노드의 현재 path
-- new_path: 새 부모의 path || 이동 노드의 레이블

-- 2. subtree 전체 path 일괄 교체 (트랜잭션 내 실행)
BEGIN;

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
`childIds`는 DB에 저장하지 않고 클라이언트 런타임에 파생한다. (→ `state-architecture.md` 참조)

---

## 삭제 정책 (Cascade vs Soft-Delete)

삭제 정책에 관한 상세 내용은 아래 섹션 및 `schema.sql`의 삭제 정책 주석을 참조한다.  
개요:
- **맵(maps)**: soft-delete (`deleted_at`) — 실수 삭제 방지, 휴지통 구현
- **노드(nodes)**: cascade hard-delete — 부모 삭제 시 하위 노드 자동 삭제  
  단, 노드 단독 삭제는 **"삭제 취소 가능 시간 창"(5초 debounce)** 내에서 Undo 가능

> 삭제 정책 전체 내용은 → **삭제 정책 & Trash 메커니즘** 섹션 참조

---

## 결론

```
저장: Flat (parent_id 기반)
조회: ltree path 기반 prefix-match (GIST 인덱스)
정렬: FLOAT order_index (중간 삽입 O(1), 주기적 재정규화)
이동: ltree subpath 치환 + depth 갱신 (단일 트랜잭션)
좌표: manual_position JSONB (freeform 전용)
depth: 앱단 계산 후 저장 (ltree nlevel 기준)
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
2. PATCH /maps/:id/document → 노드 삭제 패치 서버 전송
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
- **Undo 스택 한도**: 최대 50개 명령어 (초과 시 가장 오래된 항목 제거)

### 삭제 관련 RLS

```sql
-- 맵 소유자만 맵을 soft-delete할 수 있음 (이미 schema.sql에 정의됨)
-- "users can delete own maps" 정책이 DELETE를 처리
-- soft-delete는 UPDATE로 처리 → "users can update own maps" 정책 적용

-- 노드 삭제: 맵 소유자 또는 workspace editor/owner만 가능
-- "map owners can manage nodes" 및 "workspace members can manage nodes" 정책이 커버
```
