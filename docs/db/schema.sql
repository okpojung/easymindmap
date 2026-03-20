-- =============================================================
-- easymindmap PostgreSQL Schema
-- Version: v1.0
-- DB: PostgreSQL 16+
-- =============================================================

-- ▶ Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================
-- 1. USERS
-- =============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   TEXT NULL,                         -- OAuth 사용 시 NULL 가능
    display_name    VARCHAR(120) NOT NULL,
    locale          VARCHAR(20)  NOT NULL DEFAULT 'ko',
    timezone        VARCHAR(50)  NOT NULL DEFAULT 'Asia/Seoul',
    avatar_url      TEXT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active / suspended / deleted
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 2. WORKSPACES
-- =============================================================
CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(150) UNIQUE,
    owner_id    UUID NOT NULL REFERENCES users(id),
    plan        VARCHAR(30)  NOT NULL DEFAULT 'free',    -- free / pro / team / enterprise
    status      VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 3. WORKSPACE_MEMBERS
-- =============================================================
CREATE TABLE workspace_members (
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role          VARCHAR(30)  NOT NULL DEFAULT 'member',  -- owner / admin / member / viewer
    joined_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, user_id)
);

-- =============================================================
-- 4. MAPS
-- =============================================================
CREATE TABLE maps (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title                    VARCHAR(255) NOT NULL,
    description              TEXT NULL,

    root_node_id             UUID NULL,                            -- 맵 생성 후 설정
    default_layout_type      VARCHAR(50) NOT NULL DEFAULT 'radial-bidirectional',
    edge_policy              VARCHAR(30) NOT NULL DEFAULT 'layout-based',

    -- Dashboard 모드 (V3)
    view_mode                VARCHAR(20) NOT NULL DEFAULT 'edit',  -- edit / dashboard
    refresh_interval_seconds INT         NOT NULL DEFAULT 0,       -- 0 = off, 단위: 초

    theme_id                 VARCHAR(80) NULL,
    is_archived              BOOLEAN     NOT NULL DEFAULT FALSE,

    created_by               UUID NOT NULL REFERENCES users(id),
    updated_by               UUID NOT NULL REFERENCES users(id),
    current_version          BIGINT      NOT NULL DEFAULT 1,
    last_saved_at            TIMESTAMPTZ NULL,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 5. NODES  (핵심 테이블)
-- =============================================================
CREATE TABLE nodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    parent_id       UUID NULL REFERENCES nodes(id) ON DELETE CASCADE,

    -- 노드 타입
    -- 'text'      : 일반 텍스트 노드 (기본)
    -- 'data-live' : 외부에서 text 값이 갱신되는 대시보드 노드 (V3)
    -- 'formula'   : 다른 노드 참조 계산 노드 (V3 이후)
    node_type       VARCHAR(30) NOT NULL DEFAULT 'text',

    -- V3 대비 예약 컬럼 (현재는 NULL, data-live 노드에서 사용)
    data_source     JSONB NULL,     -- { "type": "api", "url": "/api/sales" } 등
    refresh_policy  VARCHAR(20) NULL, -- 'polling' | 'push' | 'manual'

    -- 텍스트 / 번역
    text            TEXT        NOT NULL DEFAULT '',
    text_lang       VARCHAR(20) NULL,                  -- 작성 언어 (ex: 'ko', 'en', 'ja')
    text_hash       VARCHAR(128) NULL,                 -- SHA-256 앞 16자 (번역 캐시 키)

    -- 레이아웃
    layout_type     VARCHAR(50) NULL,                  -- NULL이면 부모/맵 기본값 상속
    shape_type      VARCHAR(50) NOT NULL DEFAULT 'rounded-rectangle',

    -- 스타일 (NULL이면 테마 기본값 상속)
    fill_color      VARCHAR(20) NULL,
    border_color    VARCHAR(20) NULL,
    text_color      VARCHAR(20) NULL,
    font_family     VARCHAR(100) NULL,
    font_size_mode  VARCHAR(30) NOT NULL DEFAULT 'inherit-level-rule',
    font_size       NUMERIC(8,2) NULL,
    font_weight     INT NULL,

    -- 상태
    collapsed       BOOLEAN NOT NULL DEFAULT FALSE,

    -- 위치 (freeform 전용)
    manual_x        NUMERIC(14,2) NULL,
    manual_y        NUMERIC(14,2) NULL,
    position_mode   VARCHAR(20) NOT NULL DEFAULT 'auto',  -- auto / manual

    -- 스타일 상속
    inherit_style_from_parent  BOOLEAN NOT NULL DEFAULT TRUE,
    inherit_shape_from_parent  BOOLEAN NOT NULL DEFAULT TRUE,

    -- Indicator 요약 (렌더링 최적화용 캐시)
    has_note        BOOLEAN NOT NULL DEFAULT FALSE,
    link_count      INT     NOT NULL DEFAULT 0,
    attachment_count INT    NOT NULL DEFAULT 0,
    has_media       BOOLEAN NOT NULL DEFAULT FALSE,
    tag_count       INT     NOT NULL DEFAULT 0,

    created_by      UUID NOT NULL REFERENCES users(id),
    updated_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 6. NODE_ORDER  (형제 노드 순서)
-- =============================================================
CREATE TABLE node_order (
    node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    parent_id   UUID NULL,
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    sort_order  NUMERIC(14,4) NOT NULL,
    PRIMARY KEY (node_id)
);

-- =============================================================
-- 7. EDGES  (확장 연결선, 향후 커스텀 edge용)
-- =============================================================
CREATE TABLE edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    source_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type       VARCHAR(30) NOT NULL DEFAULT 'tree-line',  -- tree-line / curve-line / custom
    label           TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 8. TAGS
-- =============================================================
CREATE TABLE tags (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name             VARCHAR(100) NOT NULL,
    normalized_name  VARCHAR(100) NOT NULL,
    color            VARCHAR(20) NULL,
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, normalized_name)
);

