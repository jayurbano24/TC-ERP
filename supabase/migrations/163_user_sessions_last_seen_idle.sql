-- =============================================================================
-- 163 — user_sessions.last_seen + idle 45 min
-- =============================================================================
-- Presencia real: el shell toca last_seen con actividad del usuario.
-- Cron / cleanup: DELETE (y revoke Auth) si last_seen < now() - 45 minutes.
-- =============================================================================

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS last_seen timestamptz;

UPDATE public.user_sessions
SET last_seen = COALESCE(last_seen, created_at, timezone('utc', now()))
WHERE last_seen IS NULL;

ALTER TABLE public.user_sessions
  ALTER COLUMN last_seen SET DEFAULT timezone('utc', now());

ALTER TABLE public.user_sessions
  ALTER COLUMN last_seen SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen
  ON public.user_sessions (last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id
  ON public.user_sessions (user_id);

-- Heartbeat process (Salud / cron)
INSERT INTO public.sync_process_config (
  process_id, priority, interval_minutes, source_table, cursor_type, enabled, description
)
VALUES (
  'cron_session_idle_cleanup',
  3,
  5,
  'user_sessions',
  'updated_at',
  false,
  'Heartbeat: limpia sesiones ERP idle > 45 min'
)
ON CONFLICT (process_id) DO UPDATE
SET
  interval_minutes = EXCLUDED.interval_minutes,
  source_table = EXCLUDED.source_table,
  enabled = false,
  description = EXCLUDED.description;
