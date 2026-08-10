-- Fixed-term Program Pass entitlements.
-- Apply in Supabase before PROGRAM_PASS_ENFORCEMENT=1.

CREATE TABLE IF NOT EXISTS public.program_passes (
  code text PRIMARY KEY,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','active','revoked')),
  activated_token text UNIQUE,
  created_at bigint NOT NULL,
  activated_at bigint,
  expires_at bigint,
  adjustment_limit integer NOT NULL DEFAULT 6 CHECK (adjustment_limit >= 0),
  adjustment_count integer NOT NULL DEFAULT 0 CHECK (adjustment_count >= 0),
  initial_build_completed_at bigint
);

-- Safe upgrades if an earlier draft of this migration was already applied.
ALTER TABLE public.program_passes
  ADD COLUMN IF NOT EXISTS adjustment_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.program_passes
  ADD COLUMN IF NOT EXISTS initial_build_completed_at bigint;

CREATE INDEX IF NOT EXISTS idx_program_passes_activated_token
  ON public.program_passes (activated_token)
  WHERE activated_token IS NOT NULL;

ALTER TABLE public.program_passes ENABLE ROW LEVEL SECURITY;

-- Program Pass records are server-side commercial records. The browser never
-- reads this table directly; the Express server uses service_role.
REVOKE ALL ON TABLE public.program_passes FROM anon, authenticated;
GRANT ALL ON TABLE public.program_passes TO service_role;

-- Commercial counters deliberately live here, not in coaching history. Deleting
-- sensitive client/program/history data must not reset the one-block or six-adjustment limits.

-- Verification examples:
-- SELECT code, status, activated_token, activated_at, expires_at,
--        adjustment_limit, adjustment_count, initial_build_completed_at
-- FROM public.program_passes ORDER BY created_at DESC LIMIT 20;
--
-- SELECT count(*) FROM public.program_passes
-- WHERE status='active' AND expires_at > (extract(epoch from now()) * 1000)::bigint;
