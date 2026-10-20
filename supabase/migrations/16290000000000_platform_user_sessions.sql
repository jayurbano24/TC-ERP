-- =============================================================================
-- 16290000000000 — user_sessions (platform_fragments/001_user_sessions.sql)
-- Orden lex: antes de 163_user_sessions_last_seen_idle.sql
-- =============================================================================

-- Presencia ERP (single-PC / heartbeat). DDL ausente en migrations/; usado desde 163+ y app.
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  last_seen timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_one_per_user_idx
  ON public.user_sessions (user_id);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_sessions_own ON public.user_sessions;
CREATE POLICY user_sessions_own ON public.user_sessions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sessions TO authenticated, service_role;
