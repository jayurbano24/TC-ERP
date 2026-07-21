-- =============================================================================
-- 165 — health_postgres_stats (internal) + índice HTTP samples
-- =============================================================================

CREATE OR REPLACE FUNCTION internal.health_postgres_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'active_connections', (
      SELECT count(*)::int FROM pg_stat_activity
      WHERE datname = current_database() AND state = 'active'
    ),
    'total_connections', (
      SELECT count(*)::int FROM pg_stat_activity
      WHERE datname = current_database()
    ),
    'waiting_locks', (
      SELECT count(*)::int FROM pg_locks WHERE NOT granted
    ),
    'db_size_bytes', pg_database_size(current_database()),
    'checked_at', timezone('utc', now())
  );
$$;

REVOKE ALL ON FUNCTION internal.health_postgres_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.health_postgres_stats() TO service_role;

CREATE INDEX IF NOT EXISTS idx_health_metric_samples_http_status
  ON public.health_metric_samples (created_at DESC)
  WHERE metric = 'http_status';

COMMENT ON FUNCTION internal.health_postgres_stats() IS
  'Snapshot conexiones/locks/tamaño DB para Health Center. Solo service_role.';
