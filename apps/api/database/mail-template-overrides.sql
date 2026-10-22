-- Explicit additive migration; never auto-run. Keep table/data on rollback.
BEGIN;
CREATE TABLE IF NOT EXISTS public.mail_template_overrides (
 id text PRIMARY KEY, subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 200),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 20000),
 updated_by text NOT NULL, updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.mail_template_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mail_template_overrides FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE 'REVOKE ALL ON public.mail_template_overrides FROM anon'; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE 'REVOKE ALL ON public.mail_template_overrides FROM authenticated'; END IF;
END $$;
COMMIT;