-- =============================================================
-- 9. NODE_TAGS
-- =============================================================
CREATE TABLE node_tags (
    node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (node_id, tag_id)
);

-- =============================================================
-- 10. NODE_NOTES  (1:1)
-- =============================================================
CREATE TABLE node_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    created_by  UUID NOT NULL REFERENCES users(id),
    updated_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 11. NODE_LINKS  (1:N)
-- =============================================================
CREATE TABLE node_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    title       VARCHAR(255) NULL,
    url         TEXT NOT NULL,
    sort_order  INT  NOT NULL DEFAULT 0,
    created_by  UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 12. NODE_ATTACHMENTS  (1:N)
-- =============================================================
CREATE TABLE node_attachments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id        UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    storage_key    TEXT NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(120) NOT NULL,
    file_size      BIGINT NOT NULL,
    created_by     UUID NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 13. NODE_MEDIA  (1:1, 노드 배경이미지)
-- =============================================================
CREATE TABLE node_media (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id        UUID NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    storage_key    TEXT NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(120) NOT NULL,
    file_size      BIGINT NOT NULL,
    created_by     UUID NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 14. MAP_REVISIONS  (서버 버전 히스토리)
-- =============================================================
-- 주의: Undo/Redo와 다름
--   Undo/Redo  = 클라이언트 편집 UX용
--   Revision   = 서버 영속 버전 / 감사 / Diff Viewer용
CREATE TABLE map_revisions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id               UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    version              BIGINT NOT NULL,
    actor_id             UUID NOT NULL REFERENCES users(id),
    summary              VARCHAR(255) NULL,
    patch_json           JSONB NOT NULL,
    inverse_patch_json   JSONB NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (map_id, version)
);

-- =============================================================
-- 15. MAP_PERMISSIONS  (공유 권한)
-- =============================================================
CREATE TABLE map_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id     UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(30) NOT NULL DEFAULT 'viewer',  -- editor / commenter / viewer
    share_token VARCHAR(120) NULL UNIQUE,               -- 링크 공유용
    expires_at  TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 16. EXPORTS
-- =============================================================
CREATE TABLE exports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    requested_by    UUID NOT NULL REFERENCES users(id),
    export_type     VARCHAR(30) NOT NULL,   -- markdown / html / snapshot
    status          VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued / processing / completed / failed
    storage_key     TEXT NULL,
    error_message   TEXT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ NULL
);

-- =============================================================
-- 17. PUBLISHED_MAPS
-- =============================================================
CREATE TABLE published_maps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id        UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    published_by  UUID NOT NULL REFERENCES users(id),
    slug          VARCHAR(255) NOT NULL UNIQUE,
    visibility    VARCHAR(20) NOT NULL DEFAULT 'public',   -- public / unlisted / private
    storage_key   TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 18. AI_JOBS
-- =============================================================
CREATE TABLE ai_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id        UUID NULL REFERENCES maps(id) ON DELETE CASCADE,
    node_id       UUID NULL REFERENCES nodes(id) ON DELETE CASCADE,
    requested_by  UUID NOT NULL REFERENCES users(id),
    job_type      VARCHAR(30) NOT NULL,  -- generate / expand / summarize / tag-suggest / cleanup
    prompt_text   TEXT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',
    result_json   JSONB NULL,
    error_message TEXT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ NULL
);

