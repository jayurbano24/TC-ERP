-- =============================================================================
-- 166 — Wrappers public → internal (solo service_role)
-- =============================================================================
-- Permite invocar RPCs P0 vía PostgREST sin exponer schema `internal` en Data API.
-- Callers: rpcInternal (fallback tras Postgres directo).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_enterprise_summary_views()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.refresh_enterprise_summary_views();
$$;

CREATE OR REPLACE FUNCTION public.sap_sync_tx(
  p_file_info jsonb,
  p_results jsonb,
  p_validation_details jsonb DEFAULT '[]'::jsonb,
  p_equipos_updates jsonb DEFAULT '[]'::jsonb,
  p_series_updates jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.sap_sync_tx(
    p_file_info,
    p_results,
    p_validation_details,
    p_equipos_updates,
    p_series_updates
  );
$$;

CREATE OR REPLACE FUNCTION public.sap_sync_matches_tx(
  p_file_info jsonb,
  p_results jsonb,
  p_matched_series jsonb DEFAULT '[]'::jsonb,
  p_matched_equipos jsonb DEFAULT '[]'::jsonb,
  p_validation_details jsonb DEFAULT '[]'::jsonb,
  p_reset_unmatched boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.sap_sync_matches_tx(
    p_file_info,
    p_results,
    p_matched_series,
    p_matched_equipos,
    p_validation_details,
    p_reset_unmatched
  );
$$;

CREATE OR REPLACE FUNCTION public.close_open_attendance_tx(
  p_grace_min integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.close_open_attendance_tx(p_grace_min);
$$;

CREATE OR REPLACE FUNCTION public.health_postgres_stats()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, internal
AS $$
  SELECT internal.health_postgres_stats();
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'refresh_enterprise_summary_views',
        'sap_sync_tx',
        'sap_sync_matches_tx',
        'close_open_attendance_tx',
        'health_postgres_stats'
      ])
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      r.proname,
      r.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      r.proname,
      r.args
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION public.refresh_enterprise_summary_views() IS
  'Wrapper service_role → internal.refresh_enterprise_summary_views (166)';
COMMENT ON FUNCTION public.health_postgres_stats() IS
  'Wrapper service_role → internal.health_postgres_stats (166)';
