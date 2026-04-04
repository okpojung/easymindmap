-- ============================================================
-- easymindmap — Database Schema
-- DB: Supabase PostgreSQL 16 (Self-hosted on ESXi VM-03)
-- 결정: 2026-03-27 Supabase Self-hosted 채택
-- 결정: 2026-03-29 ltree extension 채택 (path 컬럼, GIST 인덱스)
-- ============================================================

-- ============================================================
-- 0. Extensions
-- ============================================================
-- ltree: 계층 경로(path) 기반 subtree 조회 최적화
-- Supabase Self-hosted PostgreSQL 16에서 기본 제공
CREATE EXTENSION IF NOT EXISTS ltree;

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
    view_mode                 VARCHAR(20)  NOT NULL DEFAULT 'edit',  -- 'edit' | 'dashboard' | 'kanban' | 'wbs'
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
    -- note 컬럼 없음: 노트는 node_notes 테이블로 단일화 (Issue #8)

    -- 트리 구조
    depth            INT    NOT NULL DEFAULT 0,
    order_index      FLOAT  NOT NULL DEFAULT 0.0,   -- FLOAT: 중간 삽입 O(1), 재정규화 주기적 실행
    path             LTREE  NOT NULL,                -- ltree 계층 경로 (예: 'root.n_a1b2c3d4.n_e5f6a7b8')

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

    -- Redmine 연동 (V1 WBS)
    redmine_issue_id INTEGER     DEFAULT NULL,
    sync_status      VARCHAR(20) DEFAULT NULL
        CHECK (sync_status IN ('synced', 'pending', 'error', 'failed')),

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_nodes_map_id    ON public.nodes(map_id);
CREATE INDEX idx_nodes_parent_id ON public.nodes(parent_id);
CREATE INDEX idx_nodes_map_order ON public.nodes(map_id, order_index);
-- ltree 인덱스
CREATE INDEX idx_nodes_path_gist  ON public.nodes USING GIST (path);   -- subtree <@ 조회 최적화
CREATE INDEX idx_nodes_path_btree ON public.nodes USING BTREE (path);  -- exact match / ORDER BY 최적화
-- Redmine 연동 인덱스 (V1 WBS)
CREATE INDEX idx_nodes_redmine_issue ON public.nodes(redmine_issue_id)
    WHERE redmine_issue_id IS NOT NULL;
CREATE INDEX idx_nodes_sync_status   ON public.nodes(map_id, sync_status)
    WHERE sync_status IS NOT NULL;

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

-- 맵 소유자 정책
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

-- 워크스페이스 멤버 맵 읽기 (V1 협업 대비)
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

-- 워크스페이스 editor/owner 멤버 맵 수정
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

-- nodes (맵 소유자 + 워크스페이스 멤버 접근 허용)
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

-- 워크스페이스 멤버 (V1 협업 대비): editor/owner 역할만 쓰기 가능
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

-- 워크스페이스 멤버 (viewer): 읽기만 가능
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
-- 12. 삭제 정책 (Deletion Policy)
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
--             「삭제 정책 & Trash 메커니즘」 섹션 참조

-- 30일 경과 맵 삭제 배치 (pg_cron 또는 BullMQ Worker에서 실행)
-- DELETE FROM public.maps WHERE deleted_at < NOW() - INTERVAL '30 days';

-- ============================================================
-- 13. Supabase Realtime (V1 협업 대비)
-- ============================================================
-- nodes와 maps 테이블을 Realtime publication에 추가
ALTER PUBLICATION supabase_realtime ADD TABLE public.nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maps;

-- ============================================================
-- 14. Supabase Storage 버킷 (Supabase 대시보드 또는 마이그레이션)
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('uploads',     'uploads',     false),
--   ('attachments', 'attachments', false),
--   ('exports',     'exports',     false),
--   ('published',   'published',   true),   -- 퍼블리시된 HTML은 공개
--   ('media',       'media',       false);

-- ============================================================
-- V2: 다국어 번역 기능 스키마 확장 (multilingual-translation.md v3.0)
-- ============================================================

-- 1. users 테이블: 언어 설정 확장
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS secondary_languages
    VARCHAR(20)[]  NOT NULL DEFAULT '{}',
    -- 2차 언어 배열, 최대 3개 (예: '{ja,zh}')\n    -- translation_mode='skip' 자동 결정에 사용

  ADD COLUMN IF NOT EXISTS skip_english_translation
    BOOLEAN  NOT NULL DEFAULT TRUE;
    -- true: 영어 텍스트 번역 생략 (기술 용어, 브랜드명 등)
    -- false: 영어도 번역 대상으로 처리

ALTER TABLE public.users
  ADD CONSTRAINT chk_secondary_languages_max
    CHECK (array_length(secondary_languages, 1) <= 3
           OR secondary_languages = '{}');

-- [NODE-15 신규] users 테이블: UI 표시 환경설정 추가
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ui_preferences_json
    JSONB  NOT NULL DEFAULT '{}'::jsonb;
    -- 인디케이터 등 클라이언트 UI 표시 설정을 서버에 영속
    -- 구조 (UiPreferences):
    --   { "showTranslationIndicator": true,
    --     "showTranslationOverrideIcon": true,
    --     "showTagBadge": true }
    -- 필드 누락 시 기본값(true) 적용

COMMENT ON COLUMN public.users.ui_preferences_json
  IS 'UI 표시 환경설정. showTranslationIndicator(bool), showTranslationOverrideIcon(bool), showTagBadge(bool). 미설정 키는 기본값 true 적용.';

-- 2. maps 테이블: 맵별 번역 정책 추가
ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS translation_policy_json
    JSONB  NULL  DEFAULT NULL;
    -- NULL: 사용자 기본 설정 따름
    -- 구조: { "skipLanguages": ["ja", "zh"], "skipEnglish": true }
    -- skipEnglish: null이면 사용자 설정 따름

COMMENT ON COLUMN public.maps.translation_policy_json
  IS '맵별 번역 정책. NULL=사용자 기본 설정 사용. { skipLanguages: string[], skipEnglish: boolean|null }';

-- 3. nodes 테이블: 번역 제어 필드 추가
ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS translation_mode
    VARCHAR(10)  NOT NULL DEFAULT 'auto',
    -- 'auto': 열람자 언어에 맞춰 자동 번역 (기본)
    -- 'skip': 모든 열람자에게 원문 표시 (저장 시 서버가 자동 결정)

  ADD COLUMN IF NOT EXISTS translation_override
    VARCHAR(10)  NULL  DEFAULT NULL,
    -- NULL: 자동 정책 적용 (기본)
    -- 'force_on': 강제 번역 (skip 설정도 무시)
    -- 'force_off': 강제 번역 금지 (모든 열람자에게 원문)

  ADD COLUMN IF NOT EXISTS author_preferred_language
    VARCHAR(20)  NULL;
    -- 노드 작성 시점의 작성자 기본 언어 스냅샷 (예: 'ko')
    -- 작성자가 나중에 언어 설정 변경해도 기존 노드 translation_mode에 영향 없도록 보존

ALTER TABLE public.nodes
  ADD CONSTRAINT chk_translation_mode
    CHECK (translation_mode IN ('auto', 'skip')),
  ADD CONSTRAINT chk_translation_override
    CHECK (translation_override IN ('force_on', 'force_off')
           OR translation_override IS NULL);

-- nodes 번역 skip 조회 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_nodes_translation_skip
  ON public.nodes (map_id, translation_mode)
  WHERE translation_mode = 'skip';
-- 맵 로딩 시 번역 필요 여부 판단 쿼리 가속

-- 4. node_translations 인덱스 추가 (테이블은 섹션 9에서 이미 생성됨)
CREATE INDEX IF NOT EXISTS idx_node_translations_node_id
  ON public.node_translations (node_id);

-- ============================================================
-- 15. WBS 모드 / 리소스 할당 / Redmine 연동 (V1)
-- ============================================================

-- 15-1. node_schedule — WBS 일정/마일스톤/진척률 (1:1 optional)
CREATE TABLE public.node_schedule (
    node_id       UUID     PRIMARY KEY REFERENCES public.nodes(id) ON DELETE CASCADE,
    start_date    DATE     DEFAULT NULL,
    end_date      DATE     DEFAULT NULL,
    is_milestone  BOOLEAN  NOT NULL DEFAULT FALSE,
    progress      SMALLINT DEFAULT 0
                  CHECK (progress BETWEEN 0 AND 100),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_wbs_date_order CHECK (
        end_date IS NULL OR start_date IS NULL
        OR end_date >= start_date
    ),
    CONSTRAINT chk_milestone_single_date CHECK (
        NOT is_milestone
        OR (start_date = end_date)
        OR end_date IS NULL
    )
);

CREATE INDEX idx_node_schedule_dates
    ON public.node_schedule(start_date, end_date)
    WHERE start_date IS NOT NULL;

-- 15-2. node_resources — 리소스(사람) 할당 (WBS · Kanban 공통, 1:N)
CREATE TABLE public.node_resources (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           UUID         NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    user_id           UUID         REFERENCES public.users(id) ON DELETE SET NULL,
    redmine_user_id   INTEGER      DEFAULT NULL,
    redmine_user_name VARCHAR(100) DEFAULT NULL,
    role              VARCHAR(30)  NOT NULL DEFAULT 'assignee',
    -- 'assignee' | 'reviewer' | 'observer'
    allocated_hours   NUMERIC(6,2) DEFAULT NULL,  -- WBS 전용, Kanban은 NULL
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_node_resource_user
        UNIQUE NULLS NOT DISTINCT (node_id, user_id, role),
    CONSTRAINT uq_node_resource_redmine_user
        UNIQUE NULLS NOT DISTINCT (node_id, redmine_user_id, role),
    CONSTRAINT chk_resource_identity CHECK (
        user_id IS NOT NULL OR redmine_user_id IS NOT NULL
    )
);

CREATE INDEX idx_node_resources_node_id ON public.node_resources(node_id);
CREATE INDEX idx_node_resources_user_id ON public.node_resources(user_id)
    WHERE user_id IS NOT NULL;

-- 15-3. redmine_project_maps — 맵 ↔ Redmine 프로젝트 연결 (1:0..1)
CREATE TABLE public.redmine_project_maps (
    id                         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id                     UUID         NOT NULL UNIQUE REFERENCES public.maps(id) ON DELETE CASCADE,
    redmine_base_url           VARCHAR(500) NOT NULL,
    redmine_project_id         INTEGER      NOT NULL,
    redmine_project_identifier VARCHAR(100),
    api_key_encrypted          VARCHAR(500) NOT NULL,  -- AES-256-GCM 암호화 (절대 평문 보관 금지)
    sync_direction             VARCHAR(20)  NOT NULL DEFAULT 'bidirectional',
    -- 'pull_only' | 'push_only' | 'bidirectional'
    auto_create_issues         BOOLEAN      NOT NULL DEFAULT TRUE,
    default_tracker_id         INTEGER      DEFAULT NULL,
    default_status_id          INTEGER      DEFAULT NULL,
    last_synced_at             TIMESTAMPTZ  DEFAULT NULL,
    created_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 15-4. redmine_sync_log — 동기화 이력
CREATE TABLE public.redmine_sync_log (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id           UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    node_id          UUID        REFERENCES public.nodes(id) ON DELETE SET NULL,
    direction        VARCHAR(10) NOT NULL,   -- 'pull' | 'push'
    action           VARCHAR(20) NOT NULL,   -- 'create' | 'update' | 'delete' | 'full_sync'
    status           VARCHAR(20) NOT NULL,   -- 'success' | 'failed'
    redmine_issue_id INTEGER     DEFAULT NULL,
    http_status      SMALLINT    DEFAULT NULL,
    error_detail     TEXT        DEFAULT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_log_map_id  ON public.redmine_sync_log(map_id, created_at DESC);
CREATE INDEX idx_sync_log_node_id ON public.redmine_sync_log(node_id)
    WHERE node_id IS NOT NULL;

-- 15-5. RLS for WBS/Redmine tables
ALTER TABLE public.node_schedule       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_resources      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redmine_project_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redmine_sync_log    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "map owners manage node_schedule"
    ON public.node_schedule FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.nodes n
            JOIN public.maps m ON m.id = n.map_id
            WHERE n.id = node_schedule.node_id
              AND m.owner_id = auth.uid()
        )
    );

CREATE POLICY "map owners manage node_resources"
    ON public.node_resources FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.nodes n
            JOIN public.maps m ON m.id = n.map_id
            WHERE n.id = node_resources.node_id
              AND m.owner_id = auth.uid()
        )
    );

CREATE POLICY "map owners manage redmine_project_maps"
    ON public.redmine_project_maps FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps
            WHERE maps.id = redmine_project_maps.map_id
              AND maps.owner_id = auth.uid()
        )
    );

CREATE POLICY "map owners read sync_log"
    ON public.redmine_sync_log FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.maps
            WHERE maps.id = redmine_sync_log.map_id
              AND maps.owner_id = auth.uid()
        )
    );
