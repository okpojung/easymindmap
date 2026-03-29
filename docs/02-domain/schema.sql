-- ============================================================
-- easymindmap — Database Schema
-- DB: Supabase PostgreSQL 16 (Self-hosted on ESXi VM-03)
-- 결정: 2026-03-27 Supabase Self-hosted 채택
-- ============================================================

-- ============================================================
-- 1. 사용자 (Supabase Auth 연동)
-- ============================================================
-- auth.users는 Supabase Auth가 자동 생성
-- public.users는 프로필 확장 테이블

CREATE TABLE public.users (
    id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name         VARCHAR(100),
    preferred_language   VARCHAR(10)  NOT NULL DEFAULT 'ko',
    default_layout_type  VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- auth.users 생성 시 public.users row 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. 워크스페이스
-- ============================================================
CREATE TABLE public.workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.workspace_members (
    workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL DEFAULT 'editor', -- 'owner' | 'editor' | 'viewer'
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- ============================================================
-- 3. 맵
-- ============================================================
CREATE TABLE public.maps (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id              UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    title                     VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    default_layout_type       VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    view_mode                 VARCHAR(20)  NOT NULL DEFAULT 'edit',  -- 'edit' | 'dashboard'
    refresh_interval_seconds  INT          NOT NULL DEFAULT 0,       -- 0: off
    current_version           INT          NOT NULL DEFAULT 0,
    deleted_at                TIMESTAMPTZ,  -- soft delete
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maps_owner_id ON public.maps(owner_id);
CREATE INDEX idx_maps_workspace_id ON public.maps(workspace_id);
CREATE INDEX idx_maps_deleted_at ON public.maps(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE public.map_revisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    version     INT  NOT NULL,
    patch_json  JSONB NOT NULL,
    client_id   VARCHAR(100),
    patch_id    VARCHAR(200) UNIQUE,  -- idempotency key
    created_by  UUID REFERENCES public.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_map_revisions_map_id ON public.map_revisions(map_id, version DESC);

-- ============================================================
-- 4. 노드
-- ============================================================
CREATE TABLE public.nodes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    parent_id        UUID REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- 콘텐츠
    text             TEXT NOT NULL DEFAULT '',
    note             TEXT,

    -- 트리 구조
    depth            INT  NOT NULL DEFAULT 0,
    order_index      INT  NOT NULL DEFAULT 0,

    -- 레이아웃
    layout_type      VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional',
    collapsed        BOOLEAN NOT NULL DEFAULT FALSE,

    -- layout_type은 radial/tree/hierarchy/process/freeform 외에
    -- kanban도 허용될 수 있음.
    -- kanban 사용 시 depth 규칙:
    --   0 = board
    --   1 = column
    --   2 = card
    --   3 이상 금지
    -- 현재는 별도 kanban_role 컬럼 없이 layout_type + depth 규칙으로 해석 가능하도록 설계
    
    -- 도형 & 스타일
    shape_type       VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',
    style_json       JSONB NOT NULL DEFAULT '{}',

    -- 노드 타입 (V3 대시보드 대비)
    node_type        VARCHAR(30) NOT NULL DEFAULT 'text',  -- 'text' | 'data-live'

    -- 다국어 번역 (V2 대비)
    text_lang        VARCHAR(20),      -- 작성 언어 코드 ('ko', 'en', 'ja')
    text_hash        VARCHAR(128),     -- SHA-256[:16], 번역 캐시 무효화 키

    -- 자유배치
    manual_position  JSONB,   -- { x: number, y: number }

    -- 캐시
    size_cache       JSONB,   -- { width: number, height: number }

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nodes_map_id ON public.nodes(map_id);
CREATE INDEX idx_nodes_parent_id ON public.nodes(parent_id);
CREATE INDEX idx_nodes_map_order ON public.nodes(map_id, order_index);

-- ============================================================
-- 5. 태그
-- ============================================================
CREATE TABLE public.tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(7)   NOT NULL DEFAULT '#888888',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, name)
);

CREATE TABLE public.node_tags (
    node_id     UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (node_id, tag_id)
);

-- ============================================================
-- 6. 노드 부가 정보
-- ============================================================
CREATE TABLE public.node_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.node_links (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id    UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    label      VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.node_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    storage_path    VARCHAR(500) NOT NULL,   -- Supabase Storage 경로
    filename        VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100),
    file_size_bytes INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.node_media (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
    storage_path    VARCHAR(500) NOT NULL,   -- Supabase Storage 경로
    media_type      VARCHAR(20) NOT NULL DEFAULT 'image',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. Export / Publish
-- ============================================================
CREATE TABLE public.exports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    user_id     UUID REFERENCES public.users(id),
    format      VARCHAR(20) NOT NULL,  -- 'markdown' | 'html'
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    storage_path VARCHAR(500),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.published_maps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    publish_id      VARCHAR(20) UNIQUE NOT NULL,  -- URL slug
    storage_path    VARCHAR(500),                 -- Supabase Storage 경로
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unpublished_at  TIMESTAMPTZ
);

CREATE INDEX idx_published_maps_publish_id ON public.published_maps(publish_id);

-- ============================================================
-- 8. AI
-- ============================================================
CREATE TABLE public.ai_jobs (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.users(id),
    map_id           UUID REFERENCES public.maps(id),
    job_type         VARCHAR(30) NOT NULL,   -- 'generate' | 'expand' | 'summarize'
    prompt           TEXT NOT NULL,
    result_markdown  TEXT,
    model            VARCHAR(100),
    tokens_used      INT,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. 번역 (V2)
-- ============================================================
CREATE TABLE public.node_translations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    target_lang       VARCHAR(20) NOT NULL,
    translated_text   TEXT NOT NULL,
    source_text_hash  VARCHAR(128) NOT NULL,
    model_version     VARCHAR(60),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, target_lang)
);

-- ============================================================
-- 10. 대시보드 필드 레지스트리 (V3)
-- ============================================================
CREATE TABLE public.field_registry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(50)  NOT NULL,
    field_key       VARCHAR(100) NOT NULL,
    label_ko        VARCHAR(200) NOT NULL,
    table_name      VARCHAR(100) NOT NULL,
    column_name     VARCHAR(200) NOT NULL,
    data_type       VARCHAR(50)  NOT NULL,
    is_editable     BOOLEAN NOT NULL DEFAULT TRUE,
    is_json_path    BOOLEAN NOT NULL DEFAULT FALSE,
    json_path       VARCHAR(200),
    display_order   INT NOT NULL DEFAULT 0,
    description     TEXT
);

