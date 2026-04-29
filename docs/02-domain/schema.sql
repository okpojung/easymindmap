-- ============================================================
-- easymindmap — Database Schema (Clean Edition)
-- DB: Supabase PostgreSQL 16 (Self-hosted on ESXi VM-03)
-- Updated: 2026-04-17
--
-- 변경 이력:
-- 2026-04-17: 신규 완성본으로 전면 교체
--   - nodes.code_language 컬럼 추가 (NODE_CONTENT 정합성)
--   - node_type CHECK ('text'|'code'|'data-live') — 'code' 추가
--   - idx_nodes_text_fts GIN 전문 검색 인덱스 추가
--   - 누락 인덱스 추가 (workspace_members, node_tags, published_maps)
--   - 누락 CHECK 제약 추가 (maps, nodes, exports, ai_jobs 등)
--   - exports.status 'done'→'completed', 'error'→'failed' 통일
--   - ai_jobs FK ON DELETE 정책 추가
--   - WITH CHECK RLS 정책 보완
--   - COMMENT ON 추가 (NODE_CONTENT / NODE_RENDERING / PUBLISH_SHARE 정합)
--   - BEGIN/COMMIT 트랜잭션 래핑 추가
-- 2026-03-31: v3.3 협업맵 컬럼 추가
-- 2026-03-29: ltree extension 채택 (path 컬럼, GIST 인덱스)
-- 2026-03-27: Supabase Self-hosted 채택
--
-- 주의:
--   협업 테이블(map_collaborators, map_ownership_history 등)은
--   docs/02-domain/collaboration-schema.sql 참조 (별도 마이그레이션)
-- ============================================================

BEGIN;

-- ============================================================
-- 0. Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS ltree;

-- ============================================================
-- 1. 사용자 (Supabase Auth 연동)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id                       UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name             VARCHAR(100),
    preferred_language       VARCHAR(10)  NOT NULL DEFAULT 'ko',
    default_layout_type      VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    secondary_languages      VARCHAR(20)[] NOT NULL DEFAULT '{}',
    skip_english_translation BOOLEAN      NOT NULL DEFAULT TRUE,
    ui_preferences_json      JSONB        NOT NULL DEFAULT '{}'::jsonb,
    created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_secondary_languages_max
        CHECK (array_length(secondary_languages, 1) <= 3 OR secondary_languages = '{}')
);

COMMENT ON COLUMN public.users.ui_preferences_json IS
'UI 표시 환경설정. 예: { showTranslationIndicator: true, showTranslationOverrideIcon: true, showTagBadge: true }. 미설정 키는 기본값 true 적용.';

