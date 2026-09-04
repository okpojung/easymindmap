-- ════════════════════════════════════════════════════════════════════
-- 델타 — 스키마 정비 A·B·C (2026-09-04)
--   근거: docs/90-architecture/schema-overhaul-plan.md
--   정본: apps/api/database/schema.sql 끝의 "스키마 정비 A·B·C" 절과 같은 내용.
--
-- 이미 돌고 있는 서버의 DB 에 psql 로 그대로 붙여넣는다.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-09-04-schema-overhaul-abc.sql
--
-- **두 번 실행해도 안전하다** — IF NOT EXISTS · DROP CONSTRAINT IF EXISTS 만
-- 쓰고, 씨앗은 컬럼을 처음 만들 때만 심는다. 기존 데이터는 옮기지도 지우지도
-- 않는다.
--
-- ⚠️ A 는 탈퇴 동작을 바꾼다. RESTRICT 만 먼저 들어가고 API 가 옛 코드면
--    (맵을 먼저 지우지 않는 코드) 탈퇴가 500 이 된다. **같은 정비 창에서
--    API 배포와 함께** 적용한다 — 계획서 §6 의 6·11 을 한 배포로 묶는다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ── A. maps.owner_id → ON DELETE RESTRICT ─────────────────────────────
ALTER TABLE public.maps
    DROP CONSTRAINT IF EXISTS maps_owner_id_fkey;
ALTER TABLE public.maps
    ADD CONSTRAINT maps_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- ── B. 버전 보관 컬럼 (13a-version-retention.md §4.5) ──────────────────
-- 씨앗은 **컬럼을 처음 만드는 순간에만** 심는다 — 그 뒤로 두 값이 NULL 인
-- 것은 관리자가 "무제한" 으로 바꾼 설정일 수 있어, 재적용이 조건 없이
-- UPDATE 하면 그 설정을 조용히 되돌린다(정리 워커가 붙으면 버전이 지워진다).
-- 그래서 "컬럼이 없었다" 를 초기화의 유일한 신호로 삼는다 — quota_bytes 의
-- ON CONFLICT DO NOTHING 과 같은 정신이다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'plan_quotas'
       AND column_name = 'version_days'
  ) THEN
    ALTER TABLE public.plan_quotas
      ADD COLUMN version_days INTEGER CHECK (version_days IS NULL OR version_days > 0);
    UPDATE public.plan_quotas SET version_days =   7 WHERE plan = 'free';
    UPDATE public.plan_quotas SET version_days =  90 WHERE plan = 'basic';
    UPDATE public.plan_quotas SET version_days = 365 WHERE plan IN ('pro', 'team');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'plan_quotas'
       AND column_name = 'max_pinned'
  ) THEN
    ALTER TABLE public.plan_quotas
      ADD COLUMN max_pinned INTEGER CHECK (max_pinned IS NULL OR max_pinned >= 0);
    UPDATE public.plan_quotas SET max_pinned =   3 WHERE plan = 'free';
    UPDATE public.plan_quotas SET max_pinned =  20 WHERE plan = 'basic';
    UPDATE public.plan_quotas SET max_pinned =  50 WHERE plan = 'pro';
    UPDATE public.plan_quotas SET max_pinned = 100 WHERE plan = 'team';
  END IF;
END $$;

ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS pinned    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS label     TEXT;
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS pinned_by UUID REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.map_document_versions
    ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_versions_prune
    ON public.map_document_versions(map_id, created_at DESC)
    WHERE pinned = FALSE;

-- ── C. 소유권 이전 제안 표 (계획서 §4) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.map_ownership_transfers (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    map_id       UUID NOT NULL REFERENCES public.maps(id)  ON DELETE CASCADE,
    from_user    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    to_user      UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days',
    CONSTRAINT map_ownership_transfers_status_chk
        CHECK (status IN ('pending', 'accepted', 'declined', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_one_open
    ON public.map_ownership_transfers(map_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_transfer_to_user
    ON public.map_ownership_transfers(to_user, status);

COMMENT ON TABLE public.map_ownership_transfers IS
    '맵 소유권 이전 제안(제안→수락). 개설자가 탈퇴하려면 협업맵을 넘기거나 지워야 한다 '
    '— schema-overhaul-plan.md §2·§4. 만료 기본 14일.';

COMMIT;

-- ── 검증 — 눈으로 본다. 기대값을 오른쪽에 적어 둔다 ─────────────────────
-- A: delete_rule 이 RESTRICT
SELECT 'A maps_owner_id_fkey' AS item, rc.delete_rule AS value, 'RESTRICT' AS expected
  FROM information_schema.referential_constraints rc
 WHERE rc.constraint_schema = 'public' AND rc.constraint_name = 'maps_owner_id_fkey'
UNION ALL
-- B: plan_quotas 4행에 값이 들어갔다 (free 7/3 · basic 90/20 · pro 365/50 · team 365/100)
--    expected 는 씨앗값이다 — 관리자가 바꾼 값(NULL = 무제한 포함)이면 달라도 정상
SELECT 'B plan_quotas.' || plan,
       COALESCE(version_days::text, 'NULL') || '일 / ' || COALESCE(max_pinned::text, 'NULL') || '개',
       CASE plan WHEN 'free' THEN '7일 / 3개' WHEN 'basic' THEN '90일 / 20개'
                 WHEN 'pro' THEN '365일 / 50개' WHEN 'team' THEN '365일 / 100개' ELSE '(요금제 확인)' END
  FROM public.plan_quotas
UNION ALL
-- B: map_document_versions 새 컬럼 4개
SELECT 'B versions 새 컬럼 수',
       COUNT(*)::text, '4'
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'map_document_versions'
   AND column_name IN ('pinned', 'label', 'pinned_by', 'pinned_at')
UNION ALL
-- B: 부분 인덱스
SELECT 'B idx_versions_prune',
       CASE WHEN to_regclass('public.idx_versions_prune') IS NOT NULL THEN 'ok' ELSE 'MISSING' END, 'ok'
UNION ALL
-- C: 표 + 인덱스 2개
SELECT 'C map_ownership_transfers',
       CASE WHEN to_regclass('public.map_ownership_transfers') IS NOT NULL THEN 'ok' ELSE 'MISSING' END, 'ok'
UNION ALL
SELECT 'C idx_transfer_one_open (부분 유니크)',
       CASE WHEN to_regclass('public.idx_transfer_one_open') IS NOT NULL THEN 'ok' ELSE 'MISSING' END, 'ok'
UNION ALL
SELECT 'C idx_transfer_to_user',
       CASE WHEN to_regclass('public.idx_transfer_to_user') IS NOT NULL THEN 'ok' ELSE 'MISSING' END, 'ok';
