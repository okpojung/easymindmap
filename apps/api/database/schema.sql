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

-- map_folders: 사용자별 문서함(폴더) 트리 — 2026-08-02 사용자 요청.
--   맵을 폴더로 나눠 저장한다. parent_id NULL = 최상위("홈").
--   폴더 삭제는 API 에서 **비어 있을 때만** 허용한다(내용까지 지우는
--   실수를 막는다) — CASCADE 는 사용자 삭제 시의 정리 경로다.
CREATE TABLE IF NOT EXISTS public.map_folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    parent_id   UUID REFERENCES public.map_folders(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_folders_owner
    ON public.map_folders(owner_id, parent_id);

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

-- 문서함(폴더) + 맵 유형 — 2026-08-02 추가. 이미 쓰고 있는 DB 에도
-- 그대로 적용되도록 ADD COLUMN IF NOT EXISTS 로 쓴다(멱등).
--   folder_id : NULL = 최상위("홈")
--   kind      : 'solo'(단독맵) | 'collab'(협업맵) — 지금은 분류 표식이며
--               실제 동시 편집은 협업 단계(V1~V2)에서 붙는다
ALTER TABLE public.maps
    ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.map_folders(id) ON DELETE SET NULL;
ALTER TABLE public.maps
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'solo';

CREATE INDEX IF NOT EXISTS idx_maps_folder
    ON public.maps(owner_id, folder_id) WHERE deleted_at IS NULL;

-- ⚠️ 제목 중복(같은 폴더 안 같은 이름) 금지는 **API 에서** 검사한다.
--    유니크 인덱스를 쓰지 않는 이유: 이미 운영 중인 DB 에 중복 제목이
--    남아 있으면 인덱스 생성이 실패해 스키마 적용 전체가 멈춘다.
--    데이터를 정리한 뒤 유니크 인덱스로 승격하는 것이 다음 단계다(B13).

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

-- map_documents: 맵당 1건의 "전체 문서 스냅샷"(JSONB).
--   프론트엔드 문서 트리(임베드 이미지·노트·태그·스타일 포함)를 손실 없이
--   통째로 보관하는 단순 클라우드 저장 경로. 정규화된 nodes/map_revisions
--   (세밀 동기화·협업용)와 병행한다.
CREATE TABLE IF NOT EXISTS public.map_documents (
    map_id      UUID PRIMARY KEY REFERENCES public.maps(id) ON DELETE CASCADE,
    doc         JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- map_document_versions: 저장 시점별 문서 스냅샷 이력 (히스토리 — B8).
--   확정 규칙(2026-07-31): **명시적 저장·맵 닫기 때마다** 저장일시별로
--   1건 쌓는다(자동저장마다가 아니다 — 이미지가 data URL 로 들어가
--   스냅샷이 크기 때문). 복원은 현재 맵을 덮어쓰지 않고 새 맵으로 연다.
--   클라이언트 되돌리기(Ctrl+Z, 세션 한정)와는 완전히 별개.
--   patch 기반 map_revisions(정규화 노드·협업 경로)와도 별개다.
CREATE TABLE IF NOT EXISTS public.map_document_versions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id      UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    version     INT  NOT NULL,              -- 맵 안에서 1부터 증가
    title       VARCHAR(255) NOT NULL,      -- 저장 시점의 맵 제목
    doc         JSONB NOT NULL,
    created_by  UUID REFERENCES public.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (map_id, version)
);

CREATE INDEX IF NOT EXISTS idx_map_doc_versions_map
    ON public.map_document_versions(map_id, version DESC);

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

-- map_folders: 내 폴더만 (문서함 — 2026-08-02)
ALTER TABLE public.map_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own folders"
    ON public.map_folders FOR ALL
    USING (auth.uid() = owner_id);

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

-- map_documents: 소유한 맵의 문서 스냅샷만 접근
ALTER TABLE public.map_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners can manage own map document"
    ON public.map_documents FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = map_documents.map_id AND m.owner_id = auth.uid()
        )
    );

-- map_document_versions: 소유한 맵의 저장 버전 이력만 접근 (히스토리 — B8)
ALTER TABLE public.map_document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners can manage own map document versions"
    ON public.map_document_versions FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.maps m
            WHERE m.id = map_document_versions.map_id AND m.owner_id = auth.uid()
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

