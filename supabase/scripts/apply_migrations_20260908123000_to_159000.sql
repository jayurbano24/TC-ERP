-- =============================================================================
-- BUNDLE: migraciones 20260908123000 … 20260908159000 (aplicar EN ORDEN)
-- Generado para despliegue manual en Supabase SQL Editor
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908123000_returns_report_period_filter.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Filtro por periodo (semana / mes) en reporte de devoluciones.
-- Filtra sobre returns_report_etl.event_at sin re-ejecutar el ETL completo.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_returns_report_etl_event_at
  ON public.returns_report_etl (event_at);

CREATE OR REPLACE FUNCTION public.get_returns_report_stats(
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_refreshed timestamptz;
  v_agencies jsonb;
  v_reasons jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT count(*), max(refreshed_at)
  INTO v_total, v_refreshed
  FROM public.returns_report_etl e
  WHERE (p_start IS NULL OR e.event_at >= p_start)
    AND (p_end IS NULL OR e.event_at <= p_end);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', agency, 'count', cnt)
    ORDER BY cnt DESC, agency ASC
  ), '[]'::jsonb)
  INTO v_agencies
  FROM (
    SELECT agency, count(*)::int AS cnt
    FROM public.returns_report_etl e
    WHERE (p_start IS NULL OR e.event_at >= p_start)
      AND (p_end IS NULL OR e.event_at <= p_end)
    GROUP BY agency
  ) a;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('name', motivo, 'count', cnt)
    ORDER BY cnt DESC, motivo ASC
  ), '[]'::jsonb)
  INTO v_reasons
  FROM (
    SELECT motivo, count(*)::int AS cnt
    FROM public.returns_report_etl e
    WHERE (p_start IS NULL OR e.event_at >= p_start)
      AND (p_end IS NULL OR e.event_at <= p_end)
    GROUP BY motivo
  ) r;

  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'agencies', v_agencies,
    'reasons', v_reasons,
    'refreshed_at', v_refreshed,
    'source', 'returns_report_etl',
    'period_start', p_start,
    'period_end', p_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_returns_report_stats(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_returns_report_stats(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.get_returns_report_stats(timestamptz, timestamptz) IS
  'Cantidades agregadas de devoluciones; opcional p_start/p_end filtran por event_at.';

NOTIFY pgrst, 'reload schema';

-- Normaliza motivo N/A en el ETL de reportes (datos histÃ³ricos + nuevos refreshes).
CREATE OR REPLACE FUNCTION public.refresh_returns_report_etl()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_count int := 0;
  v_sap_count int := 0;
  v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.returns_report_etl WHERE true;

  INSERT INTO public.returns_report_etl (id, source_type, agency, motivo, event_at, refreshed_at)
  SELECT
    'box:' || rg.id::text,
    'box',
    COALESCE(
      NULLIF(TRIM(rg.agency), ''),
      NULLIF(TRIM(r.carrier), ''),
      'Sin asignar'
    ),
    CASE
      WHEN NULLIF(TRIM(rg.motivo), '') IS NULL THEN 'Sin motivo declarado'
      WHEN lower(trim(rg.motivo)) IN ('n/a', 'na', '---') THEN 'Sin motivo declarado'
      ELSE trim(rg.motivo)
    END,
    COALESCE(rg.classified_at, r.created_at, v_now),
    v_now
  FROM public.reception_guides rg
  INNER JOIN public.receptions r ON r.id = rg.reception_id
  WHERE lower(COALESCE(rg.category, '')) = 'devolucion'
    AND upper(COALESCE(r.status, '')) NOT IN ('ARCHIVADO', 'ELIMINADO', 'DEVUELTO');

  GET DIAGNOSTICS v_box_count = ROW_COUNT;

  INSERT INTO public.returns_report_etl (id, source_type, agency, motivo, event_at, refreshed_at)
  SELECT DISTINCT ON (COALESCE(s.service_order_id::text, std.id::text))
    'sap:' || COALESCE(s.service_order_id::text, std.id::text),
    'sap_block',
    COALESCE(
      NULLIF(TRIM(std.agency), ''),
      NULLIF(TRIM(rg.agency), ''),
      NULLIF(TRIM(rec.carrier), ''),
      'Sin asignar'
    ),
    CASE
      WHEN NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), '') IS NULL
        AND NULLIF(TRIM(rg.motivo), '') IS NULL THEN 'Sin motivo declarado'
      WHEN lower(coalesce(
        NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), ''),
        NULLIF(TRIM(rg.motivo), ''),
        ''
      )) IN ('n/a', 'na', '---') THEN 'Sin motivo declarado'
      ELSE coalesce(
        NULLIF(TRIM(substring(COALESCE(s.notes, '') from 'Motivo:\s*([^\n]+)')), ''),
        NULLIF(TRIM(rg.motivo), ''),
        'DevoluciÃ³n bloque SAP'
      )
    END,
    COALESCE(s.updated_at, std.updated_at, v_now),
    v_now
  FROM public.series s
  INNER JOIN public.sap_transfer_documents std ON std.id = s.sap_transfer_id
  LEFT JOIN public.reception_guides rg ON rg.id = std.reception_guide_id
  LEFT JOIN public.receptions rec ON rec.id = std.reception_id
  WHERE lower(COALESCE(s.current_status::text, '')) = 'returned'
    AND upper(COALESCE(std.status, '')) = 'DEVUELTO_BLOQUE'
  ORDER BY COALESCE(s.service_order_id::text, std.id::text), s.updated_at DESC NULLS LAST;

  GET DIAGNOSTICS v_sap_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'box_count', v_box_count,
    'sap_count', v_sap_count,
    'total', v_box_count + v_sap_count,
    'refreshed_at', v_now
  );
