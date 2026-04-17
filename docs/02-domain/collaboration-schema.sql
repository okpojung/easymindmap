-- ============================================================
-- easymindmap — 협업맵 스키마 추가
-- 파일: docs/02-domain/collaboration-schema.sql  (신규 파일)
-- 버전: v1.0 (2026-04-05)
-- 적용 위치: docs/02-domain/schema.sql 끝에 append 하거나
--            별도 migration 파일로 실행
-- ============================================================

-- ============================================================
-- A. maps 테이블 컬럼 추가
-- ============================================================
ALTER TABLE public.maps
  ADD COLUMN IF NOT EXISTS is_collaborative BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collab_owner_id  UUID REFERENCES public.users(id);
-- collab_owner_id: 현재 creator 역할 보유자 (소유권 이양 후 변경됨)
-- owner_id(기존) 와 구분: owner_id는 최초 생성자, collab_owner_id는 현재 creator

COMMENT ON COLUMN public.maps.is_collaborative IS
  '협업맵 여부. active editor 1명 이상이면 true.';
COMMENT ON COLUMN public.maps.collab_owner_id IS
  '현재 creator 역할 보유자. 소유권 이양 시 업데이트됨.';

-- ============================================================
-- B. nodes 테이블 컬럼 추가
-- ============================================================
ALTER TABLE public.nodes
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(id);
-- 기존 nodes 테이블에 depth 컬럼이 이미 있는지 확인 후 추가
-- db-schema.md v3.0에 nodes.depth가 이미 존재하므로 중복 추가 안 함

COMMENT ON COLUMN public.nodes.created_by IS
  '노드를 최초 생성한 사용자 ID. 수정/삭제 권한 판단 기준.';

-- ============================================================
-- C. map_collaborators 테이블 (신규)
-- ============================================================
-- 기존 workspace_members(role: owner/editor/viewer)와 다름
-- 협업맵 참여자 전용 테이블. viewer 없음.

CREATE TABLE IF NOT EXISTS public.map_collaborators (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- 역할: creator | editor (viewer 없음)
    role            VARCHAR(20) NOT NULL DEFAULT 'editor'
                    CHECK (role IN ('creator', 'editor')),

    -- 편집 범위
    -- full  : creator 전용. 맵 전체 편집.
    -- level : depth >= scope_level 인 노드 편집 (editor 전용)
    -- node  : scope_node_id 노드 + 하위 노드 편집 (editor 전용)
    scope_type      VARCHAR(20) NOT NULL DEFAULT 'level'
                    CHECK (scope_type IN ('full', 'level', 'node')),
    scope_level     INT         NULL,   -- scope_type='level' 시 사용
    scope_node_id   UUID        NULL REFERENCES public.nodes(id) ON DELETE SET NULL,

    -- 초대 정보
    invited_by      UUID        NOT NULL REFERENCES public.users(id),
    invite_token    VARCHAR(120) NULL UNIQUE,
    invite_expires_at TIMESTAMPTZ NULL,

    -- 상태
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'rejected', 'removed')),

    invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at     TIMESTAMPTZ NULL,
    removed_at      TIMESTAMPTZ NULL,

    UNIQUE (map_id, user_id)
);

-- creator는 맵당 1명만 (부분 유니크 인덱스)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_map_collaborators_one_creator
    ON public.map_collaborators (map_id)
    WHERE role = 'creator' AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_map_collaborators_map_status
    ON public.map_collaborators (map_id, status);

CREATE INDEX IF NOT EXISTS idx_map_collaborators_user_status
    ON public.map_collaborators (user_id, status);

CREATE INDEX IF NOT EXISTS idx_map_collaborators_invite_token
    ON public.map_collaborators (invite_token)
    WHERE invite_token IS NOT NULL;

-- editor에게 full scope 배정 방지 트리거
CREATE OR REPLACE FUNCTION public.check_collaborator_scope()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role = 'editor' AND NEW.scope_type = 'full' THEN
    RAISE EXCEPTION 'editor 역할에게 full scope를 배정할 수 없습니다. level 또는 node를 사용하세요.';
  END IF;
  -- creator는 항상 full scope 강제
  IF NEW.role = 'creator' AND NEW.scope_type != 'full' THEN
    NEW.scope_type := 'full';
    NEW.scope_level := NULL;
    NEW.scope_node_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_collaborator_scope
  BEFORE INSERT OR UPDATE ON public.map_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.check_collaborator_scope();

