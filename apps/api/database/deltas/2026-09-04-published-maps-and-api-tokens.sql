-- ════════════════════════════════════════════════════════════════════
-- 델타 — published_maps(무료 게시) + api_tokens(MCP 커넥터)  2026-09-04
--   근거: docs/04-extensions/publish/27-publish-share.md (PUBL)
--         docs/04-extensions/ai/mcp-connector.md §3
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 이미 돌고 있는 서버의 DB 에 그대로 붙여넣는다.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
--
-- **두 번 실행해도 안전하다** — IF NOT EXISTS · DROP POLICY IF EXISTS 만
-- 쓴다. 기존 데이터를 옮기지도 지우지도 않는다.
--
-- 적용 전에도 앱은 죽지 않는다. 표가 없으면 **그 기능만** 꺼지고,
-- 화면이 이유를 미리 말한다(`apps/api/src/common/table-ready.ts`).
--   · published_maps 없음 → [공개] 대화상자가 "아직 준비되지 않았습니다"
--   · api_tokens 없음     → MCP 토큰 화면이 `ready:false`
--
-- 적용 뒤 **재기동이 필요 없다** — 서버가 60초 안에 표를 다시 확인한다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 무료 게시 (PUBL-01~04) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.published_maps (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id         UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    publish_id     VARCHAR(20) UNIQUE NOT NULL,  -- URL slug (/p/{publish_id})
    storage_path   VARCHAR(500),
    published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unpublished_at TIMESTAMPTZ                   -- NULL = 지금 공개 중
);

CREATE INDEX IF NOT EXISTS idx_published_maps_publish_id
    ON public.published_maps(publish_id);

ALTER TABLE public.published_maps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "published maps are publicly readable" ON public.published_maps;
CREATE POLICY "published maps are publicly readable"
    ON public.published_maps FOR SELECT
    USING (unpublished_at IS NULL);

DROP POLICY IF EXISTS "owners can manage publish" ON public.published_maps;
CREATE POLICY "owners can manage publish"
    ON public.published_maps FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps
            WHERE maps.id = published_maps.map_id
              AND maps.owner_id = auth.uid()
        )
    );

-- ── MCP 커넥터 토큰 ───────────────────────────────────────────────────
-- 원문은 저장하지 않는다(sha256 해시만). 폐기는 revoked_at 을 채운다.
CREATE TABLE IF NOT EXISTS public.api_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name         VARCHAR(60) NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    prefix       VARCHAR(20) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_tokens_user_idx
    ON public.api_tokens (user_id, created_at DESC);

COMMIT;

-- ── 검증 — 이 네 줄이 전부 OK 여야 한다 ───────────────────────────────
SELECT 'published_maps 표 : ' ||
       CASE WHEN to_regclass('public.published_maps') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'published_maps 정책: ' || CASE WHEN count(*) = 2 THEN 'OK (2개)'
                                       ELSE 'NG (' || count(*) || '개 — 2개여야 합니다)' END
  FROM pg_policies WHERE schemaname='public' AND tablename='published_maps'
UNION ALL
SELECT 'api_tokens 표      : ' ||
       CASE WHEN to_regclass('public.api_tokens') IS NOT NULL THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'api_tokens 색인    : ' || CASE WHEN count(*) >= 1 THEN 'OK' ELSE 'MISSING' END
  FROM pg_indexes WHERE schemaname='public' AND tablename='api_tokens'
                    AND indexname='api_tokens_user_idx';
