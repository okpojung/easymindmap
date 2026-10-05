-- ════════════════════════════════════════════════════════════════════
-- 델타 — 화면 언어를 계정에  2026-10-05
--   근거: docs/04-extensions/i18n.md P3 (사용자 요청: "로그인 후 프로필에
--         언어 설정 시 DB 에 저장하고 모든 기기에 적용")
--   정본: apps/api/database/schema.sql — 같은 내용이다.
--
-- 어디서: docker 가 도는 호스트의 SSH 터미널 — dev 는 `ubuntu@em-dev`.
--   bash apps/api/database/deltas/apply-delta.sh 이파일   (컨테이너 자동 탐색)
--   또는 psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 이파일
-- 2026-10-05 dev 적용 완료 (✅ DB=roxca4… 계정=postgres DB이름=postgres · language | text).
--   적용 뒤 실측: PUT /v1/account/language → saved:true, 프로필 language 즉시 반영,
--   일본어 브라우저로 로그인하자 계정 언어(en)로 바뀜.
--
-- **두 번 실행해도 안전하다** — ADD COLUMN IF NOT EXISTS 만 쓴다.
-- **지우는 것이 없다** — 칸 하나를 더할 뿐이고 기존 행은 NULL(브라우저 언어).
--
-- 적용 전에도 앱은 죽지 않는다 — 칸이 없으면 프로필 조회는 열 없이 읽고,
-- 언어 저장(PUT /v1/account/language)은 `{saved:false}` 로 답해 앱이 언어를
-- 이 브라우저에만 기억한다(account.service.ts saveLanguage).
--
-- 적용 뒤 **재기동이 필요 없다** — 저장은 바로, 조회는 늦어도 1분 뒤부터
-- 열을 읽는다(프로필 조회가 "열 없음"을 1분 기억한다).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS language TEXT;
COMMENT ON COLUMN public.users.language IS
    '화면 언어(ko·en·zh·ja). NULL = 고른 적 없음 — 브라우저 언어를 따른다.';

COMMIT;

-- 검증 — 한 줄이 나오면 적용된 것
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'language';
