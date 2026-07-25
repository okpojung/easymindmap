-- ============================================================
--  개발 전용 Supabase 호환 shim
--  용도: 순정 PostgreSQL에서 database/schema.sql(실제 스키마)을
--        수정 없이 그대로 로드할 수 있도록, Supabase가 기본 제공하는
--        객체(auth 스키마·auth.users·auth.uid()·realtime 퍼블리케이션)를
--        최소한으로 흉내낸다.
--  ⚠️ 실제 Supabase(프로덕션)에는 절대 적용하지 않는다. 로컬/CI 전용.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

CREATE SCHEMA IF NOT EXISTS auth;

-- Supabase Auth가 관리하는 auth.users 의 최소 형태
CREATE TABLE IF NOT EXISTS auth.users (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email      TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS 정책의 auth.uid() 참조가 컴파일되도록 하는 더미 함수.
-- 개발 세션 GUC 'app.user_id' 를 반환(미설정 시 NULL).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid
$$;

-- ALTER PUBLICATION supabase_realtime ADD TABLE ... 가 성공하도록
-- 빈 퍼블리케이션을 만들어 둔다.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