-- auth.users 생성 시 public.users row 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id) VALUES (NEW.id)
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
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
    workspace_id  UUID        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role          VARCHAR(20) NOT NULL DEFAULT 'editor',
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id),

    CONSTRAINT chk_workspace_member_role
        CHECK (role IN ('owner', 'editor', 'viewer'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
    ON public.workspace_members(user_id);

-- ============================================================
-- 3. 맵
-- ============================================================
CREATE TABLE IF NOT EXISTS public.maps (
    id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                  UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    workspace_id              UUID         REFERENCES public.workspaces(id) ON DELETE SET NULL,

    title                     VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    default_layout_type       VARCHAR(50)  NOT NULL DEFAULT 'radial-bidirectional',
    view_mode                 VARCHAR(20)  NOT NULL DEFAULT 'edit',
    refresh_interval_seconds  INT          NOT NULL DEFAULT 0,
    current_version           INT          NOT NULL DEFAULT 0,

    -- 협업맵 (v3.3)
    is_collaborative          BOOLEAN      NOT NULL DEFAULT FALSE,
    collab_owner_id           UUID         REFERENCES public.users(id),

    -- 다국어 번역 정책 (V2)
    translation_policy_json   JSONB        NULL DEFAULT NULL,

    deleted_at                TIMESTAMPTZ,
    created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_maps_default_layout_type
        CHECK (default_layout_type IN (
            'radial-bidirectional','radial-right','radial-left',
            'tree-right','tree-left','tree-down','tree-up',
            'hierarchy-right','hierarchy-left',
            'process-tree-right','process-tree-left',
            'process-tree-right-a','process-tree-right-b',
            'freeform','kanban'
        )),
    CONSTRAINT chk_maps_view_mode
        CHECK (view_mode IN ('edit', 'dashboard', 'kanban', 'wbs')),
    CONSTRAINT chk_maps_refresh_interval
        CHECK (refresh_interval_seconds >= 0)
);

COMMENT ON COLUMN public.maps.translation_policy_json IS
'맵별 번역 정책. NULL=사용자 기본 설정 사용. { skipLanguages: string[], skipEnglish: boolean|null }';
COMMENT ON COLUMN public.maps.is_collaborative IS
'active editor ≥ 1명이면 true. 모든 editor removed 시 false로 복귀.';
COMMENT ON COLUMN public.maps.collab_owner_id IS
'현재 맵 소유자 userId. 소유권 이양(transfer-ownership) 시 업데이트.';

CREATE INDEX IF NOT EXISTS idx_maps_owner_id     ON public.maps(owner_id);
CREATE INDEX IF NOT EXISTS idx_maps_workspace_id ON public.maps(workspace_id);
CREATE INDEX IF NOT EXISTS idx_maps_deleted_at   ON public.maps(deleted_at) WHERE deleted_at IS NULL;

-- ============================================================
-- 4. 맵 리비전 (Autosave 패치 로그)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.map_revisions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    version     INT         NOT NULL,
    patch_json  JSONB       NOT NULL,
    client_id   VARCHAR(100),
    patch_id    VARCHAR(200) UNIQUE,   -- idempotency key
    created_by  UUID        REFERENCES public.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_map_revision_version UNIQUE (map_id, version)
);

CREATE INDEX IF NOT EXISTS idx_map_revisions_map_id
    ON public.map_revisions(map_id, version DESC);

-- ============================================================
-- 5. 노드
-- ============================================================
CREATE TABLE IF NOT EXISTS public.nodes (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    parent_id        UUID        REFERENCES public.nodes(id) ON DELETE CASCADE,

    -- 콘텐츠 (NODE_CONTENT)
    text             TEXT        NOT NULL DEFAULT '',
    -- 긴 설명(note)은 node_notes 테이블로 분리 (1:1 optional)

    -- 트리 구조
    depth            INT         NOT NULL DEFAULT 0,
    order_index      FLOAT       NOT NULL DEFAULT 0.0,   -- 중간 삽입 O(1), 재정규화 주기적 실행
    path             LTREE       NOT NULL,                -- 예: 'root.n_a1b2c3d4.n_e5f6a7b8'

    -- 레이아웃
    layout_type      VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional',
    collapsed        BOOLEAN     NOT NULL DEFAULT FALSE,

    -- 도형 & 스타일
    shape_type       VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',
    style_json       JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- 노드 타입 (NODE_RENDERING 분기용)
    node_type        VARCHAR(30) NOT NULL DEFAULT 'text',
    code_language    VARCHAR(30) DEFAULT NULL,   -- code node용 언어 식별자 (bash, sql, python 등)

    -- 다국어 번역 (V2)
    text_lang             VARCHAR(20),
    text_hash             VARCHAR(128),
    translation_mode      VARCHAR(20) NOT NULL DEFAULT 'auto',
    translation_override  VARCHAR(10) DEFAULT NULL,
    author_preferred_language VARCHAR(20) DEFAULT NULL,

    -- 자유배치
    manual_position  JSONB,   -- { x: number, y: number }

    -- 캐시
    size_cache       JSONB,   -- { width: number, height: number }

    -- 협업 (v3.3)
    created_by       UUID        REFERENCES public.users(id),

    -- Redmine 연동 (V1 WBS)
    redmine_issue_id INTEGER     DEFAULT NULL,
    sync_status      VARCHAR(20) DEFAULT NULL,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_nodes_layout_type
        CHECK (layout_type IN (
            'radial-bidirectional','radial-right','radial-left',
            'tree-right','tree-left','tree-down','tree-up',
            'hierarchy-right','hierarchy-left',
            'process-tree-right','process-tree-left',
            'process-tree-right-a','process-tree-right-b',
            'freeform','kanban'
        )),
    CONSTRAINT chk_nodes_kanban_depth
        CHECK (layout_type <> 'kanban' OR depth BETWEEN 0 AND 2),
    CONSTRAINT chk_nodes_depth_non_negative
        CHECK (depth >= 0 AND depth <= 50),
    CONSTRAINT chk_nodes_node_type
        CHECK (node_type IN ('text', 'code', 'data-live')),
    CONSTRAINT chk_nodes_translation_mode
        CHECK (translation_mode IN ('auto', 'manual', 'skip')),
    CONSTRAINT chk_nodes_translation_override
        CHECK (translation_override IN ('force_on', 'force_off') OR translation_override IS NULL),
    CONSTRAINT chk_nodes_sync_status
        CHECK (sync_status IN ('synced', 'pending', 'error', 'failed') OR sync_status IS NULL)
);

COMMENT ON COLUMN public.maps.default_layout_type IS
'맵 생성 및 루트 노드의 기본 layoutType. 실제 노드별 layout은 nodes.layout_type에 저장되며, edge style은 layoutType에서 자동 파생된다.';

COMMENT ON COLUMN public.nodes.layout_type IS
'노드 및 subtree의 배치 방식. radial-*은 curve-line(Cubic Bezier), 그 외 layoutType은 orthogonal-line(직각선)으로 렌더링한다.';

COMMENT ON COLUMN public.nodes.manual_position IS
'Freeform 또는 수동 위치 보정 전용 좌표 { x, y }. Auto Layout의 computedX/computedY는 클라이언트 계산값이며 DB에 저장하지 않는다.';

COMMENT ON COLUMN public.nodes.text IS
'노드의 기본 본문 raw text. Markdown raw 저장을 기본으로 한다.';
COMMENT ON COLUMN public.nodes.node_type IS
'렌더링 분기용 타입. text=일반 텍스트 | code=코드 블록 | data-live=대시보드 데이터 연동';
COMMENT ON COLUMN public.nodes.code_language IS
'code node용 언어 식별자. 예: bash, sql, python, javascript';
COMMENT ON COLUMN public.nodes.translation_mode IS
'auto=자동번역(기본) | manual=수동번역만 | skip=번역완전제외';
COMMENT ON COLUMN public.nodes.created_by IS
'노드 최초 생성자 userId. 협업맵에서 수정/삭제 권한 판단 기준. 비협업 맵은 NULL 허용.';

CREATE INDEX IF NOT EXISTS idx_nodes_map_id      ON public.nodes(map_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent_id   ON public.nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_map_order   ON public.nodes(map_id, order_index);
CREATE INDEX IF NOT EXISTS idx_nodes_path_gist   ON public.nodes USING GIST (path);
CREATE INDEX IF NOT EXISTS idx_nodes_path_btree  ON public.nodes USING BTREE (path);
CREATE INDEX IF NOT EXISTS idx_nodes_redmine_issue ON public.nodes(redmine_issue_id)
    WHERE redmine_issue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_sync_status   ON public.nodes(map_id, sync_status)
    WHERE sync_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_nodes_translation_skip ON public.nodes(map_id, translation_mode)
    WHERE translation_mode = 'skip';
CREATE INDEX IF NOT EXISTS idx_nodes_text_fts ON public.nodes
    USING GIN (to_tsvector('simple', coalesce(text, '')));

-- ============================================================
-- 6. 태그
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tags (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name        VARCHAR(50)  NOT NULL,
    color       VARCHAR(7)   NOT NULL DEFAULT '#888888',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (owner_id, name)
);

CREATE TABLE IF NOT EXISTS public.node_tags (
    node_id     UUID        NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    tag_id      UUID        NOT NULL REFERENCES public.tags(id)  ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (node_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_node_tags_tag_id ON public.node_tags(tag_id);

-- ============================================================
-- 7. 노드 부가 정보
-- ============================================================
CREATE TABLE IF NOT EXISTS public.node_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID        NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
    content     TEXT        NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.node_notes IS
'NODE_CONTENT 확장 설명(note). 기본 본문은 nodes.text, 긴 설명은 node_notes.content로 분리한다.';

CREATE TABLE IF NOT EXISTS public.node_links (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID        NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    label       VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_attachments (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID        NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    storage_path    VARCHAR(500) NOT NULL,
    filename        VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(100),
    file_size_bytes INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.node_media (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id         UUID        NOT NULL UNIQUE REFERENCES public.nodes(id) ON DELETE CASCADE,
    storage_path    VARCHAR(500) NOT NULL,
    media_type      VARCHAR(20) NOT NULL DEFAULT 'image',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_node_media_type CHECK (media_type IN ('image', 'audio', 'video'))
);

-- ============================================================
-- 8. Export / Publish
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exports (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id       UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    user_id      UUID        REFERENCES public.users(id) ON DELETE SET NULL,
    format       VARCHAR(20) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    storage_path VARCHAR(500),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_exports_format CHECK (format IN ('markdown', 'html')),
    CONSTRAINT chk_exports_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.published_maps (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    publish_id      VARCHAR(20) UNIQUE NOT NULL,
    storage_path    VARCHAR(500),
    published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unpublished_at  TIMESTAMPTZ
);

COMMENT ON TABLE public.published_maps IS
'PUBLISH_SHARE MVP용 공개 링크. publish_id 기반 read-only public access. unpublished_at IS NULL = 현재 게시 중.';

CREATE INDEX IF NOT EXISTS idx_published_maps_publish_id ON public.published_maps(publish_id);
CREATE INDEX IF NOT EXISTS idx_published_maps_map_id     ON public.published_maps(map_id);

-- ============================================================
-- 9. AI
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_jobs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    map_id           UUID        REFERENCES public.maps(id) ON DELETE SET NULL,
    job_type         VARCHAR(30) NOT NULL,
    prompt           TEXT        NOT NULL,
    result_markdown  TEXT,
    model            VARCHAR(100),
    tokens_used      INT,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_ai_jobs_type   CHECK (job_type IN ('generate', 'expand', 'summarize')),
    CONSTRAINT chk_ai_jobs_status CHECK (status   IN ('pending', 'processing', 'completed', 'failed'))
);

-- ============================================================
-- 10. 번역 (V2)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.node_translations (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           UUID        NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    target_lang       VARCHAR(20) NOT NULL,
    translated_text   TEXT        NOT NULL,
    source_text_hash  VARCHAR(128) NOT NULL,
    model_version     VARCHAR(60),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_node_translations_node_id
    ON public.node_translations(node_id);

-- ============================================================
-- 11. 대시보드 필드 레지스트리 (V3)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_registry (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type     VARCHAR(50)  NOT NULL,
    field_key       VARCHAR(100) NOT NULL,
    label_ko        VARCHAR(200) NOT NULL,
    table_name      VARCHAR(100) NOT NULL,
    column_name     VARCHAR(200) NOT NULL,
    data_type       VARCHAR(50)  NOT NULL,
    is_editable     BOOLEAN      NOT NULL DEFAULT TRUE,
    is_json_path    BOOLEAN      NOT NULL DEFAULT FALSE,
    json_path       VARCHAR(200),
    display_order   INT          NOT NULL DEFAULT 0,
    description     TEXT
);

-- ============================================================
-- 12. WBS / 리소스 / Redmine (V1)
-- ============================================================

-- 12-1. node_schedule — WBS 일정/마일스톤/진척률
CREATE TABLE IF NOT EXISTS public.node_schedule (
    node_id       UUID     PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,
    start_date    DATE     DEFAULT NULL,
    end_date      DATE     DEFAULT NULL,
    is_milestone  BOOLEAN  NOT NULL DEFAULT FALSE,
    progress      SMALLINT DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_wbs_date_order
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_milestone_single_date
        CHECK (NOT is_milestone OR (start_date = end_date) OR end_date IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_node_schedule_dates
    ON public.node_schedule(start_date, end_date)
    WHERE start_date IS NOT NULL;

-- 12-2. node_resources — 리소스(사람) 할당 (WBS · Kanban 공통)
CREATE TABLE IF NOT EXISTS public.node_resources (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           UUID         NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    user_id           UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    redmine_user_id   INTEGER      DEFAULT NULL,
    redmine_user_name VARCHAR(100) DEFAULT NULL,
    role              VARCHAR(30)  NOT NULL DEFAULT 'assignee',
    allocated_hours   NUMERIC(6,2) DEFAULT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_node_resource_user
        UNIQUE NULLS NOT DISTINCT (node_id, user_id, role),
    CONSTRAINT uq_node_resource_redmine_user
        UNIQUE NULLS NOT DISTINCT (node_id, redmine_user_id, role),
    CONSTRAINT chk_resource_identity
        CHECK (user_id IS NOT NULL OR redmine_user_id IS NOT NULL),
    CONSTRAINT chk_node_resource_role
        CHECK (role IN ('assignee', 'reviewer', 'observer'))
);

CREATE INDEX IF NOT EXISTS idx_node_resources_node_id ON public.node_resources(node_id);
CREATE INDEX IF NOT EXISTS idx_node_resources_user_id ON public.node_resources(user_id)
    WHERE user_id IS NOT NULL;

-- 12-3. redmine_project_maps — 맵 ↔ Redmine 프로젝트 연결
CREATE TABLE IF NOT EXISTS public.redmine_project_maps (
    id                         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id                     UUID         NOT NULL UNIQUE REFERENCES public.maps(id) ON DELETE CASCADE,
    redmine_base_url           VARCHAR(500) NOT NULL,
    redmine_project_id         INTEGER      NOT NULL,
    redmine_project_identifier VARCHAR(100),
    api_key_encrypted          VARCHAR(500) NOT NULL,   -- AES-256-GCM 암호화 (절대 평문 보관 금지)
    sync_direction             VARCHAR(20)  NOT NULL DEFAULT 'bidirectional',
    auto_create_issues         BOOLEAN      NOT NULL DEFAULT TRUE,
    default_tracker_id         INTEGER      DEFAULT NULL,
    default_status_id          INTEGER      DEFAULT NULL,
    last_synced_at             TIMESTAMPTZ  DEFAULT NULL,
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_redmine_sync_direction
        CHECK (sync_direction IN ('pull_only', 'push_only', 'bidirectional'))
);

-- 12-4. redmine_sync_log — 동기화 이력
CREATE TABLE IF NOT EXISTS public.redmine_sync_log (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    node_id          UUID        REFERENCES public.nodes(id) ON DELETE SET NULL,
    direction        VARCHAR(10) NOT NULL,
    action           VARCHAR(20) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    redmine_issue_id INTEGER     DEFAULT NULL,
    http_status      SMALLINT    DEFAULT NULL,
    error_detail     TEXT        DEFAULT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_sync_log_direction CHECK (direction IN ('pull', 'push')),
    CONSTRAINT chk_sync_log_action    CHECK (action IN ('create', 'update', 'delete', 'full_sync')),
    CONSTRAINT chk_sync_log_status    CHECK (status IN ('success', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_sync_log_map_id  ON public.redmine_sync_log(map_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_node_id ON public.redmine_sync_log(node_id)
    WHERE node_id IS NOT NULL;

-- ============================================================
-- 13. Row Level Security (RLS)
-- ============================================================

ALTER TABLE public.maps               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_maps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_schedule      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_resources     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redmine_project_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redmine_sync_log   ENABLE ROW LEVEL SECURITY;

-- maps: 맵 소유자 정책
DROP POLICY IF EXISTS "users can view own maps"   ON public.maps;
DROP POLICY IF EXISTS "users can insert own maps" ON public.maps;
DROP POLICY IF EXISTS "users can update own maps" ON public.maps;
DROP POLICY IF EXISTS "users can delete own maps" ON public.maps;

CREATE POLICY "users can view own maps"
    ON public.maps FOR SELECT
    USING (auth.uid() = owner_id AND deleted_at IS NULL);

CREATE POLICY "users can insert own maps"
    ON public.maps FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "users can update own maps"
    ON public.maps FOR UPDATE
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "users can delete own maps"
    ON public.maps FOR DELETE
    USING (auth.uid() = owner_id);

-- maps: 워크스페이스 멤버 정책
DROP POLICY IF EXISTS "workspace members can view maps"    ON public.maps;
DROP POLICY IF EXISTS "workspace editors can update maps"  ON public.maps;

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

CREATE POLICY "workspace editors can update maps"
    ON public.maps FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = maps.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('editor', 'owner')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            WHERE wm.workspace_id = maps.workspace_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('editor', 'owner')
        )
    );

-- nodes
DROP POLICY IF EXISTS "map owners can manage nodes"       ON public.nodes;
DROP POLICY IF EXISTS "workspace members can manage nodes" ON public.nodes;
DROP POLICY IF EXISTS "workspace viewers can read nodes"  ON public.nodes;

CREATE POLICY "map owners can manage nodes"
    ON public.nodes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = nodes.map_id AND m.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = nodes.map_id AND m.owner_id = auth.uid()
        )
    );

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
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.workspace_members wm
            JOIN public.maps m ON m.workspace_id = wm.workspace_id
            WHERE m.id = nodes.map_id
              AND wm.user_id = auth.uid()
              AND wm.role IN ('editor', 'owner')
        )
    );

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

-- published_maps
DROP POLICY IF EXISTS "published maps are publicly readable" ON public.published_maps;
DROP POLICY IF EXISTS "owners can manage publish"            ON public.published_maps;

CREATE POLICY "published maps are publicly readable"
    ON public.published_maps FOR SELECT
    USING (unpublished_at IS NULL);

CREATE POLICY "owners can manage publish"
    ON public.published_maps FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = published_maps.map_id AND m.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = published_maps.map_id AND m.owner_id = auth.uid()
        )
    );

-- node_schedule
DROP POLICY IF EXISTS "map owners manage node_schedule" ON public.node_schedule;

CREATE POLICY "map owners manage node_schedule"
    ON public.node_schedule FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.nodes n
            JOIN public.maps m ON m.id = n.map_id
            WHERE n.id = node_schedule.node_id AND m.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.nodes n
            JOIN public.maps m ON m.id = n.map_id
            WHERE n.id = node_schedule.node_id AND m.owner_id = auth.uid()
        )
    );

-- node_resources
DROP POLICY IF EXISTS "map owners manage node_resources" ON public.node_resources;

CREATE POLICY "map owners manage node_resources"
    ON public.node_resources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.nodes n
            JOIN public.maps m ON m.id = n.map_id
            WHERE n.id = node_resources.node_id AND m.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.nodes n
            JOIN public.maps m ON m.id = n.map_id
            WHERE n.id = node_resources.node_id AND m.owner_id = auth.uid()
        )
    );

-- redmine_project_maps
DROP POLICY IF EXISTS "map owners manage redmine_project_maps" ON public.redmine_project_maps;

CREATE POLICY "map owners manage redmine_project_maps"
    ON public.redmine_project_maps FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = redmine_project_maps.map_id AND m.owner_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = redmine_project_maps.map_id AND m.owner_id = auth.uid()
        )
    );