END;
$$;

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908144500_os_modules_exclusive_bodega_listo.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Inventario OS Â· buckets exclusivos Bodega Central vs Equipo Listo.
--
-- Problema: equipo_listo (post-taller en bodega) era subconjunto de bodega_con_caja;
-- al sumar mÃ³dulos en UI se duplicaban ~1.5k OS.
--
-- Regla: una OS cuenta en bodega_con_caja (stock) O en equipo_listo, nunca ambos.
-- activas suma ambos buckets ya sin solapamiento.
-- =============================================================================

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
        -- Exclusivo: post-taller listo outbound â†’ bucket equipo_listo, no stock.
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
                  'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA',
                  'REPARACIÃ“N L3 COMPLETADA',
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
      WHERE s.current_status::text = 'dispatched'
    )::bigint AS despachado,
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
              'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA',
              'REPARACIÃ“N L3 COMPLETADA',
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
  'despachado', (SELECT despachado FROM mods),
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
    (SELECT n FROM total_os) - (SELECT despachado FROM mods),
    0
  )
);
$$;

REVOKE ALL ON FUNCTION public.count_os_inventory_modules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_os_inventory_modules() TO authenticated, service_role;

COMMENT ON FUNCTION public.count_os_inventory_modules() IS
  'Inventario OS SSOT: buckets exclusivos (bodega stock vs equipo listo); activas sin doble conteo.';

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908150000_sap_dashboard_kpis_en_planta.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- KPIs SAP dashboard Â· universo EN PLANTA (excluye OS despachadas).
-- Alinea numeradores de tarjetas con denominador (histÃ³rico âˆ’ despachadas).
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
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'sinCoincidencia', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'inconsistentes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
  ),
  'obsoletos', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Obsoleto'
  ),
  'historicoValidados', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Validado SAP'
  ),
  'historicoPendientes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'historicoSinCoincidencia', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'historicoInconsistentes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908152000_os_despachado_status_ssot.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Despachadas SSOT: serie dispatched O service_orders.status DESPACHADO/CERRADO.
--
-- Caso real (~181 OS): status=DESPACHADO, sin filas en series (o sin dispatched
-- en series) â†’ el ledger las contaba "en planta" y aparecÃ­an como sin ubicaciÃ³n.
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
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'sinCoincidencia', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'inconsistentes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
  ),
  'obsoletos', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Obsoleto'
  ),
  'historicoValidados', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Validado SAP'
  ),
  'historicoPendientes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'historicoSinCoincidencia', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'historicoInconsistentes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
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
                  'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA',
                  'REPARACIÃ“N L3 COMPLETADA',
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
              'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA',
              'REPARACIÃ“N L3 COMPLETADA',
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908153000_fix_despachado_ssot_performance.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Hotfix: despachadas SSOT sin per-row function (evita timeout PostgREST).
-- La migraciÃ³n 152000 llamaba is_service_order_dispatched(id) por cada OS â†’ RPC
-- fallaba â†’ UI en fallback (solo taller, resto en cero, sin ubicaciÃ³n ~43k).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_service_order_dispatched(p_os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT
        upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
        OR EXISTS (
          SELECT 1
          FROM public.series s
          WHERE s.service_order_id = so.id
            AND s.current_status::text = 'dispatched'
        )
      FROM public.service_orders so
      WHERE so.id = p_os_id
    ),
    false
  );
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
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
),
en_planta AS (
  SELECT so.id, so.sap_integration_status
  FROM public.service_orders so
  WHERE so.id NOT IN (SELECT id FROM dispatched_os)
)
SELECT jsonb_build_object(
  'historico', (SELECT count(*)::bigint FROM public.service_orders),
  'despachadas', (SELECT count(*)::bigint FROM dispatched_os),
  'enPlanta', (SELECT count(*)::bigint FROM en_planta),
  'validados', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Validado SAP'
  ),
  'pendientes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'sinCoincidencia', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'inconsistentes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
  ),
  'obsoletos', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Obsoleto'
  ),
  'historicoValidados', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Validado SAP'
  ),
  'historicoPendientes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'historicoSinCoincidencia', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'historicoInconsistentes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
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
    AND NOT (
      upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
      OR EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.service_order_id = so.id
          AND s.current_status::text = 'dispatched'
      )
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

