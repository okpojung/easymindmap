-- ════════════════════════════════════════════════════════════════════
-- 델타 — 연결 맵 집계 표  2026-10-14
--   근거: docs/04-extensions/linked-maps.md (사용자 요청: "내문서함에서 연결된 맵에
--         호버링하면 몇개의 맵에 연결되어 있는지 정보를 표시")
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 어디서: docker 가 도는 호스트의 SSH 터미널 — dev 는 `ubuntu@em-dev`.
--   bash apps/api/database/deltas/apply-delta.sh 이파일   (컨테이너 자동 탐색)
--   또는 psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
--
-- **두 번 실행해도 안전하다** — CREATE … IF NOT EXISTS 만 쓴다.
-- **지우는 것이 없다** — 표 하나를 더할 뿐이다.
--
-- 적용 전에도 앱은 죽지 않는다 — 표가 없으면 저장은 그대로 되고(집계만 건너뛴다),
-- 문서함 정보 팝업에 "연결" 줄이 안 보인다. 연결 맵 기능 자체(붙이기·떼기·잠금)는
-- 이 표 없이 동작한다.
--
-- 적용 뒤 **재기동이 필요 없다** — 늦어도 1분 뒤부터 표를 쓴다(표 없음을 1분 기억).
-- 이미 연결해 둔 맵은 **그 큰 맵을 한 번 저장해야** 셈에 잡힌다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.map_links (
    parent_map_id UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    child_map_id  UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (parent_map_id, child_map_id)
);
CREATE INDEX IF NOT EXISTS idx_map_links_child ON public.map_links (child_map_id);
COMMENT ON TABLE public.map_links IS
    '연결 맵 — parent 맵 안의 노드가 child 맵을 가리킨다(문서의 linkMapId 에서 저장 때 만든다). 문서함의 "맵 N개에 연결됨" 집계용.';

COMMIT;

-- 검증
SELECT to_regclass('public.map_links') AS map_links,
       (SELECT COUNT(*) FROM public.map_links) AS rows;
