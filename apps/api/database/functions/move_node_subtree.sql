-- ============================================================
-- move_node_subtree
-- 노드 및 모든 하위 노드를 새 부모 아래로 이동하는 PostgreSQL 함수
--
-- 설계 기준: docs/02-domain/node-hierarchy-storage-strategy.md
-- 호출: NodeService.moveNodeSubtree() → supabase.rpc('move_node_subtree', ...)
--
-- 처리 내용 (단일 트랜잭션):
--   1. 이동 노드의 현재 path (old_path) 확인
--   2. 새 부모의 path (new_base_path) 확인
--   3. subtree 전체의 path를 ltree subpath 치환으로 일괄 갱신
--   4. depth = nlevel(new_path) - 1 로 일괄 재계산
--   5. 이동 노드의 parent_id, order_index 갱신
-- ============================================================

CREATE OR REPLACE FUNCTION public.move_node_subtree(
    p_node_id         UUID,
    p_new_parent_id   UUID,
    p_new_order_index FLOAT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_path      LTREE;
    v_new_base_path LTREE;
    v_old_nlevel    INT;
BEGIN
    -- 1. 이동 노드의 현재 path 조회
    SELECT path INTO v_old_path
    FROM public.nodes
    WHERE id = p_node_id;

    IF v_old_path IS NULL THEN
        RAISE EXCEPTION 'Node % not found', p_node_id;
    END IF;

    -- 2. 새 부모의 path 조회
    SELECT path INTO v_new_base_path
    FROM public.nodes
    WHERE id = p_new_parent_id;

    IF v_new_base_path IS NULL THEN
        RAISE EXCEPTION 'Parent node % not found', p_new_parent_id;
    END IF;

    -- 3. 순환 참조 방지 (새 부모가 이동 노드 하위인 경우 차단)
    IF v_new_base_path <@ v_old_path THEN
        RAISE EXCEPTION 'Cannot move node into its own descendant';
    END IF;

    v_old_nlevel := nlevel(v_old_path);

    -- 4. subtree 전체 path 일괄 갱신 + depth 재계산
    --    subpath(path, old_nlevel - 1) → 이동 노드 자신의 레이블 이하
    --    v_new_base_path ||  → 새 부모의 path 앞에 붙임
    UPDATE public.nodes
    SET
        path       = v_new_base_path || subpath(path, v_old_nlevel - 1),
        depth      = nlevel(v_new_base_path || subpath(path, v_old_nlevel - 1)) - 1,
        updated_at = NOW()
    WHERE path <@ v_old_path;  -- 이동 노드 + 모든 하위 노드 대상

    -- 5. 이동 노드의 parent_id, order_index 갱신
    UPDATE public.nodes
    SET
        parent_id   = p_new_parent_id,
        order_index = p_new_order_index,
        updated_at  = NOW()
    WHERE id = p_node_id;
END;
$$;

-- ============================================================
-- get_node_subtree
-- 특정 노드의 subtree 전체를 조회하는 PostgreSQL 함수
-- ltree <@ 연산자로 GIST 인덱스 활용
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_node_subtree(
    p_node_id UUID
)
RETURNS SETOF public.nodes
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT *
    FROM public.nodes
    WHERE path <@ (
        SELECT path FROM public.nodes WHERE id = p_node_id
    )
    ORDER BY depth ASC, order_index ASC;
$$;
