-- =============================================================================
-- Almacenamientos (Dashboard Gerencial): 1 OS = 1 equipo.
-- Antes se contaban filas de series (p. ej. 14,806 series despachadas vs ~4,023 OS).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_os_storage_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH last_touch AS (
  SELECT
    s.service_order_id AS os_id,
    bool_or(s.current_status::text = 'dispatched') AS is_dispatched,
    max(s.updated_at) AS last_at
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
  GROUP BY s.service_order_id
)
SELECT jsonb_build_object(
  'ingresados', (SELECT count(*)::bigint FROM public.service_orders),
  'despachados', (
    SELECT count(*)::bigint
    FROM last_touch
    WHERE is_dispatched
  ),
  'sin_movimiento_60', (
    SELECT count(*)::bigint
    FROM last_touch
    WHERE NOT is_dispatched
      AND last_at < (now() - interval '60 days')
      AND last_at >= (now() - interval '90 days')
  ),
  'sin_movimiento_90', (
    SELECT count(*)::bigint
    FROM last_touch
    WHERE NOT is_dispatched
      AND last_at < (now() - interval '90 days')
  )
);
$$;

REVOKE ALL ON FUNCTION public.count_os_storage_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_os_storage_kpis() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_os_storage_kpis() IS
  'Dashboard Almacenamientos: histórico y antigüedad por OS, no por serie.';

NOTIFY pgrst, 'reload schema';
