-- =============================================================
-- easymindmap PostgreSQL Schema
-- Version: v2.0
-- DB: PostgreSQL 16+
-- 변경 이력:
--   v1.0: 초기 설계
--   v2.0: Map Properties 레벨별 설계 반영
--         - map_themes 테이블 신규
--         - maps: map_config_json JSONB 추가
--         - nodes: layout_type CHECK 14종 확장
--         - nodes: style_override_json 통합 (개별 스타일 컬럼 대체)
--         - nodes: level 캐시 컬럼 추가
--         - nodes: bg_image_config_json 추가
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
-- 4. MAP_THEMES  [v2.0 신규]
--    맵 설정 템플릿 (Typography / Shape / Layout 레벨별 프리셋)
-- =============================================================
-- config_json 구조 (MapConfig 타입):
-- {
--   "map": {
--     "defaultLayout": "Radial-Bidirectional",
--     "canvasBackground": "#ffffff",
--     "nodeSpacingH": 60,
--     "nodeSpacingV": 30
--   },
--   "typography": {
--     "fontFamily": "Pretendard",
--     "fontFallbacks": ["Noto Sans KR", "Arial", "sans-serif"],
--     "lineHeight": 1.3,
--     "levels": {
--       "root":   { "fontSize": 18, "fontWeight": "bold" },
--       "level1": { "fontSize": 16, "fontWeight": "semibold" },
--       "level2": { "fontSize": 15, "fontWeight": "medium" },
--       "level3": { "fontSize": 14, "fontWeight": "regular" },
--       "level4": { "fontSize": 13, "fontWeight": "regular" },
--       "level5": { "fontSize": 12, "fontWeight": "regular" }  -- level5+ 통일
--     }
--   },
--   "shape": {
--     "borderWidth": 1.5,
--     "levels": {
--       "root":   { "shape": "rounded-rectangle", "fillColor": "#4A90D9", "borderColor": "#2C5F8A" },
--       "level1": { "shape": "rounded-rectangle", "fillColor": "#7EC8A4", "borderColor": "#4A9B72" },
--       "level2": { "shape": "capsule",           "fillColor": "#F5E6A3", "borderColor": "#C9B84A" },
--       "level3": { "shape": "capsule",           "fillColor": "#f0f0f0", "borderColor": "#cccccc" },
--       "level4": { "shape": "none", "fillColor": "transparent", "borderColor": "transparent" },
--       "level5": { "shape": "none", "fillColor": "transparent", "borderColor": "transparent" }
--     }
--   },
--   "layout": {
--     "levels": {
--       "root":   "Radial-Bidirectional",
--       "level1": "Radial-Right",
--       "level2": "Tree-Right",
--       "level3": "Tree-Right",
--       "level4": "Tree-Right",
--       "level5": "Tree-Right"
--     }
--   }
-- }
CREATE TABLE map_themes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name          VARCHAR(100) NOT NULL,
    config_json   JSONB NOT NULL,
    is_system     BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = 시스템 기본 테마
    created_by    UUID NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_map_themes_workspace_id ON map_themes(workspace_id);

