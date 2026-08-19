-- Privacy-preserving aggregate launch analytics.
-- Stores only UTC day + allowlisted event name + aggregate count.

CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day text NOT NULL,
  event text NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (day, event)
);

ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.analytics_daily FROM anon, authenticated;
GRANT ALL ON TABLE public.analytics_daily TO service_role;

-- Verification:
-- SELECT day, event, count FROM public.analytics_daily ORDER BY day DESC, event;
