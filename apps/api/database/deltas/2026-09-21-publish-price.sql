-- ════════════════════════════════════════════════════════════════════
-- 델타 — 유료공개의 **값** + 검색 경계 (`price_krw` · `paid_at`)   2026-09-21
--   근거: docs/04-extensions/publish/27b-paid-implementation.md §3.1
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 이미 돌고 있는 서버의 DB 에 그대로 붙여넣는다.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
--
-- **두 번 실행해도 안전하다** — ADD COLUMN IF NOT EXISTS 만 쓴다.
-- **지우는 것이 없다** — 칸 둘을 더할 뿐이다.
--
-- ★ **기본이 NULL(무료)인 것이 이 델타의 핵심이다.** 지금 퍼블리싱돼 있는
--   맵이 이 델타 하나로 저절로 유료가 되는 일이 없다. 값을 매기는 것은
--   저자가 한 번 더 눌러야 일어난다 (`listed` 델타와 같은 이유).
--
-- ★ **값만 코어에 둔다.** 수수료율·저자 몫·판매 기록은 여기 없다 —
--   그것은 거래라서 유료 모듈(pro)의 `map_sales` 에만 있다 (27b §2.1).
--   `price_krw` 는 비밀이 아니라 **손님에게 보여 줘야 하는 숫자**다.
--
-- 적용 전에도 앱은 죽지 않는다 — 칸이 없으면 서버가 **값을 매길 수 없는
-- 서버**로 보고 유료공개만 꺼진다 (`publish.service.ts` 의 hasPrice).
--
-- 적용 뒤 **재기동이 필요 없다** — 서버가 60초 안에 다시 확인한다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.published_maps
    -- NULL = 무료. 원 단위 정수 (소수점 없음)
    ADD COLUMN IF NOT EXISTS price_krw INT,
    -- 언제부터 유료였나 — 무료↔유료를 오간 맵의 이력 판정에 쓴다
    ADD COLUMN IF NOT EXISTS paid_at   TIMESTAMPTZ;

-- 값은 **양수**여야 한다. 0원·음수짜리 "유료" 맵은 뜻이 없고,
-- 상·하한(1,000~100,000원 권고)은 설정값이라 앱이 본다 (27b §8.3).
ALTER TABLE public.published_maps
    DROP CONSTRAINT IF EXISTS published_maps_price_krw_positive;
ALTER TABLE public.published_maps
    ADD CONSTRAINT published_maps_price_krw_positive
    CHECK (price_krw IS NULL OR price_krw > 0);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- ② 유료 맵의 **검색 경계** (27b §5.3)
--
-- 유료 맵을 통째로 색인하면 "이 맵 안에 그 말이 있다" 는 사실이 검색
-- 건수로 샌다 — 사지 않은 사람이 검색어를 바꿔 가며 잘라 낸 부분을
-- **스무고개로 확인**할 수 있다. 그래서 유료 맵의 검색은 **2레벨까지만
-- 담은 다른 색인**(`preview_text`)을 훑는다.
--
-- ★ 두 색인을 **트리거가 늘 함께** 만든다 — "유료로 바꿀 때 다시 만든다"
--   식으로 절차에 기대지 않는다. 절차가 한 번 빠지면 색인은 전문인 채로
--   남고 아무도 모른다.
--
-- ★ 아래 UPDATE 는 **이미 저장된 맵 전부**를 한 번 훑는다. 맵이 많으면
--   몇 초에서 몇 분 걸릴 수 있다 — 값이 달라지는 행만 쓰므로 두 번째
--   실행은 빠르다.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE public.map_documents
    ADD COLUMN IF NOT EXISTS preview_text TEXT;

CREATE OR REPLACE FUNCTION public.map_preview_text(doc JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT string_agg(t, E'\n')
      FROM (
        SELECT DISTINCT btrim(regexp_replace(v #>> '{}', '\s+', ' ', 'g')) AS t
          FROM (
            -- 중심 (깊이 1)
            SELECT jsonb_path_query(doc, '$.map.root.text')               AS v
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.root.tags[*]')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.root.tag')
             UNION ALL
            -- 1레벨 가지 (깊이 2)
            SELECT jsonb_path_query(doc, '$.map.branches[*].text')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.branches[*].tags[*]')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.branches[*].tag')
             UNION ALL
            -- 둘째 이후의 중심주제와 그 1레벨 (2026-09-15)
            SELECT jsonb_path_query(doc, '$.map.centers[*].root.text')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.centers[*].root.tags[*]')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.centers[*].branches[*].text')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.centers[*].branches[*].tags[*]')
          ) q
         WHERE jsonb_typeof(v) = 'string'
      ) d
     WHERE t <> '';
$$;

CREATE OR REPLACE FUNCTION public.map_documents_sync_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_text  := public.map_search_text(NEW.doc);
    NEW.preview_text := public.map_preview_text(NEW.doc);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS map_documents_search_text ON public.map_documents;
CREATE TRIGGER map_documents_search_text
    BEFORE INSERT OR UPDATE OF doc ON public.map_documents
    FOR EACH ROW EXECUTE FUNCTION public.map_documents_sync_search_text();

-- 이미 저장된 맵 메우기 — 값이 달라지는 행만 쓴다
UPDATE public.map_documents d
   SET search_text  = n.v,
       preview_text = n.p
  FROM (SELECT map_id, public.map_search_text(doc) AS v,
               public.map_preview_text(doc) AS p
          FROM public.map_documents) n
 WHERE n.map_id = d.map_id
   AND (d.search_text IS DISTINCT FROM n.v OR d.preview_text IS DISTINCT FROM n.p);

CREATE INDEX IF NOT EXISTS idx_map_documents_preview_trgm
    ON public.map_documents USING GIN (preview_text gin_trgm_ops);

-- ③ 진열 인덱스 — 유료공개도 목록에 뜬다
DROP INDEX IF EXISTS public.idx_published_maps_listed;
CREATE INDEX IF NOT EXISTS idx_published_maps_listed
    ON public.published_maps (published_at DESC)
 WHERE listed AND visibility IN ('public', 'paid') AND unpublished_at IS NULL;

-- ── 검증 ────────────────────────────────────────────────────────────
--   기대: 칸 2행(둘 다 nullable · default 없음) · 제약 1행 · 유료 0건
SELECT 'column' AS chk, column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'published_maps'
   AND column_name IN ('price_krw', 'paid_at')
 ORDER BY column_name;

SELECT 'constraint' AS chk, conname
  FROM pg_constraint
 WHERE conname = 'published_maps_price_krw_positive';

SELECT 'rows' AS chk, visibility, count(*) FILTER (WHERE price_krw IS NOT NULL) AS priced,
       count(*) AS total
  FROM public.published_maps
 WHERE unpublished_at IS NULL
 GROUP BY visibility;

SELECT 'preview_text' AS chk, count(*) FILTER (WHERE preview_text IS NOT NULL) AS filled,
       count(*) AS total
  FROM public.map_documents;

SELECT 'preview_index' AS chk, indexname
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'map_documents'
   AND indexname = 'idx_map_documents_preview_trgm';