-- ============================================================
-- 11. Row Level Security (RLS)
-- ============================================================

-- maps
ALTER TABLE public.maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own maps"
    ON public.maps FOR SELECT
    USING (auth.uid() = owner_id AND deleted_at IS NULL);

CREATE POLICY "users can insert own maps"
    ON public.maps FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "users can update own maps"
    ON public.maps FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "users can delete own maps"
    ON public.maps FOR DELETE
    USING (auth.uid() = owner_id);

-- nodes (맵 소유자만 접근)
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage nodes of own maps"
    ON public.nodes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps
            WHERE maps.id = nodes.map_id
              AND maps.owner_id = auth.uid()
        )
    );

-- published_maps (공개 읽기)
ALTER TABLE public.published_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "published maps are publicly readable"
    ON public.published_maps FOR SELECT
    USING (unpublished_at IS NULL);

CREATE POLICY "owners can manage publish"
    ON public.published_maps FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps
            WHERE maps.id = published_maps.map_id
              AND maps.owner_id = auth.uid()
        )
    );

-- ============================================================
-- 12. Supabase Realtime (V1 협업 대비)
-- ============================================================
-- nodes와 maps 테이블을 Realtime publication에 추가
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maps;

-- ============================================================
-- 13. Supabase Storage 버킷 (Supabase 대시보드 또는 마이그레이션)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('uploads',     'uploads',     false),
--   ('attachments', 'attachments', false),
--   ('exports',     'exports',     false),
--   ('published',   'published',   true),   -- 퍼블리시된 HTML은 공개
--   ('media',       'media',       false);
