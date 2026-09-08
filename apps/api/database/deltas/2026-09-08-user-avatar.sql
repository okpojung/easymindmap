-- ════════════════════════════════════════════════════════════════════
-- 델타 — 프로필 사진/아바타  2026-09-08
--   근거: docs/user-guide/01-시작하기.md "계정 프로필" (사용자 요청)
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 이미 돌고 있는 서버의 DB 에 그대로 붙여넣는다.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
--
-- **두 번 실행해도 안전하다** — ADD COLUMN IF NOT EXISTS 만 쓴다.
-- **지우는 것이 없다** — 칸 하나를 더할 뿐이고 기존 행은 NULL(이름 첫 자).
--
-- 적용 전에도 앱은 죽지 않는다 — 칸이 없으면 프로필 조회는 열 없이 다시
-- 읽고(사진은 없음), 계정 프로필 창은 "사진 저장 열이 없습니다" 라고
-- 안내하며 사진 선택만 막는다(account.service.ts 42703 처리).
--
-- 적용 뒤 **재기동이 필요 없다** — 다음 조회부터 열을 읽는다.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS avatar TEXT;
COMMENT ON COLUMN public.users.avatar IS
    '프로필 사진(data URL, ≤64KB) 또는 이모지 아바타(emoji:😀). NULL = 이름 첫 자.';

COMMIT;

-- 검증 — 한 줄이 나오면 적용된 것
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'avatar';