-- Solo reemplaza el CTE despachado_os (resto = migraciÃ³n 152000 / 44500).
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
                  'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA',
                  'REPARACIÃ“N L3 COMPLETADA',
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
              'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA',
              'REPARACIÃ“N L3 COMPLETADA',
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
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
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

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908154000_os_modules_close_sin_ubicacion_gap.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Cierra gap "Sin ubicaciÃ³n": reac suelto + recepcionado BO + sin serie en planta.
-- Residual tÃ­pico post-153000: ready_to_dispatch sin caja y RECEPCIONADO_BODEGA_GENERAL
-- no entraban en activas ni en flujoSumado de la UI.
-- =============================================================================

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
                  'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA',
                  'REPARACIÃ“N L3 COMPLETADA',
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
      WHERE s.current_status::text = 'ready_to_dispatch'
        AND s.current_box_id IS NULL
    )::bigint AS reac_suelto,
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
              'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA',
              'REPARACIÃ“N L3 COMPLETADA',
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
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
),
sin_serie_en_planta AS (
  SELECT count(*)::bigint AS n
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) NOT IN ('DESPACHADO', 'CERRADO')
    AND NOT EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = so.id
        AND s.current_status::text = 'dispatched'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
    )
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
      + a.series_recepcionado_bo
      + a.reac_suelto
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
  'sin_series_en_planta', (SELECT n FROM sin_serie_en_planta),
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
  'reac_suelto', (SELECT reac_suelto FROM mods),
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

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908155000_fix_pendiente_bodega_dedup.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Fix Pendiente Bodega: no sumar CAC (filas bandeja) + BO (OS series) â€” duplicaba ~3k.
-- SSOT tile: pendiente_bodega_os = OS Ãºnicas en bandeja CAC âˆª RECEPCIONADO_BODEGA_GENERAL.
-- backoffice y series_recepcionado_bo quedan como referencia cruzada en UI.
-- =============================================================================

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
                  'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA',
                  'REPARACIÃ“N L3 COMPLETADA',
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
      WHERE s.current_status::text = 'ready_to_dispatch'
        AND s.current_box_id IS NULL
    )::bigint AS reac_suelto,
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
              'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA',
              'REPARACIÃ“N L3 COMPLETADA',
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
cac_bo_os AS (
  SELECT count(DISTINCT t.service_order_id)::bigint AS n
  FROM public.cac_tray_units t
  WHERE t.is_active = true
    AND t.service_order_id IS NOT NULL
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
pendiente_bodega AS (
  SELECT count(DISTINCT src.os_id)::bigint AS n
  FROM (
    SELECT t.service_order_id AS os_id
    FROM public.cac_tray_units t
    WHERE t.is_active = true
      AND t.service_order_id IS NOT NULL
      AND coalesce(t.unit_status, '') NOT IN (
        'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
        'ingresado_bodega', 'INGRESADO_BODEGA',
        'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE'
      )
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
    UNION
    SELECT s.service_order_id AS os_id
    FROM public.series s
    WHERE s.service_order_id IS NOT NULL
      AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  ) src
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
),
despachado_os AS (
  SELECT count(*)::bigint AS n
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
),
sin_serie_en_planta AS (
  SELECT count(*)::bigint AS n
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) NOT IN ('DESPACHADO', 'CERRADO')
    AND NOT EXISTS (
      SELECT 1
      FROM public.series s
      WHERE s.service_order_id = so.id
        AND s.current_status::text = 'dispatched'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
    )
),
mods AS (
  SELECT
    a.*,
    (SELECT n FROM cac_bo) AS backoffice,
    (SELECT n FROM cac_bo_os) AS backoffice_os,
    (SELECT n FROM pendiente_bodega) AS pendiente_bodega_os,
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
      + (SELECT n FROM pendiente_bodega)
      + a.reac_suelto
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
  'sin_series_en_planta', (SELECT n FROM sin_serie_en_planta),
  'bodega_con_caja', (SELECT bodega_con_caja FROM mods),
  'bodega_despacho', (SELECT bodega_despacho FROM mods),
  'bodega_sin_caja', 0,
  'pistoleo_en_curso', (SELECT pistoleo_en_curso FROM mods),
  'backoffice', (SELECT backoffice FROM mods),
  'backoffice_os', (SELECT backoffice_os FROM mods),
  'pendiente_bodega_os', (SELECT pendiente_bodega_os FROM mods),
  'series_recepcionado_bo', (SELECT series_recepcionado_bo FROM mods),
  'historial_backoffice', 0,
  'equipo_listo', (SELECT equipo_listo FROM mods),
  'despachado', (SELECT n FROM despachado_os),
  'taller_diagnostico', (SELECT taller_diagnostico FROM mods),
  'taller_reparacion', (SELECT taller_reparacion FROM mods),
  'taller_reacondicionado', (SELECT taller_reacondicionado FROM mods),
  'reac_suelto', (SELECT reac_suelto FROM mods),
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

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908156000_os_devuelto_fuera_planta.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- SSOT fuera de planta: agrega estatus devueltos (no cuentan en ledger ni SAP en planta).
-- DEVUELTO, DEVUELTO_A_AGENCIA, DEVUELTO_BLOQUE + despachadas existentes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_service_order_devuelto(p_os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT upper(trim(coalesce(so.status, ''))) IN (
        'DEVUELTO',
        'DEVUELTO_A_AGENCIA',
        'DEVUELTO_BLOQUE'
      )
      FROM public.service_orders so
      WHERE so.id = p_os_id
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_service_order_fuera_planta(p_os_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    public.is_service_order_dispatched(p_os_id)
    OR public.is_service_order_devuelto(p_os_id);
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
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
),
devuelto_os AS (
  SELECT so.id
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
    'DEVUELTO',
    'DEVUELTO_A_AGENCIA',
    'DEVUELTO_BLOQUE'
  )
),
fuera_planta AS (
  SELECT so.id
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
      'DESPACHADO', 'CERRADO',
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
),
en_planta AS (
  SELECT so.id, so.sap_integration_status
  FROM public.service_orders so
  WHERE so.id NOT IN (SELECT id FROM fuera_planta)
)
SELECT jsonb_build_object(
  'historico', (SELECT count(*)::bigint FROM public.service_orders),
  'despachadas', (SELECT count(*)::bigint FROM dispatched_os),
  'devueltas', (SELECT count(*)::bigint FROM devuelto_os),
  'enPlanta', (SELECT count(*)::bigint FROM en_planta),
  'validados', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Validado SAP'
  ),
  'pendientes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'sinCoincidencia', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'inconsistentes', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
  ),
  'obsoletos', (
    SELECT count(*)::bigint FROM en_planta WHERE sap_integration_status = 'Obsoleto'
  ),
  'historicoValidados', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Validado SAP'
  ),
  'historicoPendientes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente ValidaciÃ³n'
  ),
  'historicoSinCoincidencia', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Sin Coincidencia'
  ),
  'historicoInconsistentes', (
    SELECT count(*)::bigint FROM public.service_orders WHERE sap_integration_status = 'Pendiente RevisiÃ³n'
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
    AND NOT (
      upper(trim(coalesce(so.status, ''))) IN (
        'DESPACHADO', 'CERRADO',
        'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
      )
      OR EXISTS (
        SELECT 1
        FROM public.series s
        WHERE s.service_order_id = so.id
          AND s.current_status::text = 'dispatched'
      )
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

-- Solo parches al final de count_os_inventory_modules (155000): fuera_planta + devuelto.
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
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.series sd
          WHERE sd.service_order_id = s.service_order_id
            AND sd.current_status::text = 'in_dispatch_warehouse'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.series sl
          WHERE sl.service_order_id = s.service_order_id
            AND sl.current_status::text = 'in_central_warehouse'
            AND EXISTS (
              SELECT 1 FROM public.erp_audit_logs al
              WHERE al.record_id = sl.id::text
                AND al.action IN (
                  'INGRESO A TALLER', 'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA', 'REPARACIÃ“N L3 COMPLETADA',
                  'CONTROL DE CALIDAD COMPLETADO', 'REACONDICIONADO COMPLETADO',
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
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
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
      WHERE s.current_status::text = 'ready_to_dispatch' AND s.current_box_id IS NULL
    )::bigint AS reac_suelto,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_validation'
    )::bigint AS taller_qc,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_control_warehouse'
    )::bigint AS taller_l3,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'irreparable' AND s.current_box_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.series s2
          JOIN public.boxes b ON b.id = s2.current_box_id
          WHERE s2.service_order_id = s.service_order_id AND s2.current_box_id IS NOT NULL
            AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
        )
    )::bigint AS taller_scraps_piso,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_box_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
        )
    )::bigint AS bodega_scraps,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('scrapped', 'in_scraps', 'irreparable')
    )::bigint AS scrap_ledger,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_central_warehouse'
        AND EXISTS (
          SELECT 1 FROM public.erp_audit_logs al
          WHERE al.record_id = s.id::text
            AND al.action IN (
              'INGRESO A TALLER', 'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA', 'REPARACIÃ“N L3 COMPLETADA',
              'CONTROL DE CALIDAD COMPLETADO', 'REACONDICIONADO COMPLETADO',
              'TRASLADO MASIVO A TALLER'
            )
        )
    )::bigint AS equipo_listo,
    count(DISTINCT s.service_order_id)::bigint AS con_serie
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
),
cac_bo AS (
  SELECT count(*)::bigint AS n FROM public.cac_tray_units t
  WHERE t.is_active = true
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
cac_bo_os AS (
  SELECT count(DISTINCT t.service_order_id)::bigint AS n FROM public.cac_tray_units t
  WHERE t.is_active = true AND t.service_order_id IS NOT NULL
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
pendiente_bodega AS (
  SELECT count(DISTINCT src.os_id)::bigint AS n
  FROM (
    SELECT t.service_order_id AS os_id FROM public.cac_tray_units t
    WHERE t.is_active = true AND t.service_order_id IS NOT NULL
      AND coalesce(t.unit_status, '') NOT IN (
        'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
        'ingresado_bodega', 'INGRESADO_BODEGA',
        'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
    UNION
    SELECT s.service_order_id FROM public.series s
    WHERE s.service_order_id IS NOT NULL
      AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  ) src
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
),
despachado_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1 FROM public.series s
       WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
     )
),
devuelto_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
    'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
  )
),
fuera_planta_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
      'DESPACHADO', 'CERRADO',
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
     OR EXISTS (
       SELECT 1 FROM public.series s
       WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
     )
),
sin_serie_en_planta AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) NOT IN (
      'DESPACHADO', 'CERRADO',
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.series s
      WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
    )
    AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id)
),
mods AS (
  SELECT a.*,
    (SELECT n FROM cac_bo) AS backoffice,
    (SELECT n FROM cac_bo_os) AS backoffice_os,
    (SELECT n FROM pendiente_bodega) AS pendiente_bodega_os,
    (a.taller_diagnostico + a.taller_reparacion + a.taller_reacondicionado
      + a.taller_qc + a.taller_l3 + a.taller_scraps_piso)::bigint AS taller_piso_total,
    (a.bodega_con_caja + a.equipo_listo + a.bodega_despacho + a.pistoleo_en_curso
      + (SELECT n FROM pendiente_bodega) + a.reac_suelto
      + a.taller_diagnostico + a.taller_reparacion + a.taller_qc + a.taller_l3
      + a.taller_scraps_piso + a.bodega_scraps)::bigint AS activas
  FROM agg a
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT con_serie FROM mods),
  'sin_series', greatest((SELECT n FROM total_os) - (SELECT con_serie FROM mods), 0),
  'sin_series_en_planta', (SELECT n FROM sin_serie_en_planta),
  'bodega_con_caja', (SELECT bodega_con_caja FROM mods),
  'bodega_despacho', (SELECT bodega_despacho FROM mods),
  'bodega_sin_caja', 0,
  'pistoleo_en_curso', (SELECT pistoleo_en_curso FROM mods),
  'backoffice', (SELECT backoffice FROM mods),
  'backoffice_os', (SELECT backoffice_os FROM mods),
  'pendiente_bodega_os', (SELECT pendiente_bodega_os FROM mods),
  'series_recepcionado_bo', (SELECT series_recepcionado_bo FROM mods),
  'historial_backoffice', 0,
  'equipo_listo', (SELECT equipo_listo FROM mods),
  'despachado', (SELECT n FROM despachado_os),
  'devuelto', (SELECT n FROM devuelto_os),
  'taller_diagnostico', (SELECT taller_diagnostico FROM mods),
  'taller_reparacion', (SELECT taller_reparacion FROM mods),
  'taller_reacondicionado', (SELECT taller_reacondicionado FROM mods),
  'reac_suelto', (SELECT reac_suelto FROM mods),
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
  'activas_ledger', greatest((SELECT n FROM total_os) - (SELECT n FROM fuera_planta_os), 0)
);
$$;

