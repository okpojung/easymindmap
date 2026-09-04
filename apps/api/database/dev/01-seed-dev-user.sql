-- ============================================================
--  개발용 고정 사용자 시드
--  DEV_USER_ID(.env)와 동일한 UUID. auth.users 에 넣으면
--  schema.sql 의 on_auth_user_created 트리거가 public.users 를 자동 생성.
--  AUTH_MODE=dev 로 API를 띄우면 이 사용자로 인증된다.
-- ============================================================

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000001', 'dev@easymindmap.local')
ON CONFLICT (id) DO NOTHING;

-- ── 로그인 기록 화면용 감사 로그 (2026-09-05) ────────────────────
--
-- 이것이 없으면 로컬에서 [🕘 로그인 기록] 을 열어도 **늘 비어 있어**,
-- 화면이 제대로 도는지 고쳤는지 알 수 없다. GoTrue 가 남길 법한 줄을
-- 몇 개 심어 둔다 — `payload->>'actor_id'` 로 찾고 `action` 으로 고른다
-- (audit-log.service.ts 의 SHOWN_ACTIONS).
--
-- `ip_address` 를 **빈 문자열로 두는 것이 요점**이다. 진짜 GoTrue 가 그렇게
-- 넣기 때문이고, 그래서 화면의 IP 는 우리 `login_events` 에서 온다. 여기에
-- IP 를 채워 두면 그 경로가 시험되지 않는다.
--
-- `token_refreshed` 한 줄은 **걸러지는지 보려고** 넣는다 — 화면에 이 줄이
-- 보이면 필터가 깨진 것이다.
INSERT INTO auth.audit_log_entries (payload, created_at, ip_address)
SELECT p::json, t, ''
  FROM (VALUES
    ('{"actor_id":"00000000-0000-0000-0000-000000000001","actor_username":"dev@easymindmap.local","action":"user_signedup","log_type":"team"}',  NOW() - INTERVAL '9 days'),
    ('{"actor_id":"00000000-0000-0000-0000-000000000001","actor_username":"dev@easymindmap.local","action":"login","log_type":"account"}',        NOW() - INTERVAL '9 days'),
    ('{"actor_id":"00000000-0000-0000-0000-000000000001","actor_username":"dev@easymindmap.local","action":"logout","log_type":"account"}',       NOW() - INTERVAL '8 days'),
    ('{"actor_id":"00000000-0000-0000-0000-000000000001","actor_username":"dev@easymindmap.local","action":"token_refreshed","log_type":"token"}', NOW() - INTERVAL '2 days'),
    ('{"actor_id":"00000000-0000-0000-0000-000000000001","actor_username":"dev@easymindmap.local","action":"login","log_type":"account"}',        NOW() - INTERVAL '1 days')
  ) AS v(p, t)
 WHERE NOT EXISTS (SELECT 1 FROM auth.audit_log_entries);