-- =============================================================
-- 5. MAPS  [v2.0 변경: theme_id FK화, map_config_json 추가]
-- =============================================================
CREATE TABLE maps (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id             UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

    -- [v2.0] map_themes FK (NULL이면 시스템 기본 테마 사용)
    theme_id                 UUID NULL REFERENCES map_themes(id) ON DELETE SET NULL,

    title                    VARCHAR(255) NOT NULL,
    description              TEXT NULL,

    root_node_id             UUID NULL,   -- 맵 생성 후 설정

    -- [v2.0 신규] 맵 전체 속성 (Typography / Shape / Layout 레벨별)
    -- NULL이면 theme_id → 시스템 DEFAULT_MAP_CONFIG 순으로 fallback
    -- 구조: MapConfig 타입 (map_themes.config_json 과 동일 스키마)
    map_config_json          JSONB NULL,

    -- Edge 정책 (Layout 기반 자동 결정이 기본)
    -- layout-based: 방사형=curve-line, 나머지=tree-line
    edge_policy              VARCHAR(30) NOT NULL DEFAULT 'layout-based',

    -- Dashboard 모드 (V3 예약)
    view_mode                VARCHAR(20) NOT NULL DEFAULT 'edit',  -- edit / dashboard
    refresh_interval_seconds INT         NOT NULL DEFAULT 0,

    is_archived              BOOLEAN     NOT NULL DEFAULT FALSE,

    created_by               UUID NOT NULL REFERENCES users(id),
    updated_by               UUID NOT NULL REFERENCES users(id),
    current_version          BIGINT      NOT NULL DEFAULT 1,
    last_saved_at            TIMESTAMPTZ NULL,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 6. NODES  [v2.0 변경: layout_type CHECK 14종, style_override_json 추가, level 추가]
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

    -- V3 예약 컬럼
    data_source     JSONB NULL,       -- { "type": "api", "url": "/api/sales" }
    refresh_policy  VARCHAR(20) NULL, -- polling / push / manual

    -- 텍스트
    text            TEXT        NOT NULL DEFAULT '',
    text_lang       VARCHAR(20) NULL,    -- 작성 언어 (ex: 'ko', 'en')
    text_hash       VARCHAR(128) NULL,   -- 번역 캐시 무효화 키

    -- [v2.0 변경] layout_type: NULL이면 부모/맵 기본값 상속
    -- 14종 전체 지원 (Branch Layout 전체 정의 참조)
    layout_type     VARCHAR(40) NULL CONSTRAINT chk_nodes_layout_type CHECK (
        layout_type IS NULL OR layout_type IN (
            'Radial-Bidirectional', 'Radial-Right',    'Radial-Left',
            'Tree-Up',             'Tree-Down',        'Tree-Right',   'Tree-Left',
            'Hierarchy-Right',     'Hierarchy-Left',
            'ProcessTree-Right',   'ProcessTree-Left',
            'ProcessTree-Right-A', 'ProcessTree-Right-B',
            'Freeform'
        )
    ),

    -- [v2.0 신규] 노드 레벨 캐시 (Root=0, Level1=1, ...)
    -- 폰트/스타일 레벨 기반 조회 성능을 위해 저장
    -- 노드 이동 시 해당 subtree 전체 재계산 필요
    -- level5 이상은 style 계산 시 MIN(level, 5) 적용
    level           INTEGER NOT NULL DEFAULT 0 CHECK (level >= 0),

    -- [v2.0 신규] 개별 노드 스타일 예외값 (NodeStyleOverride)
    -- NULL이면 레벨 기반 기본값 사용 (map_config_json → map_themes → DEFAULT_MAP_CONFIG)
    -- 저장 구조:
    -- {
    --   "fontFamily": "Arial",        -- 폰트 패밀리 override
    --   "fontSize": 20,               -- 폰트 크기 override
    --   "fontWeight": "bold",
    --   "italic": false,
    --   "underline": false,
    --   "textColor": "#cc0000",
    --   "shape": "diamond",           -- 도형 override
    --   "fillColor": "#ff6b6b",
    --   "borderColor": "#cc0000",
    --   "borderWidth": 2.0,
    --   "layoutType": "ProcessTree-Right"  -- subtree layout override
    -- }
    style_override_json  JSONB NULL,

    -- 상태
    collapsed       BOOLEAN NOT NULL DEFAULT FALSE,

    -- 위치 (freeform 전용, auto 레이아웃 계산값은 저장하지 않음)
    manual_x        NUMERIC(14,2) NULL,
    manual_y        NUMERIC(14,2) NULL,
    position_mode   VARCHAR(20) NOT NULL DEFAULT 'auto' CHECK (position_mode IN ('auto','manual')),

    -- 노드 배경 이미지 (node_media 와 별개의 스타일 속성)
    bg_image_mode        VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (bg_image_mode IN ('none','preset','upload')),
    bg_media_id          UUID NULL,   -- node_media.id 소프트 참조 (bg_image_mode='upload')
    bg_image_config_json JSONB NULL,
    -- bg_image_config_json 구조:
    -- { "fit": "cover", "position": "center", "overlayOpacity": 0.3 }
    -- fit: cover / contain / original
    -- position: center / top / bottom / left / right

    -- Indicator 요약 캐시 (렌더링 최적화)
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
-- 7. NODE_ORDER  (형제 노드 순서)
-- =============================================================
CREATE TABLE node_order (
    node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    parent_id   UUID NULL,
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    sort_order  NUMERIC(14,4) NOT NULL,
    PRIMARY KEY (node_id)
);

-- =============================================================
-- 8. EDGES  (확장 연결선)
-- =============================================================
-- 일반 부모-자식 연결선은 Layout Engine이 자동 생성 (DB 저장 없음)
-- 이 테이블은 cross-branch 관계 연결선 (커스텀 edge) 전용
CREATE TABLE edges (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    source_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_node_id  UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    edge_type       VARCHAR(30) NOT NULL DEFAULT 'tree-line',  -- tree-line / curve-line
    label           TEXT NULL,
    color           VARCHAR(20) NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 9. TAGS
-- =============================================================
CREATE TABLE tags (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name             VARCHAR(100) NOT NULL,
    normalized_name  VARCHAR(100) NOT NULL,
    color            VARCHAR(20) NULL,
    description      TEXT NULL,
    created_by       UUID NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, normalized_name)
);

-- =============================================================
-- 10. NODE_TAGS
-- =============================================================
CREATE TABLE node_tags (
    node_id     UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    tag_id      UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (node_id, tag_id)
);

-- =============================================================
-- 11. NODE_NOTES  (1:1)
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
-- 12. NODE_LINKS  (1:N)
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
-- 13. NODE_ATTACHMENTS  (1:N)
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
-- 14. NODE_MEDIA  (1:1, 노드 재생 미디어)
-- =============================================================
-- 배경 이미지(bg_image_*)와 구분:
--   node_media = 오디오/비디오 재생용 미디어 (노드 Indicator 표시)
--   bg_image   = 노드 도형 배경에 깔리는 이미지 스타일 속성
CREATE TABLE node_media (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id        UUID NOT NULL UNIQUE REFERENCES nodes(id) ON DELETE CASCADE,
    storage_key    TEXT NOT NULL,
    original_name  VARCHAR(255) NOT NULL,
    mime_type      VARCHAR(120) NOT NULL,   -- audio/* / video/*
    file_size      BIGINT NOT NULL,
    created_by     UUID NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 15. MAP_REVISIONS  (서버 버전 히스토리)
-- =============================================================
-- Undo/Redo (클라이언트 메모리) 와 다름
-- 서버 영속 버전: Diff Viewer / 복구 / 감사 목적
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
-- 16. MAP_PERMISSIONS  (공유 권한)
-- =============================================================
CREATE TABLE map_permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id     UUID NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(30) NOT NULL DEFAULT 'viewer',  -- editor / commenter / viewer
    share_token VARCHAR(120) NULL UNIQUE,
    expires_at  TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 17. EXPORTS
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
-- 18. PUBLISHED_MAPS
-- =============================================================
CREATE TABLE published_maps (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id        UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    published_by  UUID NOT NULL REFERENCES users(id),
    slug          VARCHAR(255) NOT NULL UNIQUE,
    visibility    VARCHAR(20) NOT NULL DEFAULT 'public',  -- public / unlisted / private
    storage_key   TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 19. AI_JOBS
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
-- 20. TRANSLATION_JOBS
-- =============================================================
CREATE TABLE translation_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id       UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_lang   VARCHAR(20) NOT NULL,
    target_lang   VARCHAR(20) NOT NULL,
    requested_by  UUID NULL REFERENCES users(id),
    status        VARCHAR(20) NOT NULL DEFAULT 'queued',
    error_message TEXT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ NULL
);

-- =============================================================
-- 21. NODE_TRANSLATIONS  (번역 캐시)
-- =============================================================
CREATE TABLE node_translations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id           UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_lang       VARCHAR(20) NOT NULL,
    translated_text   TEXT NOT NULL,
    source_text_hash  VARCHAR(128) NOT NULL,
    model_version     VARCHAR(60) NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (node_id, target_lang)
);

-- =============================================================
-- 22. PRESENCE_SESSIONS
-- =============================================================
CREATE TABLE presence_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id       UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id   VARCHAR(120) NOT NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'active',
    joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- 23. AUDIT_LOGS
-- =============================================================
CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id  UUID NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    map_id        UUID NULL REFERENCES maps(id) ON DELETE CASCADE,
    actor_id      UUID NULL REFERENCES users(id),
    action_type   VARCHAR(80) NOT NULL,
    target_type   VARCHAR(80) NULL,
    target_id     UUID NULL,
    metadata      JSONB NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================

-- map_themes
CREATE INDEX idx_map_themes_workspace_id    ON map_themes(workspace_id);

-- maps
CREATE INDEX idx_maps_workspace_id          ON maps(workspace_id);
CREATE INDEX idx_maps_theme_id              ON maps(theme_id) WHERE theme_id IS NOT NULL;
CREATE INDEX idx_maps_view_mode             ON maps(view_mode) WHERE view_mode = 'dashboard';

-- nodes (핵심)
CREATE INDEX idx_nodes_map_id               ON nodes(map_id);
CREATE INDEX idx_nodes_parent_id            ON nodes(parent_id);
CREATE INDEX idx_nodes_level                ON nodes(map_id, level);     -- 레벨 기반 스타일 조회
CREATE INDEX idx_nodes_node_type            ON nodes(node_type) WHERE node_type != 'text';
CREATE INDEX idx_nodes_text_hash            ON nodes(text_hash) WHERE text_hash IS NOT NULL;
CREATE INDEX idx_nodes_updated_at           ON nodes(map_id, updated_at);
-- style_override_json GIN (필요 시 활성화)
-- CREATE INDEX idx_nodes_style_override    ON nodes USING GIN (style_override_json);

-- node_order
CREATE INDEX idx_node_order_parent          ON node_order(map_id, parent_id, sort_order);

-- tags
CREATE INDEX idx_tags_workspace             ON tags(workspace_id, normalized_name);
CREATE INDEX idx_node_tags_tag_id           ON node_tags(tag_id);

-- node 관련
CREATE INDEX idx_node_links_node_id         ON node_links(node_id);
CREATE INDEX idx_node_attachments_node_id   ON node_attachments(node_id);

-- revisions / jobs
CREATE INDEX idx_map_revisions_map_version  ON map_revisions(map_id, version);
CREATE INDEX idx_ai_jobs_status             ON ai_jobs(status) WHERE status IN ('queued','processing');
CREATE INDEX idx_translation_jobs_status    ON translation_jobs(status) WHERE status IN ('queued','processing');
CREATE INDEX idx_exports_status             ON exports(status) WHERE status IN ('queued','processing');

-- presence / audit
CREATE INDEX idx_presence_sessions_map      ON presence_sessions(map_id, status);
CREATE INDEX idx_audit_logs_workspace       ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX idx_audit_logs_map             ON audit_logs(map_id, created_at DESC);

-- translations
CREATE INDEX idx_node_translations_node     ON node_translations(node_id, target_lang);

-- full-text search (추후 활성화)
-- CREATE INDEX idx_nodes_text_trgm ON nodes USING gin(text gin_trgm_ops);

-- =============================================================
-- STYLE RESOLUTION 로직 (API 레이어 참고 주석)
-- =============================================================
-- 노드 렌더링 시 최종 스타일 결정 순서:
--
--   1. nodes.style_override_json[prop]               → 있으면 사용
--   2. maps.map_config_json.levels[level][prop]      → 있으면 사용
--   3. map_themes.config_json.levels[level][prop]    → 있으면 사용
--   4. DEFAULT_MAP_CONFIG.levels[level][prop]        → 시스템 기본값
--
-- 레벨 클램핑: effectiveLevel = MIN(nodes.level, 5)
-- (level5 이상은 level5 설정으로 통일)
--
-- TypeScript 구현 참조: types/map-config.types.ts > resolveNodeStyle()

-- =============================================================
-- AUTOSAVE PATCH PAYLOAD 스펙 (참고 주석)
-- =============================================================
-- PATCH /maps/:id/document 요청 body:
-- {
--   "clientId":    "cli_abc123",
--   "patchId":     "p_20260316_001",   -- idempotency key
--   "baseVersion": 128,
--   "timestamp":   "2026-03-16T14:32:05.123Z",
--   "patches": [
--     { "op": "updateNodeText",   "nodeId": "n1", "text": "AI 전략" },
--     { "op": "updateNodeStyle",  "nodeId": "n2", "styleOverride": { "shape": "diamond" } },
--     { "op": "updateNodeLayout", "nodeId": "n3", "layoutType": "ProcessTree-Right" }
--   ]
-- }
