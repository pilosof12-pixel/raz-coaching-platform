-- Privacy and security hardening for RAZ AI Coaching Platform
-- Apply this after supabase_migration.sql.
-- The application server uses the Supabase service_role key server-side.
-- service_role bypasses RLS; browser/anon access should have no table access.

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Explicitly prevent direct browser/API roles from reading or mutating coaching data.
REVOKE ALL ON TABLE public.clients FROM anon, authenticated;
REVOKE ALL ON TABLE public.history FROM anon, authenticated;
REVOKE ALL ON TABLE public.usage FROM anon, authenticated;
REVOKE ALL ON TABLE public.jobs FROM anon, authenticated;

-- Identity sequence used by history inserts. The backend service role is unaffected.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'history_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.history_id_seq FROM anon, authenticated;
  END IF;
END $$;

-- Data minimisation helper.
-- The client's current intake/program remain until the client requests deletion,
-- because lifetime access requires them. Operational copies should not live forever.
CREATE OR REPLACE FUNCTION public.purge_expired_operational_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
BEGIN
  -- Async job payloads are only needed while a generation is being polled.
  DELETE FROM public.jobs
  WHERE created_at < now_ms - (7::bigint * 24 * 60 * 60 * 1000);

  -- Adjustment/build history is useful for troubleshooting but contains sensitive
  -- intake and health-related text. Keep a bounded window rather than indefinitely.
  DELETE FROM public.history
  WHERE created_at < now_ms - (180::bigint * 24 * 60 * 60 * 1000);

  -- Daily usage counters have no long-term product value.
  DELETE FROM public.usage
  WHERE day < to_char((current_date - interval '90 days'), 'YYYY-MM-DD');
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_operational_data() FROM PUBLIC;

-- Optional scheduled cleanup when pg_cron is enabled in the Supabase project:
-- SELECT cron.schedule(
--   'raz-privacy-retention-cleanup',
--   '17 3 * * *',
--   $$SELECT public.purge_expired_operational_data();$$
-- );

-- Verification queries to run after applying this migration:
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE relname IN ('clients','history','usage','jobs');
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN ('clients','history','usage','jobs')
--   AND grantee IN ('anon','authenticated');