-- ============================================================
-- 15. 첨부 저장소 + 저장 용량 쿼터 (B9 — 2026-08-02)
-- ============================================================
-- 첨부 파일 원본은 API 서버의 저장소 드라이버(로컬 디스크/S3 호환)에
-- 저장되고, 이 테이블은 메타데이터(소유자·이름·크기·storage key)만 담는다.
-- 쿼터 = 사용자의 문서(DB: map_documents + versions) + 첨부 합산이
-- users.quota_bytes 이하여야 한다. 그 값은 **요금제(users.plan)가 정한다.**

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS quota_bytes BIGINT NOT NULL DEFAULT 1073741824;

-- ── 요금제 (2026-08-06 확정 — 결제 연동은 나중) ─────────────────────
--   Free 10MB · Basic 10GB · Pro 30GB · Team 20GB/사용자
-- 요금(가격)은 아직 정하지 않았다. 여기 있는 것은 **용량 정의**뿐이고,
-- 결제가 붙으면 그쪽에서 이 컬럼만 바꾸면 된다.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_plan_check;
ALTER TABLE public.users
    ADD CONSTRAINT users_plan_check CHECK (plan IN ('free', 'basic', 'pro', 'team'));

COMMENT ON COLUMN public.users.plan IS
    '요금제 — free | basic | pro | team. 저장 용량의 단일 기준이다. '
    '결제를 붙이면 이 컬럼만 바꾸면 quota_bytes 는 트리거가 따라온다.';

-- 요금제 → 용량. **여기 한 곳만 고치면 전부 따라온다.**
CREATE OR REPLACE FUNCTION public.plan_quota_bytes(p TEXT)
RETURNS BIGINT AS $$
    SELECT CASE lower(COALESCE(p, 'free'))
        WHEN 'basic' THEN 10737418240::BIGINT   -- 10 GB
        WHEN 'pro'   THEN 32212254720::BIGINT   -- 30 GB
        WHEN 'team'  THEN 21474836480::BIGINT   -- 20 GB / 사용자
        ELSE             10485760::BIGINT       -- free = 10 MB
    END;
$$ LANGUAGE sql IMMUTABLE;

-- **plan 이 바뀌면 quota_bytes 가 따라온다.** 두 값이 어긋날 수 없게
-- 트리거로 묶는다 — 결제 쪽에서 `UPDATE users SET plan='pro'` 한 줄이면
-- 용량까지 끝난다.
--
-- 반대로 `quota_bytes` 를 직접 UPDATE 하면 그 값이 그대로 남는다
-- (plan 이 바뀌지 않아 트리거가 안 돈다) — **특별 계약용 escape hatch**.
-- 단 그 계정의 plan 을 나중에 바꾸면 그때 덮어써진다.
CREATE OR REPLACE FUNCTION public.sync_quota_from_plan()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.plan IS DISTINCT FROM OLD.plan THEN
        NEW.quota_bytes := public.plan_quota_bytes(NEW.plan);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_sync_quota ON public.users;
CREATE TRIGGER users_sync_quota
    BEFORE INSERT OR UPDATE OF plan ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.sync_quota_from_plan();

ALTER TABLE public.users
    ALTER COLUMN quota_bytes SET DEFAULT 10485760;   -- free 와 같게 (10MB)

COMMENT ON COLUMN public.users.quota_bytes IS
    '저장 용량 한도(바이트) = 문서(map_documents + map_document_versions) + 첨부 합산. '
    'users.plan 이 정하며 users_sync_quota 트리거가 동기화한다 — '
    '특별 계약이면 plan 을 먼저 정한 뒤 이 값을 직접 UPDATE 한다.';

-- ── 기존 계정 Basic 승격 (2026-08-06) ───────────────────────────────
-- **기준 시각 이전에 가입한 계정은 Basic(10GB).** 그 뒤 신규 가입은
-- 컬럼 기본값 그대로 **Free(10MB)** 다. 트리거가 돌아 quota_bytes 도
-- 함께 10GB 가 된다.
--
-- `schema.sql` 은 배포마다 다시 적용된다. 그래서 두 겹으로 막는다 —
--   ① **고정 시각**: 조건이 `NOW()` 거나 아예 없으면 재적용할 때마다
--      그 사이에 가입한 무료 사용자까지 올라간다.
--      **기준 시각은 반드시 "이미 지난" 때여야 한다** — 처음에 미래
--      시각을 적었다가 e2e119 [4] 가 잡아냈다.
--   ② **`NOT EXISTS (… plan <> 'free')`**: 이 승격은 **딱 한 번**만
--      돈다. 한 명이라도 유료 요금제가 되고 나면 다시 돌지 않으므로,
--      나중에 어떤 계정을 일부러 Free 로 내려도 되살아나지 않는다.
UPDATE public.users
   SET plan = 'basic'
 WHERE created_at < TIMESTAMPTZ '2026-08-06 12:00:00+00'
   AND plan = 'free'
   AND NOT EXISTS (SELECT 1 FROM public.users WHERE plan <> 'free');

