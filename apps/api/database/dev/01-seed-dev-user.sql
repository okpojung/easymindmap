-- ============================================================
--  개발용 고정 사용자 시드
--  DEV_USER_ID(.env)와 동일한 UUID. auth.users 에 넣으면
--  schema.sql 의 on_auth_user_created 트리거가 public.users 를 자동 생성.
--  AUTH_MODE=dev 로 API를 띄우면 이 사용자로 인증된다.
-- ============================================================

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@easymindmap.local')
ON CONFLICT (id) DO NOTHING;
