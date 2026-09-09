-- =============================================================================
-- KPIs SAP dashboard · universo EN PLANTA (excluye OS despachadas).
-- Alinea numeradores de tarjetas con denominador (histórico − despachadas).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_sap_integration_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH dispatched_os AS (
  SELECT DISTINCT s.service_order_id AS id
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
    AND s.current_status::text = 'dispatched'
),
en_planta AS (
  SELECT so.id, so.sap_integration_status
  FROM public.service_orders so
  WHERE NOT EXISTS (
    SELECT 1
    FROM dispatched_os d
    WHERE d.id = so.id
  )
)
SELECT jsonb_build_object(
  'historico', (SELECT count(*)::bigint FROM public.service_orders),
  'despachadas', (SELECT count(*)::bigint FROM dispatched_os),
  'enPlanta', (SELECT count(*)::bigint FROM en_planta),
  'validados', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Validado SAP'
  ),
  'pendientes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente Validación'
  ),
  'sinCoincidencia', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'inconsistentes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente Revisión'
  ),
  'obsoletos', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Obsoleto'
  ),
  'historicoValidados', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Validado SAP'
  ),
  'historicoPendientes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente Validación'
  ),
  'historicoSinCoincidencia', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'historicoInconsistentes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente Revisión'
  ),
  'historicoObsoletos', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Obsoleto'
  )
);
$$;

CREATE OR REPLACE FUNCTION public.fetch_os_sap_status_en_planta(
  p_status text,
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  os_label text,
  main_serial text,
  sap_integration_status text,
  last_sap_sync timestamptz,
  status text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH dispatched_os AS (
  SELECT DISTINCT s.service_order_id AS os_id
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
    AND s.current_status::text = 'dispatched'
),
filtered AS (
  SELECT
    so.id,
    so.os_label,
    so.main_serial,
    so.sap_integration_status,
    so.last_sap_sync,
    so.status
  FROM public.service_orders so
  WHERE so.sap_integration_status = p_status
    AND NOT EXISTS (
      SELECT 1 FROM dispatched_os d WHERE d.os_id = so.id
    )
),
cnt AS (
  SELECT count(*)::bigint AS n FROM filtered
)
SELECT
  f.id,
  f.os_label,
  f.main_serial,
  f.sap_integration_status,
  f.last_sap_sync,
  f.status,
  c.n AS total_count
FROM filtered f
CROSS JOIN cnt c
ORDER BY f.os_label ASC NULLS LAST
LIMIT greatest(p_limit, 0)
OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.count_sap_integration_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_sap_integration_kpis() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fetch_os_sap_status_en_planta(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_os_sap_status_en_planta(text, int, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.count_sap_integration_kpis() IS
  'Dashboard SAP: conteos por sap_integration_status solo OS en planta (excluye despachadas).';

COMMENT ON FUNCTION public.fetch_os_sap_status_en_planta(text, int, int) IS
  'Listado paginado OS por estado SAP, excluyendo despachadas (misma base que tarjetas).';

NOTIFY pgrst, 'reload schema';