GRANT EXECUTE ON FUNCTION public.is_service_order_devuelto(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_service_order_fuera_planta(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_service_order_devuelto(uuid) IS
  'True si service_orders.status es DEVUELTO, DEVUELTO_A_AGENCIA o DEVUELTO_BLOQUE.';

COMMENT ON FUNCTION public.is_service_order_fuera_planta(uuid) IS
  'True si la OS estÃ¡ despachada/cerrada o en estatus devuelto (fuera del ledger en planta).';

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908157000_os_inventory_historico_cuadre.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Cuadre histÃ³rico: despachadas âˆ© devueltas = âˆ… Â· tiles excluyen fuera_planta.
-- HistÃ³rico = activas_ledger + despachado + devuelto (buckets mutuamente excluyentes).

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
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.series sd
          WHERE sd.service_order_id = s.service_order_id
            AND sd.current_status::text = 'in_dispatch_warehouse'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.series sl
          WHERE sl.service_order_id = s.service_order_id
            AND sl.current_status::text = 'in_central_warehouse'
            AND EXISTS (
              SELECT 1 FROM public.erp_audit_logs al
              WHERE al.record_id = sl.id::text
                AND al.action IN (
                  'INGRESO A TALLER', 'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA', 'REPARACIÃ“N L3 COMPLETADA',
                  'CONTROL DE CALIDAD COMPLETADO', 'REACONDICIONADO COMPLETADO',
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
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
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
      WHERE s.current_status::text = 'ready_to_dispatch' AND s.current_box_id IS NULL
    )::bigint AS reac_suelto,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_validation'
    )::bigint AS taller_qc,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_control_warehouse'
    )::bigint AS taller_l3,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'irreparable' AND s.current_box_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.series s2
          JOIN public.boxes b ON b.id = s2.current_box_id
          WHERE s2.service_order_id = s.service_order_id AND s2.current_box_id IS NOT NULL
            AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
        )
    )::bigint AS taller_scraps_piso,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_box_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
        )
    )::bigint AS bodega_scraps,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('scrapped', 'in_scraps', 'irreparable')
    )::bigint AS scrap_ledger,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_central_warehouse'
        AND EXISTS (
          SELECT 1 FROM public.erp_audit_logs al
          WHERE al.record_id = s.id::text
            AND al.action IN (
              'INGRESO A TALLER', 'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA', 'REPARACIÃ“N L3 COMPLETADA',
              'CONTROL DE CALIDAD COMPLETADO', 'REACONDICIONADO COMPLETADO',
              'TRASLADO MASIVO A TALLER'
            )
        )
    )::bigint AS equipo_listo,
    count(DISTINCT s.service_order_id)::bigint AS con_serie
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
    AND NOT public.is_service_order_fuera_planta(s.service_order_id)
),
cac_bo AS (
  SELECT count(*)::bigint AS n FROM public.cac_tray_units t
  WHERE t.is_active = true
    AND (t.service_order_id IS NULL OR NOT public.is_service_order_fuera_planta(t.service_order_id))
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
cac_bo_os AS (
  SELECT count(DISTINCT t.service_order_id)::bigint AS n FROM public.cac_tray_units t
  WHERE t.is_active = true AND t.service_order_id IS NOT NULL
    AND NOT public.is_service_order_fuera_planta(t.service_order_id)
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
pendiente_bodega AS (
  SELECT count(DISTINCT src.os_id)::bigint AS n
  FROM (
    SELECT t.service_order_id AS os_id FROM public.cac_tray_units t
    WHERE t.is_active = true AND t.service_order_id IS NOT NULL
      AND NOT public.is_service_order_fuera_planta(t.service_order_id)
      AND coalesce(t.unit_status, '') NOT IN (
        'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
        'ingresado_bodega', 'INGRESADO_BODEGA',
        'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
    UNION
    SELECT s.service_order_id FROM public.series s
    WHERE s.service_order_id IS NOT NULL
      AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
      AND NOT public.is_service_order_fuera_planta(s.service_order_id)
  ) src
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
),
devuelto_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
    'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
  )
),
despachado_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) NOT IN (
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
    AND (
      upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
      OR EXISTS (
        SELECT 1 FROM public.series s
        WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
      )
    )
),
fuera_planta_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE public.is_service_order_fuera_planta(so.id)
),
sin_serie_en_planta AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE NOT public.is_service_order_fuera_planta(so.id)
    AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id)
),
mods AS (
  SELECT a.*,
    (SELECT n FROM cac_bo) AS backoffice,
    (SELECT n FROM cac_bo_os) AS backoffice_os,
    (SELECT n FROM pendiente_bodega) AS pendiente_bodega_os,
    (a.taller_diagnostico + a.taller_reparacion + a.taller_reacondicionado
      + a.taller_qc + a.taller_l3 + a.taller_scraps_piso)::bigint AS taller_piso_total,
    (a.bodega_con_caja + a.equipo_listo + a.bodega_despacho + a.pistoleo_en_curso
      + (SELECT n FROM pendiente_bodega) + a.reac_suelto
      + a.taller_diagnostico + a.taller_reparacion + a.taller_qc + a.taller_l3
      + a.taller_scraps_piso + a.bodega_scraps)::bigint AS activas
  FROM agg a
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT con_serie FROM mods),
  'sin_series', greatest((SELECT n FROM total_os) - (SELECT con_serie FROM mods), 0),
  'sin_series_en_planta', (SELECT n FROM sin_serie_en_planta),
  'bodega_con_caja', (SELECT bodega_con_caja FROM mods),
  'bodega_despacho', (SELECT bodega_despacho FROM mods),
  'bodega_sin_caja', 0,
  'pistoleo_en_curso', (SELECT pistoleo_en_curso FROM mods),
  'backoffice', (SELECT backoffice FROM mods),
  'backoffice_os', (SELECT backoffice_os FROM mods),
  'pendiente_bodega_os', (SELECT pendiente_bodega_os FROM mods),
  'series_recepcionado_bo', (SELECT series_recepcionado_bo FROM mods),
  'historial_backoffice', 0,
  'equipo_listo', (SELECT equipo_listo FROM mods),
  'despachado', (SELECT n FROM despachado_os),
  'devuelto', (SELECT n FROM devuelto_os),
  'fuera_planta', (SELECT n FROM fuera_planta_os),
  'taller_diagnostico', (SELECT taller_diagnostico FROM mods),
  'taller_reparacion', (SELECT taller_reparacion FROM mods),
  'taller_reacondicionado', (SELECT taller_reacondicionado FROM mods),
  'reac_suelto', (SELECT reac_suelto FROM mods),
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
  'activas_ledger', greatest((SELECT n FROM total_os) - (SELECT n FROM fuera_planta_os), 0)
);
$$;

