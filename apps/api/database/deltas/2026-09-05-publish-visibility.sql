-- ════════════════════════════════════════════════════════════════════
-- 델타 — 퍼블리싱 상태(비공개·무료공개·유료공개)  2026-09-05
--   근거: docs/04-extensions/publish/27-publish-share.md §6.4
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 이미 돌고 있는 서버의 DB 에 그대로 붙여넣는다.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
--
-- **두 번 실행해도 안전하다** — ADD COLUMN IF NOT EXISTS ·
-- DROP CONSTRAINT/POLICY IF EXISTS 만 쓴다.
-- **지우는 것이 없다** — 칸 하나를 더할 뿐이고 기존 행은 전부
-- `visibility='public'`(지금까지의 동작 = 무료공개)이 된다.
--
-- 적용 전에도 앱은 죽지 않는다 — 칸이 없으면 서버가 **모두 무료공개로**
-- 보고 상태 전환 기능만 꺼진다(`publish.service.ts` 의 hasVisibility).
--
-- 적용 뒤 **재기동이 필요 없다** — 서버가 60초 안에 다시 확인한다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.published_maps
    ADD COLUMN IF NOT EXISTS visibility VARCHAR(10) NOT NULL DEFAULT 'public';

ALTER TABLE public.published_maps
    DROP CONSTRAINT IF EXISTS published_maps_visibility_check;
ALTER TABLE public.published_maps
    ADD CONSTRAINT published_maps_visibility_check
    CHECK (visibility IN ('private', 'public', 'paid'));

-- 익명 읽기는 **무료공개만** — 보관(비공개)은 남에게 열지 않는다
DROP POLICY IF EXISTS "published maps are publicly readable" ON public.published_maps;
CREATE POLICY "published maps are publicly readable"
    ON public.published_maps FOR SELECT
    USING (unpublished_at IS NULL AND visibility = 'public');

COMMIT;

-- ── 검증 ────────────────────────────────────────────────────────────
--   기대: visibility 칸 1행 · CHECK 제약 1행 · 상태별 집계
SELECT 'column' AS chk, column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'published_maps'
   AND column_name = 'visibility';

SELECT 'check' AS chk, conname
  FROM pg_constraint
 WHERE conrelid = 'public.published_maps'::regclass
   AND conname = 'published_maps_visibility_check';

SELECT 'rows' AS chk, visibility, count(*)
  FROM public.published_maps
 WHERE unpublished_at IS NULL
 GROUP BY visibility;
