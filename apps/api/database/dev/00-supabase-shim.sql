-- ============================================================
--  개발 전용 Supabase 호환 shim
--  용도: ① 순정 PostgreSQL에서 database/schema.sql(실제 스키마)을
--          수정 없이 그대로 로드할 수 있도록, Supabase가 기본 제공하는
--          객체(auth 스키마·auth.users·auth.uid()·realtime 퍼블리케이션)를
--          최소한으로 흉내낸다.
--        ② GoTrue 가 쓰는 표 중 **우리가 읽는 것**(감사 로그)도 흉내내
--          그 기능을 로컬에서 시험할 수 있게 한다 (2026-09-05).
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

-- ── GoTrue 감사 로그 (2026-09-05) ───────────────────────────────
--
-- ⚠️ **이 표는 schema.sql 을 로드하는 데 필요하지 않다.** 위 auth.users 와
--   달리, 이것은 **로그인 기록 화면을 로컬에서 시험할 수 있게** 하려고
--   둔다. 그 화면(`/v1/account/logins`, 관리자 콘솔의 [이력])은 GoTrue 의
--   감사 로그를 읽는데, 그것이 없으면 코드가 `available:false` 로 끝나
--   **그 아래 경로가 통째로 시험되지 않는다** — 접속 IP 를 붙이는
--   `login_events` 판정도 거기 있다(#393 에서 확인하지 못했던 자리).
--
-- 모양은 supabase/auth 의 마이그레이션을 따랐다. **진짜 GoTrue DB 를 열어
-- 대조한 것은 아니다** — 우리 코드가 읽는 네 가지(`created_at`·`ip_address`
-- ·`payload->>'actor_id'`·`payload->>'action'`)가 맞으면 목적은 달성된다.
--
-- `id` 의 DEFAULT 는 **shim 의 편의**다(진짜 GoTrue 는 값을 직접 넣는다) —
-- 로컬에서 손으로 한 줄 넣어 볼 때 id 를 안 적어도 되게 한다.
--
-- **우리는 읽기만 한다.** 쓰기는 GoTrue 의 몫이다 (audit-log.service.ts).
CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
    instance_id UUID,
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payload     JSON,
    created_at  TIMESTAMPTZ,
    -- GoTrue v2.194.0 은 로그인·로그아웃에서 여기에 **빈 문자열**을 넣는다
    -- (token.go·logout.go). 그래서 접속 IP 는 우리 login_events 가 채운다.
    ip_address  VARCHAR(64) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS audit_logs_instance_id_idx
    ON auth.audit_log_entries (instance_id);

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
