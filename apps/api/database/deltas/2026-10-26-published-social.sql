-- 지식창고 설명문·태그·좋아요·댓글 (2026-10-26, 홈페이지 API 계약 v0.4 §4 · 단계 3).
--
--   published_maps.description      설명문 (500자까지, 없으면 NULL)
--   published_maps.tags             태그 (소문자 정규화, 10개까지 — 앱이 다듬는다)
--   published_maps.comments_enabled 게시자가 댓글을 받는가 (**기본 FALSE** — 넓어지는 쪽은 사람이 한 번 더 누른다)
--   published_map_likes             좋아요 (맵마다 회원 한 번)
--   published_map_comments          댓글 (지우기·숨기기는 표시만 — deleted_at · hidden_at)
--
-- 좋아요·댓글은 퍼블리싱 행이 아니라 **맵**에 붙는다 — 비공개로 내렸다 다시 열어도 같은 맵이다.
-- 다시 실행해도 안전하다(IF NOT EXISTS). 운영은 같은 내용을 검토된 마이그레이션 패키지로 적용한다.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.published_maps
    ADD COLUMN IF NOT EXISTS description TEXT
        CONSTRAINT published_maps_description_len CHECK (description IS NULL OR length(description) <= 500),
    ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'
        CONSTRAINT published_maps_tags_max CHECK (cardinality(tags) <= 10),
    ADD COLUMN IF NOT EXISTS comments_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- 태그 한 개로 찾는다 (`tag = ANY(tags)`)
CREATE INDEX IF NOT EXISTS idx_published_maps_tags ON public.published_maps USING gin (tags);

CREATE TABLE IF NOT EXISTS public.published_map_likes (
    map_id     UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (map_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_published_map_likes_user ON public.published_map_likes (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.published_map_comments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id     UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    author_id  UUID REFERENCES public.users(id) ON DELETE SET NULL,
    body       TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
    hidden_at  TIMESTAMPTZ,
    hidden_by  TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_published_map_comments_map_time ON public.published_map_comments (map_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_published_map_comments_author_time ON public.published_map_comments (author_id, created_at);

DO $acl$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['published_map_likes', 'published_map_comments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'emm_api') THEN
      IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = to_regclass('public.' || t) AND polname = 'emm_api_trusted_backend') THEN
        EXECUTE format('CREATE POLICY emm_api_trusted_backend ON public.%I FOR ALL TO emm_api USING (true) WITH CHECK (true)', t);
      END IF;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'emm_api') THEN
    -- 좋아요 취소는 행을 지운다(되돌릴 값이 없다). 댓글은 표시만 지운다 — 지우기 권한 없음
    GRANT SELECT, INSERT, DELETE ON public.published_map_likes TO emm_api;
    GRANT SELECT, INSERT, UPDATE ON public.published_map_comments TO emm_api;
  END IF;
END $acl$;

COMMIT;
