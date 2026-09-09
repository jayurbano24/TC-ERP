-- =============================================================================
-- Despachadas SSOT: serie dispatched O service_orders.status DESPACHADO/CERRADO.
--
-- Caso real (~181 OS): status=DESPACHADO, sin filas en series (o sin dispatched
-- en series) → el ledger las contaba "en planta" y aparecían como sin ubicación.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_service_order_dispatched(p_os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
    OR EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = so.id
        AND s.current_status::text = 'dispatched'
    )
  FROM public.service_orders so
  WHERE so.id = p_os_id;
$$;

CREATE OR REPLACE FUNCTION public.count_sap_integration_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH dispatched_os AS (
  SELECT so.id
  FROM public.service_orders so
  WHERE public.is_service_order_dispatched(so.id)
),
en_planta AS (
  SELECT so.id, so.sap_integration_status
  FROM public.service_orders so
  WHERE NOT public.is_service_order_dispatched(so.id)
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
WITH filtered AS (
  SELECT
    so.id,
    so.os_label,
    so.main_serial,
    so.sap_integration_status,
    so.last_sap_sync,
    so.status
  FROM public.service_orders so
  WHERE so.sap_integration_status = p_status
    AND NOT public.is_service_order_dispatched(so.id)
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

-- Patch count_os_inventory_modules: despachado por OS (no solo series.dispatched).
CREATE OR REPLACE FUNCTION public.count_os_inventory_modules()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH agg AS (
  SELECT
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('in_central_warehouse', 'ready_to_dispatch')
        AND s.current_box_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (
              upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%'
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.series sd
          WHERE sd.service_order_id = s.service_order_id
            AND sd.current_status::text = 'in_dispatch_warehouse'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.series sl
          WHERE sl.service_order_id = s.service_order_id
            AND sl.current_status::text = 'in_central_warehouse'
            AND EXISTS (
              SELECT 1
              FROM public.erp_audit_logs al
              WHERE al.record_id = sl.id::text
                AND al.action IN (
                  'INGRESO A TALLER',
                  'DIAGNÓSTICO INICIAL COMPLETADO',
                  'REPARACIÓN COMPLETADA',
                  'REPARACIÓN L3 COMPLETADA',
                  'CONTROL DE CALIDAD COMPLETADO',
                  'REACONDICIONADO COMPLETADO',
                  'TRASLADO MASIVO A TALLER'
                )
            )
        )
    )::bigint AS bodega_con_caja,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_dispatch_warehouse'
    )::bigint AS bodega_despacho,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_box_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (
              upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%'
            )
        )
    )::bigint AS pistoleo_en_curso,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
    )::bigint AS series_recepcionado_bo,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_workshop'
    )::bigint AS taller_diagnostico,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_qc'
    )::bigint AS taller_reparacion,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'ready_to_dispatch'
    )::bigint AS taller_reacondicionado,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_validation'
    )::bigint AS taller_qc,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_control_warehouse'
    )::bigint AS taller_l3,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'irreparable'
        AND s.current_box_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.series s2
          JOIN public.boxes b ON b.id = s2.current_box_id
          WHERE s2.service_order_id = s.service_order_id
            AND s2.current_box_id IS NOT NULL
            AND (
              upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%'
            )
        )
    )::bigint AS taller_scraps_piso,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_box_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (
              upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%'
            )
        )
    )::bigint AS bodega_scraps,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('scrapped', 'in_scraps', 'irreparable')
    )::bigint AS scrap_ledger,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_central_warehouse'
        AND EXISTS (
          SELECT 1
          FROM public.erp_audit_logs al
          WHERE al.record_id = s.id::text
            AND al.action IN (
              'INGRESO A TALLER',
              'DIAGNÓSTICO INICIAL COMPLETADO',
              'REPARACIÓN COMPLETADA',
              'REPARACIÓN L3 COMPLETADA',
              'CONTROL DE CALIDAD COMPLETADO',
              'REACONDICIONADO COMPLETADO',
              'TRASLADO MASIVO A TALLER'
            )
        )
    )::bigint AS equipo_listo,
    count(DISTINCT s.service_order_id)::bigint AS con_serie
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
),
cac_bo AS (
  SELECT count(*)::bigint AS n
  FROM public.cac_tray_units t
  WHERE t.is_active = true
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE'
    )
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
),
despachado_os AS (
  SELECT count(*)::bigint AS n
  FROM public.service_orders so
  WHERE public.is_service_order_dispatched(so.id)
),
mods AS (
  SELECT
    a.*,
    (SELECT n FROM cac_bo) AS backoffice,
    (
      a.taller_diagnostico
      + a.taller_reparacion
      + a.taller_reacondicionado
      + a.taller_qc
      + a.taller_l3
      + a.taller_scraps_piso
    )::bigint AS taller_piso_total,
    (
      a.bodega_con_caja
      + a.equipo_listo
      + a.bodega_despacho
      + a.pistoleo_en_curso
      + (SELECT n FROM cac_bo)
      + a.taller_diagnostico
      + a.taller_reparacion
      + a.taller_qc
      + a.taller_l3
      + a.taller_scraps_piso
      + a.bodega_scraps
    )::bigint AS activas
  FROM agg a
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT con_serie FROM mods),
  'sin_series', greatest((SELECT n FROM total_os) - (SELECT con_serie FROM mods), 0),
  'bodega_con_caja', (SELECT bodega_con_caja FROM mods),
  'bodega_despacho', (SELECT bodega_despacho FROM mods),
  'bodega_sin_caja', 0,
  'pistoleo_en_curso', (SELECT pistoleo_en_curso FROM mods),
  'backoffice', (SELECT backoffice FROM mods),
  'series_recepcionado_bo', (SELECT series_recepcionado_bo FROM mods),
  'historial_backoffice', 0,
  'equipo_listo', (SELECT equipo_listo FROM mods),
  'despachado', (SELECT n FROM despachado_os),
  'taller_diagnostico', (SELECT taller_diagnostico FROM mods),
  'taller_reparacion', (SELECT taller_reparacion FROM mods),
  'taller_reacondicionado', (SELECT taller_reacondicionado FROM mods),
  'taller_qc', (SELECT taller_qc FROM mods),
  'taller_l3', (SELECT taller_l3 FROM mods),
  'taller_scraps_piso', (SELECT taller_scraps_piso FROM mods),
  'taller_piso_total', (SELECT taller_piso_total FROM mods),
  'bodega_scraps', (SELECT bodega_scraps FROM mods),
  'scrap_ledger', (SELECT scrap_ledger FROM mods),
  'qc', (SELECT taller_qc FROM mods),
  'taller', (SELECT (taller_diagnostico + taller_l3) FROM mods),
  'scrap', (SELECT scrap_ledger FROM mods),
  'control', 0,
  'otro', 0,
  'activas', (SELECT activas FROM mods),
  'activas_ledger', greatest(
    (SELECT n FROM total_os) - (SELECT n FROM despachado_os),
    0
  )
);
$$;

REVOKE ALL ON FUNCTION public.is_service_order_dispatched(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_service_order_dispatched(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.count_sap_integration_kpis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_sap_integration_kpis() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.fetch_os_sap_status_en_planta(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_os_sap_status_en_planta(text, int, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.count_os_inventory_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_os_inventory_modules() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_service_order_dispatched(uuid) IS
  'True si la OS tiene status DESPACHADO/CERRADO o alguna serie dispatched.';

NOTIFY pgrst, 'reload schema';