-- redmine_sync_log
DROP POLICY IF EXISTS "map owners read sync_log" ON public.redmine_sync_log;

CREATE POLICY "map owners read sync_log"
    ON public.redmine_sync_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = redmine_sync_log.map_id AND m.owner_id = auth.uid()
        )
    );

-- ============================================================
-- 14. 삭제 정책 (Deletion Policy)
-- ============================================================
-- [맵 삭제] Soft-delete (deleted_at 설정)
--   - maps.deleted_at IS NOT NULL → 사용자에게 숨김
--   - 30일 경과 후 BullMQ Worker 배치 잡에서 hard-delete
--   - 복구: deleted_at = NULL 설정 (30일 이내)
--
-- [노드 삭제] Hard-delete (ON DELETE CASCADE)
--   - 부모 노드 삭제 시 하위 노드 자동 cascade hard-delete
--   - 단일 노드 삭제는 클라이언트 Command 히스토리로 Undo 가능 (5–10초 창)
--   - subtree 삭제 시 경고 모달 표시 (자식 3개 이상인 경우)
--
-- 자세한 내용: docs/02-domain/node-hierarchy-storage-strategy.md

-- 30일 경과 맵 삭제 배치 (BullMQ Worker에서 실행):
-- DELETE FROM public.maps WHERE deleted_at < NOW() - INTERVAL '30 days';

-- ============================================================
-- 15. Supabase Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maps;

-- ============================================================
-- 16. Supabase Storage 버킷 (대시보드 또는 마이그레이션으로 실행)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('uploads',     'uploads',     false),
--   ('attachments', 'attachments', false),
--   ('exports',     'exports',     false),
--   ('published',   'published',   true),   -- 퍼블리시된 HTML은 공개
--   ('media',       'media',       false);

-- ============================================================
-- 협업 관련 테이블은 별도 마이그레이션:
--   docs/02-domain/collaboration-schema.sql
--   (map_collaborators, map_ownership_history, node_threads, chat_messages 등)
-- ============================================================

COMMIT;