COMMENT ON TABLE public.map_collaborators IS
  '협업맵 참여자 테이블. role: creator(1명) | editor(N명). viewer 없음.';

-- ============================================================
-- D. map_ownership_history 테이블 (신규)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.map_ownership_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id          UUID        NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    from_user_id    UUID        NOT NULL REFERENCES public.users(id),
    to_user_id      UUID        NOT NULL REFERENCES public.users(id),
    transferred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note            TEXT        NULL
);

CREATE INDEX IF NOT EXISTS idx_map_ownership_history_map
    ON public.map_ownership_history (map_id, transferred_at DESC);

COMMENT ON TABLE public.map_ownership_history IS
  'creator 권한 이양 이력. 감사 목적으로 삭제 불가.';

-- ============================================================
-- E. RLS (Row Level Security) 정책 추가
-- ============================================================

-- map_collaborators: 해당 맵 참여자만 조회 가능
ALTER TABLE public.map_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collaborators_select" ON public.map_collaborators
  FOR SELECT USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT user_id FROM public.map_collaborators mc2
      WHERE mc2.map_id = map_collaborators.map_id AND mc2.status = 'active'
    )
  );

CREATE POLICY "collaborators_insert" ON public.map_collaborators
  FOR INSERT WITH CHECK (
    -- creator만 초대 가능
    auth.uid() IN (
      SELECT user_id FROM public.map_collaborators
      WHERE map_id = map_collaborators.map_id
        AND role = 'creator' AND status = 'active'
    )
  );

CREATE POLICY "collaborators_update" ON public.map_collaborators
  FOR UPDATE USING (
    -- creator만 수정 가능 (또는 본인 수락)
    auth.uid() IN (
      SELECT user_id FROM public.map_collaborators mc2
      WHERE mc2.map_id = map_collaborators.map_id
        AND mc2.role = 'creator' AND mc2.status = 'active'
    )
    OR auth.uid() = user_id  -- 본인 수락/거절
  );


-- ============================================================
-- F. 실시간 협업 채팅 / Node Thread / AI Preview
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chat_messages (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id            UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    node_id           UUID NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    client_msg_id     VARCHAR(80) NOT NULL,
    text              TEXT NOT NULL,
    source_lang       VARCHAR(20) NULL,
    source_text_hash  VARCHAR(128) NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (map_id, user_id, client_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_map_created
    ON public.chat_messages (map_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_node_created
    ON public.chat_messages (node_id, created_at DESC)
    WHERE node_id IS NOT NULL;

COMMENT ON TABLE public.chat_messages IS
  '맵 단위 실시간 협업 채팅 메시지. node_id가 있으면 node thread 연결 메시지다.';

CREATE TABLE IF NOT EXISTS public.chat_message_translations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        UUID NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    target_lang       VARCHAR(20) NOT NULL,
    translated_text   TEXT NOT NULL,
    source_text_hash  VARCHAR(128) NOT NULL,
    provider          VARCHAR(50) NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (message_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_translations_message_lang
    ON public.chat_message_translations (message_id, target_lang);

COMMENT ON TABLE public.chat_message_translations IS
  '채팅 번역 영속 캐시. 수신자별이 아니라 targetLang별 1건 저장 원칙.';

CREATE TABLE IF NOT EXISTS public.node_thread_ai_previews (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id             UUID NOT NULL REFERENCES public.maps(id) ON DELETE CASCADE,
    node_id            UUID NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    requested_by       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    action_type        VARCHAR(30) NOT NULL
                      CHECK (action_type IN ('summarize', 'extract_tasks', 'generate_task_nodes')),
    source_message_ids JSONB NOT NULL DEFAULT '[]',
    result_json        JSONB NOT NULL,
    approval_state     VARCHAR(20) NOT NULL DEFAULT 'preview'
                      CHECK (approval_state IN ('preview', 'approved', 'applied', 'discarded')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at        TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_node_thread_ai_previews_node_created
    ON public.node_thread_ai_previews (node_id, created_at DESC);

COMMENT ON TABLE public.node_thread_ai_previews IS
  'node thread 기반 AI 요약/작업 추출 preview 저장소. 사용자 승인 후에만 문서 반영.';