-- =============================================================
-- 19. TRANSLATION_JOBS  (번역 작업 큐)
-- =============================================================
CREATE TABLE translation_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id       UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_lang   VARCHAR(20) NOT NULL,
    target_lang   VARCHAR(20) NOT NULL,
    requested_by  UUID NULL REFERENCES users(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued / processing / completed / failed
    error_message TEXT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ NULL
);

-- =============================================================
-- 20. NODE_TRANSLATIONS  (번역 캐시)
-- =============================================================
-- 원문은 nodes.text 가 진실.
-- 이 테이블은 캐시 테이블. text_hash 변경 시 무효화.
CREATE TABLE node_translations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_lang       VARCHAR(20) NOT NULL,
    translated_text   TEXT NOT NULL,
    source_text_hash  VARCHAR(128) NOT NULL,    -- nodes.text_hash 와 일치해야 유효
    model_version     VARCHAR(60) NULL,          -- 번역 엔진/버전 기록
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, target_lang)
);

-- =============================================================
-- 21. PRESENCE_SESSIONS  (실시간 접속 세션)
-- =============================================================
CREATE TABLE presence_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id       UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id   VARCHAR(120) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'active',   -- active / idle / disconnected
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 22. AUDIT_LOGS
-- =============================================================
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    map_id        UUID NULL REFERENCES maps(id) ON DELETE CASCADE,
    actor_id      UUID NULL REFERENCES users(id),
    action_type   VARCHAR(80) NOT NULL,   -- map.create / node.delete / publish.create / ...
    target_type   VARCHAR(80) NULL,
    target_id     UUID NULL,
    metadata      JSONB NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- AUTOSAVE PATCH PAYLOAD 스펙 (참고 주석)
-- =============================================================
-- PATCH /maps/:id/document 요청 body 구조:
--
-- {
--   "clientId":   "cli_abc123",          -- 탭/기기 구분 (충돌 식별)
--   "patchId":    "p_20260316_001",      -- 중복 제출 방지 (idempotency key)
--   "baseVersion": 128,                  -- 서버 버전 기준
--   "timestamp":  "2026-03-16T14:32:05.123Z",
--   "patches": [
--     { "op": "updateNodeText", "nodeId": "n1", "text": "AI 전략" }
--   ]
-- }
--
-- ※ patchId는 map_revisions.patch_json 에 함께 저장하여 중복 검사에 활용

-- =============================================================
-- INDEXES
-- =============================================================

-- maps
CREATE INDEX idx_maps_workspace_id       ON maps(workspace_id);
CREATE INDEX idx_maps_view_mode          ON maps(view_mode) WHERE view_mode = 'dashboard';

-- nodes
CREATE INDEX idx_nodes_map_id            ON nodes(map_id);
CREATE INDEX idx_nodes_parent_id         ON nodes(parent_id);
CREATE INDEX idx_nodes_node_type         ON nodes(node_type) WHERE node_type != 'text';
CREATE INDEX idx_nodes_text_hash         ON nodes(text_hash) WHERE text_hash IS NOT NULL;
CREATE INDEX idx_nodes_updated_at        ON nodes(map_id, updated_at);  -- dashboard snapshot diff용

-- node_order
CREATE INDEX idx_node_order_parent       ON node_order(map_id, parent_id, sort_order);

-- tags
CREATE INDEX idx_node_tags_tag_id        ON node_tags(tag_id);
CREATE INDEX idx_tags_workspace          ON tags(workspace_id, normalized_name);

-- node 관련
CREATE INDEX idx_node_links_node_id       ON node_links(node_id);
CREATE INDEX idx_node_attachments_node_id ON node_attachments(node_id);

-- revisions
CREATE INDEX idx_map_revisions_map_version ON map_revisions(map_id, version);

-- jobs
CREATE INDEX idx_ai_jobs_status           ON ai_jobs(status) WHERE status IN ('queued','processing');
CREATE INDEX idx_translation_jobs_status  ON translation_jobs(status) WHERE status IN ('queued','processing');
CREATE INDEX idx_exports_status           ON exports(status) WHERE status IN ('queued','processing');

-- presence
CREATE INDEX idx_presence_sessions_map    ON presence_sessions(map_id, status);

-- translations
CREATE INDEX idx_node_translations_node   ON node_translations(node_id, target_lang);

-- audit
CREATE INDEX idx_audit_logs_workspace     ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_map           ON audit_logs(map_id, created_at DESC);

-- full-text search (추후 활성화)
-- CREATE INDEX idx_nodes_text_trgm ON nodes USING gin(text gin_trgm_ops);