COMMENT ON FUNCTION public.count_os_inventory_modules() IS
  'Inventario OS: histÃ³rico = activas_ledger + despachado + devuelto (excluyentes). Tiles solo en planta.';

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908158000_os_inventory_fuera_planta_perf.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Hotfix performance: 157000 llamaba is_service_order_fuera_planta() por cada serie â†’
-- timeout RPC â†’ UI fallback (~7.6k taller, Sin ubicaciÃ³n ~43k).
-- Reemplaza por CTE fuera_planta_ids + NOT EXISTS (set-based, como mig 153000).

CREATE OR REPLACE FUNCTION public.count_os_inventory_modules()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH fuera_planta_ids AS (
  SELECT so.id
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
      'DESPACHADO', 'CERRADO',
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
     OR EXISTS (
       SELECT 1
       FROM public.series s
       WHERE s.service_order_id = so.id
         AND s.current_status::text = 'dispatched'
     )
),
agg AS (
  SELECT
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('in_central_warehouse', 'ready_to_dispatch')
        AND s.current_box_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.series sd
          WHERE sd.service_order_id = s.service_order_id
            AND sd.current_status::text = 'in_dispatch_warehouse'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.series sl
          WHERE sl.service_order_id = s.service_order_id
            AND sl.current_status::text = 'in_central_warehouse'
            AND EXISTS (
              SELECT 1 FROM public.erp_audit_logs al
              WHERE al.record_id = sl.id::text
                AND al.action IN (
                  'INGRESO A TALLER', 'DIAGNÃ“STICO INICIAL COMPLETADO',
                  'REPARACIÃ“N COMPLETADA', 'REPARACIÃ“N L3 COMPLETADA',
                  'CONTROL DE CALIDAD COMPLETADO', 'REACONDICIONADO COMPLETADO',
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
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
              OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
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
      WHERE s.current_status::text = 'ready_to_dispatch' AND s.current_box_id IS NULL
    )::bigint AS reac_suelto,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_validation'
    )::bigint AS taller_qc,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_control_warehouse'
    )::bigint AS taller_l3,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'irreparable' AND s.current_box_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.series s2
          JOIN public.boxes b ON b.id = s2.current_box_id
          WHERE s2.service_order_id = s.service_order_id AND s2.current_box_id IS NOT NULL
            AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
        )
    )::bigint AS taller_scraps_piso,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_box_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.boxes b
          WHERE b.id = s.current_box_id
            AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
              OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
              OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
        )
    )::bigint AS bodega_scraps,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text IN ('scrapped', 'in_scraps', 'irreparable')
    )::bigint AS scrap_ledger,
    count(DISTINCT s.service_order_id) FILTER (
      WHERE s.current_status::text = 'in_central_warehouse'
        AND EXISTS (
          SELECT 1 FROM public.erp_audit_logs al
          WHERE al.record_id = s.id::text
            AND al.action IN (
              'INGRESO A TALLER', 'DIAGNÃ“STICO INICIAL COMPLETADO',
              'REPARACIÃ“N COMPLETADA', 'REPARACIÃ“N L3 COMPLETADA',
              'CONTROL DE CALIDAD COMPLETADO', 'REACONDICIONADO COMPLETADO',
              'TRASLADO MASIVO A TALLER'
            )
        )
    )::bigint AS equipo_listo,
    count(DISTINCT s.service_order_id)::bigint AS con_serie
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM fuera_planta_ids fp WHERE fp.id = s.service_order_id
    )
),
cac_bo AS (
  SELECT count(*)::bigint AS n FROM public.cac_tray_units t
  WHERE t.is_active = true
    AND (
      t.service_order_id IS NULL
      OR NOT EXISTS (SELECT 1 FROM fuera_planta_ids fp WHERE fp.id = t.service_order_id)
    )
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
cac_bo_os AS (
  SELECT count(DISTINCT t.service_order_id)::bigint AS n FROM public.cac_tray_units t
  WHERE t.is_active = true AND t.service_order_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM fuera_planta_ids fp WHERE fp.id = t.service_order_id)
    AND coalesce(t.unit_status, '') NOT IN (
      'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
      'ingresado_bodega', 'INGRESADO_BODEGA',
      'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
),
pendiente_bodega AS (
  SELECT count(DISTINCT src.os_id)::bigint AS n
  FROM (
    SELECT t.service_order_id AS os_id FROM public.cac_tray_units t
    WHERE t.is_active = true AND t.service_order_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM fuera_planta_ids fp WHERE fp.id = t.service_order_id)
      AND coalesce(t.unit_status, '') NOT IN (
        'returned', 'DEVUELTO_BLOQUE', 'DEVUELTO',
        'ingresado_bodega', 'INGRESADO_BODEGA',
        'in_central_warehouse', 'IN_CENTRAL_WAREHOUSE')
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
      AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
    UNION
    SELECT s.service_order_id FROM public.series s
    WHERE s.service_order_id IS NOT NULL
      AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
      AND NOT EXISTS (SELECT 1 FROM fuera_planta_ids fp WHERE fp.id = s.service_order_id)
  ) src
),
total_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders
),
devuelto_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN (
    'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
  )
),
despachado_os AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) NOT IN (
      'DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'
    )
    AND (
      upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
      OR EXISTS (
        SELECT 1 FROM public.series s
        WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
      )
    )
),
fuera_planta_os AS (
  SELECT count(*)::bigint AS n FROM fuera_planta_ids
),
sin_serie_en_planta AS (
  SELECT count(*)::bigint AS n FROM public.service_orders so
  WHERE NOT EXISTS (SELECT 1 FROM fuera_planta_ids fp WHERE fp.id = so.id)
    AND NOT EXISTS (SELECT 1 FROM public.series s WHERE s.service_order_id = so.id)
),
mods AS (
  SELECT a.*,
    (SELECT n FROM cac_bo) AS backoffice,
    (SELECT n FROM cac_bo_os) AS backoffice_os,
    (SELECT n FROM pendiente_bodega) AS pendiente_bodega_os,
    (a.taller_diagnostico + a.taller_reparacion + a.taller_reacondicionado
      + a.taller_qc + a.taller_l3 + a.taller_scraps_piso)::bigint AS taller_piso_total,
    (a.bodega_con_caja + a.equipo_listo + a.bodega_despacho + a.pistoleo_en_curso
      + (SELECT n FROM pendiente_bodega) + a.reac_suelto
      + a.taller_diagnostico + a.taller_reparacion + a.taller_qc + a.taller_l3
      + a.taller_scraps_piso + a.bodega_scraps)::bigint AS activas
  FROM agg a
)
SELECT jsonb_build_object(
  'total', (SELECT n FROM total_os),
  'con_serie', (SELECT con_serie FROM mods),
  'sin_series', greatest((SELECT n FROM total_os) - (SELECT con_serie FROM mods), 0),
  'sin_series_en_planta', (SELECT n FROM sin_serie_en_planta),
  'bodega_con_caja', (SELECT bodega_con_caja FROM mods),
  'bodega_despacho', (SELECT bodega_despacho FROM mods),
  'bodega_sin_caja', 0,
  'pistoleo_en_curso', (SELECT pistoleo_en_curso FROM mods),
  'backoffice', (SELECT backoffice FROM mods),
  'backoffice_os', (SELECT backoffice_os FROM mods),
  'pendiente_bodega_os', (SELECT pendiente_bodega_os FROM mods),
  'series_recepcionado_bo', (SELECT series_recepcionado_bo FROM mods),
  'historial_backoffice', 0,
  'equipo_listo', (SELECT equipo_listo FROM mods),
  'despachado', (SELECT n FROM despachado_os),
  'devuelto', (SELECT n FROM devuelto_os),
  'fuera_planta', (SELECT n FROM fuera_planta_os),
  'taller_diagnostico', (SELECT taller_diagnostico FROM mods),
  'taller_reparacion', (SELECT taller_reparacion FROM mods),
  'taller_reacondicionado', (SELECT taller_reacondicionado FROM mods),
  'reac_suelto', (SELECT reac_suelto FROM mods),
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
  'activas_ledger', greatest((SELECT n FROM total_os) - (SELECT n FROM fuera_planta_os), 0)
);
$$;

