-- ════════════════════════════════════════════════════════════════════
-- 델타 — 진열대(`listed`)  2026-09-12
--   근거: docs/04-extensions/publish/27a-paid-publish.md §0.4 ⑶
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 이미 돌고 있는 서버의 DB 에 그대로 붙여넣는다.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
--
-- **두 번 실행해도 안전하다** — ADD COLUMN / CREATE INDEX 는
-- IF NOT EXISTS 만 쓴다.
-- **지우는 것이 없다** — 칸 하나를 더할 뿐이다.
--
-- ★ **기본값이 FALSE 인 것이 이 델타의 핵심이다.** 지금 퍼블리싱돼 있는
--   맵이 이 델타 하나로 **저절로 진열대에 오르는 일이 없다.** 공개 범위가
--   넓어지는 변경은 사람이 한 번 더 눌러야 일어나야 한다.
--
-- 적용 전에도 앱은 죽지 않는다 — 칸이 없으면 서버가 **아무것도 진열되지
-- 않은 것으로** 보고 진열 기능만 꺼진다(`publish.service.ts` 의 hasListed).
--
-- 적용 뒤 **재기동이 필요 없다** — 서버가 60초 안에 다시 확인한다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 저자가 "진열대에 올린다" 를 고른 맵만 TRUE.
--   FALSE = 링크를 아는 사람만 (지금까지의 동작 그대로)
--   TRUE  = 진열대 목록에 뜨고, 카드의 robots 가 index 로 바뀐다
ALTER TABLE public.published_maps
    ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE;

-- 진열대 목록이 쓰는 유일한 조회 조건 그대로를 부분 인덱스로 둔다.
-- 진열된 맵은 전체의 일부라, 전체 인덱스보다 훨씬 작다.
CREATE INDEX IF NOT EXISTS idx_published_maps_listed
    ON public.published_maps (published_at DESC)
 WHERE listed AND visibility = 'public' AND unpublished_at IS NULL;

COMMIT;

-- ── 검증 ────────────────────────────────────────────────────────────
--   기대: listed 칸 1행(default false) · 인덱스 1행 · 진열 0건
SELECT 'column' AS chk, column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'published_maps'
   AND column_name = 'listed';

SELECT 'index' AS chk, indexname
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'published_maps'
   AND indexname = 'idx_published_maps_listed';

SELECT 'rows' AS chk, listed, count(*)
  FROM public.published_maps
 WHERE unpublished_at IS NULL
 GROUP BY listed;