CREATE TABLE IF NOT EXISTS public.attachments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- 어느 맵에서 올렸는지 (맵 삭제 시에도 첨부는 남는다 — 다른 맵이
    -- 같은 URL 을 참조할 수 있어 SET NULL)
    map_id       UUID REFERENCES public.maps(id) ON DELETE SET NULL,
    name         VARCHAR(255) NOT NULL,
    mime         VARCHAR(127) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes   BIGINT NOT NULL,
    storage_key  TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_owner
    ON public.attachments(owner_id);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can manage own attachments" ON public.attachments;
CREATE POLICY "users can manage own attachments"
    ON public.attachments FOR ALL
    USING (auth.uid() = owner_id);

-- 히스토리 버전 상세 정보 (2026-08-03 — ThinkWise 참고 요청):
-- 레이아웃·총 노드 수·서버 첨부 합계를 저장 시점에 기록해 목록에 보여준다.
-- (문서 크기는 pg_column_size(doc) 로 이미 조회 — 내장 첨부 포함)
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS layout_type VARCHAR(50);
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS node_count INTEGER;
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS attach_bytes BIGINT;
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS attach_count INTEGER;

-- 맵 단일 세션 편집 잠금 (2026-08-04) — 같은 맵을 여러 브라우저/PC 에서
-- 동시에 편집해 덮어쓰는 사고 방지. 편집 탭이 하트비트로 유지하고,
-- 60초 넘게 하트비트가 없으면 죽은 잠금으로 보고 다른 세션이 가져간다.
CREATE TABLE IF NOT EXISTS public.map_edit_locks (
    map_id       UUID PRIMARY KEY REFERENCES public.maps(id) ON DELETE CASCADE,
    session_key  VARCHAR(64) NOT NULL,
    user_id      UUID NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────
-- 문서함 목록 상세 (2026-08-05): 저장 시점 통계를 map_documents 에 기록
-- — 목록(GET /maps)이 doc 파싱 없이 노드 수·첨부 개수/용량을 보여 준다.
-- 값은 저장(PUT document)할 때마다 서버가 다시 계산한다. 이전에 저장된
-- 행은 NULL 로 남고(프런트가 '—' 표시), 다음 저장 때 채워진다.

ALTER TABLE public.map_documents
    ADD COLUMN IF NOT EXISTS node_count   INTEGER;
ALTER TABLE public.map_documents
    ADD COLUMN IF NOT EXISTS attach_count INTEGER;
ALTER TABLE public.map_documents
    ADD COLUMN IF NOT EXISTS attach_bytes BIGINT;

-- ────────────────────────────────────────────────────────────────────
-- 문서함 **내용 검색** (2026-08-08 사용자 요청): 지금까지 문서함 검색은
-- 폴더 이름·맵 제목만 훑었다. 맵 안(노드 텍스트·노트·태그)까지 찾으려면
-- 서버가 doc 을 매번 파싱해야 하는데, 그건 맵 수만큼 느려진다.
--
-- 그래서 저장할 때 **검색용 평문**을 한 컬럼에 만들어 두고 거기서 찾는다.
--   · 만드는 주체 = DB 트리거. 애플리케이션 코드가 아니라 DB 가 doc 에서
--     직접 뽑으므로 **doc 과 색인이 어긋날 수 없다** (다른 경로로 doc 을
--     써도 색인이 따라온다).
--   · 한 줄 = 한 조각(노드 텍스트 / 노트 / 태그). 줄 안의 개행은 공백으로
--     바꾼다 — 검색 결과 **미리보기**가 "맞은 줄 하나"로 딱 떨어진다.
--   · 인덱스 = pg_trgm GIN. 한국어는 형태소 분석 사전이 없어 to_tsvector
--     방식이 '검색'/'검색어'를 갈라 놓는다. 부분 문자열(ILIKE '%…%')이
--     사람이 기대하는 동작이고, trigram 인덱스가 그걸 가속한다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.map_documents
    ADD COLUMN IF NOT EXISTS search_text TEXT;

-- doc(JSONB) → 검색용 평문. 재귀 탐색(`$.map.**`)이라 노드가 아무리
-- 깊어도, 스키마가 늘어나도 따라간다.
--   · `.text`  = 노드 텍스트 + 노트 본문 (둘 다 text 키를 쓴다)
--   · `.tags[*]` / `.tag` = 태그
--   · `.links[*].label` / `.links[*].url` = 링크 이름·주소 (2026-08-08 2차)
--   · `.attachments[*].name` = 첨부 파일명 (2026-08-08 2차)
--
-- ⚠️ 첨부의 `url` 은 **절대 넣지 않는다** — 2MB 이하 첨부는 data URL 로
--    문서에 내장되므로(base64), 그걸 색인에 넣으면 색인이 문서만큼
--    커지고 검색이 base64 쓰레기에 걸린다. 노드 사진 `src` 도 같은 이유
--    로 제외(키 이름이 달라 애초에 안 잡힌다).
CREATE OR REPLACE FUNCTION public.map_search_text(doc JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT string_agg(t, E'\n')
      FROM (
        SELECT DISTINCT btrim(regexp_replace(v #>> '{}', '\s+', ' ', 'g')) AS t
          FROM (
            SELECT jsonb_path_query(doc, '$.map.**.text')    AS v
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.**.tags[*]')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.**.tag')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.**.links[*].label')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.**.links[*].url')
             UNION ALL
            SELECT jsonb_path_query(doc, '$.map.**.attachments[*].name')
          ) q
         WHERE jsonb_typeof(v) = 'string'
      ) d
     WHERE t <> '';
$$;

CREATE OR REPLACE FUNCTION public.map_documents_sync_search_text()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.search_text := public.map_search_text(NEW.doc);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS map_documents_search_text ON public.map_documents;
CREATE TRIGGER map_documents_search_text
    BEFORE INSERT OR UPDATE OF doc ON public.map_documents
    FOR EACH ROW EXECUTE FUNCTION public.map_documents_sync_search_text();

-- 이미 저장된 맵 메우기. **값이 달라지는 행만** 쓴다 —
-- 처음 적용할 때는 전부 채우고, 추출 규칙이 바뀌었을 때(예: 링크·첨부명
-- 추가)는 그 차이만 다시 쓴다. 안 바뀐 행은 건드리지 않아 테이블이
-- 부풀지 않는다.
UPDATE public.map_documents d
   SET search_text = n.v
  FROM (SELECT map_id, public.map_search_text(doc) AS v
          FROM public.map_documents) n
 WHERE n.map_id = d.map_id AND d.search_text IS DISTINCT FROM n.v;

-- 부분 문자열 검색 가속 (ILIKE '%…%') — 제목·내용 둘 다
CREATE INDEX IF NOT EXISTS idx_map_documents_search_trgm
    ON public.map_documents USING GIN (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_maps_title_trgm
    ON public.maps USING GIN (title gin_trgm_ops);

-- ────────────────────────────────────────────────────────────────────
-- 히스토리 접속 정보 (2026-08-09 사용자 요청): "히스토리에 실행한
-- Platform(Windows 11·Android 14·iOS…)·브라우저 종류·IP 도 함께 기록하고
-- 보여 달라." 저장(버전 생성) 시점의 값을 그 버전 행에 남긴다.
--   · platform/browser 는 **클라이언트가 알려준 값**을 서버가 다듬어 넣는다
--     (UA 문자열만으로는 Windows 10 과 11 을 구분할 수 없다 — 둘 다
--      'Windows NT 10.0' 이다. 브라우저의 User-Agent Client Hints
--      (navigator.userAgentData) 로만 판별된다). 값이 없으면 서버가
--     User-Agent 헤더로 추정한다.
--   · IP 는 **서버가 정한다** — 클라이언트가 보낸 값은 믿지 않는다.
--     'trust proxy' 로 X-Forwarded-For 의 실제 클라이언트 IP 를 쓴다.
--   · 개인정보: 본인이 소유한 맵의 이력에만 남고 RLS 로 본인만 조회한다.
--     맵을 지우면 ON DELETE CASCADE 로 함께 사라진다.
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS client_platform VARCHAR(60);
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS client_browser  VARCHAR(60);
-- IPv6 최대 45자 (IPv4-mapped 표기 포함)
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS client_ip       VARCHAR(45);

-- ────────────────────────────────────────────────────────────────────
-- 회원가입 (2026-08-09 사용자 요청): 가입 시 **이메일 인증 + 성명 +
-- 휴대폰번호**를 받는다. 요금제는 free (users.plan 기본값 그대로).
--
--   · 휴대폰은 **국가번호와 번호를 따로** 담는다 — 글로벌 서비스를
--     염두에 둔 결정. '+82' 처럼 앞에 + 를 붙여 저장하고, 번호는
--     숫자만 남긴다(하이픈·공백 제거). 나라마다 자릿수가 달라
--     형식 검사는 최소로 한다.
--   · phone_verified_at 은 **지금은 항상 NULL** 이다 — 휴대폰 인증
--     시스템은 나중에 붙인다. 자리만 미리 만들어 둔다.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS full_name          VARCHAR(100);
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_country      VARCHAR(6);
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_number       VARCHAR(20);
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone_verified_at  TIMESTAMPTZ;
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS email_verified_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.users.full_name IS
    '성명 — 가입 시 입력받는다.';
COMMENT ON COLUMN public.users.phone_country IS
    '국가번호 (+82 형태) — 글로벌 대비로 번호와 분리해 담는다.';
COMMENT ON COLUMN public.users.phone_verified_at IS
    '휴대폰 인증 시각 — 인증 시스템 도입 전까지는 항상 NULL.';

-- 이메일 인증번호 (2026-08-09) — 가입 화면의 [이메일 인증] 버튼.
--   · 코드는 **평문으로 두지 않는다** — sha256 해시만 담는다.
--     메일로 이미 보낸 값이라 DB가 새어도 그것만으로는 못 쓰게.
--   · 이메일당 한 행만 둔다(UPSERT) — 다시 받으면 앞의 것은 무효다.
--   · attempts 로 무차별 대입을 막고(5회), expires_at 으로 만료(10분).
--   · consumed_at 이 차면 그 코드는 끝난 것이다. 다만 가입을 마칠
--     때까지 "이 이메일은 인증됨"을 알아야 하므로 행은 남긴다.
CREATE TABLE IF NOT EXISTS public.email_verifications (
    email        VARCHAR(255) PRIMARY KEY,
    code_hash    VARCHAR(64)  NOT NULL,
    expires_at   TIMESTAMPTZ  NOT NULL,
    attempts     INT          NOT NULL DEFAULT 0,
    -- 재발송 제한용 — 마지막 발송 시각과 최근 1시간 발송 횟수
    sent_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    sent_count   INT          NOT NULL DEFAULT 1,
    window_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    consumed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_expires
    ON public.email_verifications(expires_at);

COMMENT ON TABLE public.email_verifications IS
    '가입 이메일 인증번호 — 코드는 sha256 해시로만 담는다. '
    '이메일당 1행(UPSERT), 만료 10분, 시도 5회, 재발송 60초 간격/시간당 5회.';

-- ────────────────────────────────────────────────────────────────────
-- 탈퇴한 계정의 묘비 (2026-08-11 — 회원탈퇴)
--
-- 탈퇴는 users 행을 **지운다**(ON DELETE CASCADE 로 맵·첨부까지 사라진다).
-- 그런데 지운 직후에도 그 사람의 **액세스 토큰은 만료 전까지 유효**하다.
-- AuthGuard 는 토큰이 유효하면 없는 사용자를 만들어 주므로(JIT), 묘비가
-- 없으면 **탈퇴한 계정이 되살아난다** — 그 이메일이 auth.users 에 다시
-- 잡혀 같은 주소로 재가입할 수 없게 된다.
--
-- 그래서 id 만 남긴다. 이메일·성명은 남기지 않는다(지우는 것이 목적이다).
-- 재가입하면 GoTrue 가 **새 id** 를 주므로 이 묘비에 걸리지 않는다.
CREATE TABLE IF NOT EXISTS public.deleted_accounts (
    user_id     UUID PRIMARY KEY,
    deleted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.deleted_accounts IS
    '탈퇴한 계정 id — 만료 전 토큰으로 계정이 되살아나는 것을 막는다. '
    '개인정보는 담지 않는다(재가입은 새 id 라 걸리지 않는다).';
