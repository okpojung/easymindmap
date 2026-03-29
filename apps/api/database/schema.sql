-- ============================================================
-- easymindmap — apps/api/database/schema.sql
-- 용도: 실제 DB 초기화 스크립트 (개발/테스트 환경용 단독 실행 가능)
-- 기준: docs/02-domain/schema.sql (설계 문서)와 동일 구조
-- DB : Supabase PostgreSQL 16 (Self-hosted, VM-03)
-- 작성: 2026-03-29
--
-- ※ 프로덕션 마이그레이션은 Supabase CLI를 사용하십시오.
--   npx supabase db push
-- ============================================================

-- ============================================================
-- 0. Extensions
-- ============================================================
-- ltree: 계층 경로(path) 기반 subtree 조회 최적화 (GIST 인덱스 활용)
-- gen_random_uuid()는 PostgreSQL 13+ 내장 → uuid-ossp 불필요
CREATE EXTENSION IF NOT EXISTS ltree;

-- ============================================================
-- 1. 사용자 (Supabase Auth 연동)
-- ============================================================
-- auth.users 는 Supabase Auth 가 자동 생성
-- public.users 는 프로필 확장 테이블

CREATE TABLE IF NOT EXISTS public.users (
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
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. 워크스페이스
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL DEFAULT 'editor',  -- 'owner' | 'editor' | 'viewer'
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- ============================================================
-- 3. 맵
-- ============================================================
CREATE TABLE IF NOT EXISTS public.maps (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id              UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    title                     VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    default_layout_type       VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    view_mode                 VARCHAR(20)  NOT NULL DEFAULT 'edit',  -- 'edit' | 'dashboard'
    refresh_interval_seconds  INT          NOT NULL DEFAULT 0,       -- 0: off
    current_version           INT          NOT NULL DEFAULT 0,
    deleted_at                TIMESTAMPTZ,  -- soft-delete: NULL = 활성
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maps_owner_id    ON public.maps(owner_id);
CREATE INDEX IF NOT EXISTS idx_maps_workspace_id ON public.maps(workspace_id);
CREATE INDEX IF NOT EXISTS idx_maps_deleted_at  ON public.maps(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.map_revisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    version     INT  NOT NULL,
    patch_json  JSONB NOT NULL,
    client_id   VARCHAR(100),
    patch_id    VARCHAR(200) UNIQUE,  -- idempotency key
    created_by  UUID REFERENCES public.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_revisions_map_id ON public.map_revisions(map_id, version DESC);

-- ============================================================
-- 4. 노드
-- ============================================================
-- ltree path 규칙:
--   루트 노드: 'root'
--   하위 노드: parent.path || 'n_' || left(replace(id::text, '-', ''), 8)
--   예: root.n_a1b2c3d4.n_e5f6a7b8
--
-- order_index 는 FLOAT (형제 중간 삽입 O(1), 주기적 재정규화)
-- pos_x / pos_y 컬럼 없음 — 좌표는 manual_position JSONB 단일 컬럼 사용
--   computed 좌표(computedX/Y)는 클라이언트 Layout Engine 에서 계산, DB 미저장
CREATE TABLE IF NOT EXISTS public.nodes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID NOT NULL REFERENCES public.maps(id)  ON DELETE CASCADE,
    parent_id        UUID             REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- 콘텐츠 (note 컬럼 없음: node_notes 테이블로 단일화)
    text             TEXT NOT NULL DEFAULT '',

    -- 트리 구조
    depth            INT    NOT NULL DEFAULT 0,
    order_index      FLOAT  NOT NULL DEFAULT 0.0,  -- FLOAT: 중간 삽입 O(1)
    path             LTREE  NOT NULL,               -- 예: root.n_a1b2c3d4

    -- 레이아웃 & 뷰
    layout_type      VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    collapsed        BOOLEAN      NOT NULL DEFAULT FALSE,

    -- 도형 & 스타일
    shape_type       VARCHAR(50)  NOT NULL DEFAULT 'rounded-rectangle',
    style_json       JSONB        NOT NULL DEFAULT '{}',

    -- 노드 타입 (V3 대시보드 대비)
    node_type        VARCHAR(30)  NOT NULL DEFAULT 'text',  -- 'text' | 'data-live'

    -- 다국어 (V2 대비)
    text_lang        VARCHAR(20),
    text_hash        VARCHAR(128),  -- SHA-256[:16], 번역 캐시 무효화 키

    -- 자유배치 좌표 (freeform layout 전용)
    -- { x: number, y: number } — 그 외 layout 에서는 NULL
    manual_position  JSONB,

    -- 렌더링 캐시 (서버 기록, 클라이언트 최적화 용도)
    size_cache       JSONB,   -- { width: number, height: number }

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 인덱스
CREATE INDEX IF NOT EXISTS idx_nodes_map_id    ON public.nodes(map_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON public.nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_map_order ON public.nodes(map_id, order_index);

-- ltree 인덱스
CREATE INDEX IF NOT EXISTS idx_nodes_path_gist  ON public.nodes USING GIST (path);   -- <@ subtree 조회
CREATE INDEX IF NOT EXISTS idx_nodes_path_btree ON public.nodes USING BTREE (path);  -- exact match / ORDER BY

-- ============================================================
-- 5. 태그
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(7)   NOT NULL DEFAULT '#888888',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS public.node_tags (
    node_id     UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES public.tags(id)  ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (node_id, tag_id)
);

-- ============================================================
-- 6. 노드 부가 정보
-- ============================================================
-- node_notes: 노드당 1건의 노트 (nodes.note 컬럼 없음 — 단일화)
CREATE TABLE IF NOT EXISTS public.node_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_links (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id    UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    url        TEXT NOT NULL,
    label      VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    storage_path    VARCHAR(500) NOT NULL,
    filename        VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100),
    file_size_bytes INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_media (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id      UUID NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
    storage_path VARCHAR(500) NOT NULL,
    media_type   VARCHAR(20) NOT NULL DEFAULT 'image',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. Export / Publish
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id       UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    user_id      UUID REFERENCES public.users(id),
    format       VARCHAR(20) NOT NULL,   -- 'markdown' | 'html'
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    storage_path VARCHAR(500),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.published_maps (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id         UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    publish_id     VARCHAR(20) UNIQUE NOT NULL,  -- URL slug (/p/{publish_id})
    storage_path   VARCHAR(500),
    published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unpublished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_published_maps_publish_id ON public.published_maps(publish_id);

-- ============================================================
-- 8. AI Jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_jobs (
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
CREATE TABLE IF NOT EXISTS public.node_translations (
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
CREATE TABLE IF NOT EXISTS public.field_registry (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type   VARCHAR(50)  NOT NULL,
    field_key     VARCHAR(100) NOT NULL,
    label_ko      VARCHAR(200) NOT NULL,
    table_name    VARCHAR(100) NOT NULL,
    column_name   VARCHAR(200) NOT NULL,
    data_type     VARCHAR(50)  NOT NULL,
    is_editable   BOOLEAN NOT NULL DEFAULT TRUE,
    is_json_path  BOOLEAN NOT NULL DEFAULT FALSE,
    json_path     VARCHAR(200),
    display_order INT NOT NULL DEFAULT 0,
    description   TEXT
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

-- 워크스페이스 멤버 맵 읽기 (V1 협업)
CREATE POLICY "workspace members can view maps"
    ON public.maps FOR SELECT
    USING (
        deleted_at IS NULL AND
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = maps.workspace_id
              AND wm.user_id = auth.uid()
        )
    );

-- 워크스페이스 editor/owner 맵 수정 (V1 협업)
CREATE POLICY "workspace editors can update maps"
    ON public.maps FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = maps.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('editor', 'owner')
        )
    );

-- nodes
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;

-- 맵 소유자
CREATE POLICY "map owners can manage nodes"
    ON public.nodes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps
            WHERE maps.id = nodes.map_id
              AND maps.owner_id = auth.uid()
        )
    );

-- 워크스페이스 editor/owner (쓰기 포함)
CREATE POLICY "workspace members can manage nodes"
    ON public.nodes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.maps m ON m.workspace_id = wm.workspace_id
            WHERE m.id = nodes.map_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('editor', 'owner')
        )
    );

-- 워크스페이스 viewer (읽기 전용)
CREATE POLICY "workspace viewers can read nodes"
    ON public.nodes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.maps m ON m.workspace_id = wm.workspace_id
            WHERE m.id = nodes.map_id
              AND wm.user_id = auth.uid()
              AND wm.role = 'viewer'
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
-- 12. 삭제 정책 메모
-- ============================================================
-- [맵] Soft-delete: deleted_at 설정 → 30일 후 배치로 hard-delete
--   복구: UPDATE maps SET deleted_at = NULL WHERE id = $1 (30일 이내)
--   자동 정리: DELETE FROM public.maps WHERE deleted_at < NOW() - INTERVAL '30 days';
--
-- [노드] ON DELETE CASCADE hard-delete
--   단일 노드 삭제는 클라이언트 Command 히스토리로 Undo 가능 (5~10초 창)
--   대규모 subtree 삭제 시 프론트엔드에서 확인 모달 표시 (자식 ≥ 3개)
--
-- 상세: docs/02-domain/node-hierarchy-storage-strategy.md 「삭제 정책 & Trash 메커니즘」

-- ============================================================
-- 13. Supabase Realtime (V1 협업)
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maps;

-- ============================================================
-- 14. Supabase Storage 버킷
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('uploads',     'uploads',     false),
--   ('attachments', 'attachments', false),
--   ('exports',     'exports',     false),
--   ('published',   'published',   true),   -- 퍼블리시 HTML은 공개
--   ('media',       'media',       false);