COMMENT ON FUNCTION public.count_os_inventory_modules() IS
  'Inventario OS set-based (fuera_planta_ids CTE). HistÃ³rico = activas_ledger + despachado + devuelto.';

NOTIFY pgrst, 'reload schema';


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- FILE: 20260908159000_dedupe_models_by_brand_name.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- Fusiona modelos duplicados (misma marca + mismo nombre normalizado) y bloquea futuros duplicados.

DO $$
DECLARE
  v_table text;
  v_sql text;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_model_dupes (
    dupe_id uuid PRIMARY KEY,
    keeper_id uuid NOT NULL
  ) ON COMMIT DROP;

  TRUNCATE tmp_model_dupes;

  INSERT INTO tmp_model_dupes (dupe_id, keeper_id)
  SELECT id, keeper_id
  FROM (
    SELECT
      id,
      first_value(id) OVER (
        PARTITION BY brand_id, upper(trim(name))
        ORDER BY id ASC
      ) AS keeper_id,
      row_number() OVER (
        PARTITION BY brand_id, upper(trim(name))
        ORDER BY id ASC
      ) AS rn
    FROM public.models
  ) ranked
  WHERE rn > 1;

  IF NOT EXISTS (SELECT 1 FROM tmp_model_dupes) THEN
    RETURN;
  END IF;

  -- Reasignar model_id en TODAS las tablas public que tengan esa columna (incl. boxes, cac_tray_units, etc.)
  FOR v_table IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'model_id'
      AND c.table_name <> 'models'
    ORDER BY c.table_name
  LOOP
    v_sql := format(
      'UPDATE public.%I t SET model_id = d.keeper_id FROM tmp_model_dupes d WHERE t.model_id = d.dupe_id',
      v_table
    );
    EXECUTE v_sql;
  END LOOP;

  -- cat_reacondicionado_tests.model_ids (uuid[]) si existe
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'cat_reacondicionado_tests'
      AND c.column_name = 'model_ids'
  ) THEN
    UPDATE public.cat_reacondicionado_tests t
    SET model_ids = (
      SELECT COALESCE(array_agg(DISTINCT x), '{}')
      FROM (
        SELECT CASE
          WHEN u = d.dupe_id THEN d.keeper_id
          ELSE u
        END AS x
        FROM unnest(t.model_ids) AS u
        LEFT JOIN tmp_model_dupes d ON d.dupe_id = u
      ) mapped
    )
    WHERE t.model_ids IS NOT NULL
      AND t.model_ids && (SELECT array_agg(dupe_id) FROM tmp_model_dupes);
  END IF;

  -- part_catalog_models: evitar PK duplicada al fusionar
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'part_catalog_models'
  ) THEN
    DELETE FROM public.part_catalog_models pcm
    USING tmp_model_dupes d
    WHERE pcm.model_id = d.dupe_id
      AND EXISTS (
        SELECT 1 FROM public.part_catalog_models keep
        WHERE keep.catalog_id = pcm.catalog_id
          AND keep.model_id = d.keeper_id
      );

    UPDATE public.part_catalog_models pcm
    SET model_id = d.keeper_id
    FROM tmp_model_dupes d
    WHERE pcm.model_id = d.dupe_id;
  END IF;

  DELETE FROM public.models m
  USING tmp_model_dupes d
  WHERE m.id = d.dupe_id;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS models_brand_name_unique
  ON public.models (brand_id, upper(trim(name)));


