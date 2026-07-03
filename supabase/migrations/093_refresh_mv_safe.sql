-- =============================================================================
-- 093 — Fix refresh: omitir MVs inexistentes + asegurar creación si faltan (092)
-- Ejecutar si refresh falló con "relation mv_dashboard does not exist"
-- =============================================================================

DROP FUNCTION IF EXISTS public.refresh_enterprise_summary_views();

CREATE OR REPLACE FUNCTION public.refresh_enterprise_summary_views()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_views text[] := ARRAY[
    'mv_bodega_inventory',
    'mv_workshop_diagnostico',
    'mv_dashboard',
    'mv_workshop',
    'mv_bodega',
    'mv_rrhh',
    'mv_sap'
  ];
  v_view text;
  v_refreshed text[] := ARRAY[]::text[];
  v_skipped text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_view IN ARRAY v_views LOOP
    IF to_regclass('public.' || v_view) IS NULL THEN
      v_skipped := array_append(v_skipped, v_view);
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', v_view);
    EXCEPTION
      WHEN OTHERS THEN
        EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', v_view);
    END;

    v_refreshed := array_append(v_refreshed, v_view);
  END LOOP;

  RETURN jsonb_build_object(
    'refreshed_at', now(),
    'duration_ms', (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
    'refreshed', to_jsonb(v_refreshed),
    'skipped', to_jsonb(v_skipped)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_enterprise_summary_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_enterprise_summary_views() TO service_role;

NOTIFY pgrst, 'reload schema';
