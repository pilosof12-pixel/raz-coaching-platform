-- Fixed-term Program Pass entitlements for RAZ AI Coaching Platform
-- Apply after supabase_migration.sql and supabase_privacy_hardening.sql.
--
-- Commercial default:
--   A$30 one-time Program Pass
--   1 new 4-week program
--   56 days access
--   6 successful AI adjustments
--   no automatic renewal
--   another new program requires another purchase

CREATE TABLE IF NOT EXISTS public.program_passes (
  token               text PRIMARY KEY,
  payment_ref         text UNIQUE,
  status              text NOT NULL DEFAULT 'active',
  purchased_at        bigint NOT NULL,
  expires_at          bigint NOT NULL,
  program_credits     integer NOT NULL DEFAULT 1 CHECK (program_credits >= 0),
  programs_used       integer NOT NULL DEFAULT 0 CHECK (programs_used >= 0),
  adjustments_total   integer NOT NULL DEFAULT 6 CHECK (adjustments_total >= 0),
  adjustments_used    integer NOT NULL DEFAULT 0 CHECK (adjustments_used >= 0),
  created_at          bigint NOT NULL,
  updated_at          bigint NOT NULL,
  CHECK (status IN ('active','expired','revoked','refunded')),
  CHECK (programs_used <= program_credits),
  CHECK (adjustments_used <= adjustments_total)
);

CREATE INDEX IF NOT EXISTS program_passes_expires_idx
  ON public.program_passes (expires_at);

ALTER TABLE public.program_passes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.program_passes FROM anon, authenticated;

-- Backend service_role bypasses RLS. Browser roles have no direct table access.

-- Expire passes whose paid access window has ended. The application also checks
-- expires_at on every paid action, so this is housekeeping rather than the only gate.
CREATE OR REPLACE FUNCTION public.expire_program_passes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
BEGIN
  UPDATE public.program_passes
  SET status = 'expired', updated_at = now_ms
  WHERE status = 'active' AND expires_at <= now_ms;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_program_passes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_program_passes() TO service_role;

-- Verification:
-- SELECT token, status, purchased_at, expires_at, program_credits, programs_used,
--        adjustments_total, adjustments_used
-- FROM public.program_passes
-- ORDER BY purchased_at DESC;
