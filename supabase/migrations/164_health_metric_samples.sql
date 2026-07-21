-- =============================================================================
-- 164 — health_metric_samples (telemetría Health Center NOC)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.health_metric_samples (
  id bigserial PRIMARY KEY,
  metric text NOT NULL,
  value numeric NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_health_metric_samples_metric_created
  ON public.health_metric_samples (metric, created_at DESC);

ALTER TABLE public.health_metric_samples ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.health_metric_samples FROM PUBLIC, authenticated;
GRANT ALL ON public.health_metric_samples TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.health_metric_samples_id_seq TO service_role;
