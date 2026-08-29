-- =============================================================================
-- DIAGNÓSTICO SSOT — Realidad de OS por módulo (1 fila = 1 métrica)
-- Pegar en Supabase → SQL Editor → Run.
-- Unidad: siempre OS distintas (service_order_id), no series S1–S4.
-- =============================================================================

WITH
series_os AS (
  SELECT DISTINCT
    s.service_order_id,
    s.current_status::text AS status,
    s.current_box_id,
    s.id AS series_id
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
),
-- Una OS puede tener varias series; tomamos flags por OS
os_flags AS (
  SELECT
    so.id AS os_id,
    -- ¿Alguna serie en cada estado?
    bool_or(s.current_status::text = 'dispatched') AS any_dispatched,
    bool_or(s.current_status::text IN ('in_central_warehouse', 'ready_to_dispatch')
      AND s.current_box_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.boxes b
        WHERE b.id = s.current_box_id
          AND (
            upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
            OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%'
          )
      )
    ) AS in_bodega_central_caja,
    bool_or(
      s.current_box_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.boxes b
        WHERE b.id = s.current_box_id
          AND (
            upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
            OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%'
          )
      )
    ) AS in_pistoleo_tmp,
    bool_or(s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL') AS st_recepcionado_bo,
    bool_or(s.current_status::text IN ('INGRESADO', 'classified', 'in_backoffice')) AS st_backoffice_otros,
    bool_or(s.current_status::text = 'in_workshop') AS st_diagnostico,
    bool_or(s.current_status::text = 'in_qc') AS st_reparacion,
    bool_or(s.current_status::text = 'in_validation') AS st_qc,
    bool_or(s.current_status::text = 'ready_to_dispatch') AS st_reacondicionado,
    bool_or(s.current_status::text = 'in_control_warehouse') AS st_l3,
    bool_or(
      s.current_status::text = 'irreparable'
      AND s.current_box_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.series s2
        JOIN public.boxes b ON b.id = s2.current_box_id
        WHERE s2.service_order_id = so.id
          AND s2.current_box_id IS NOT NULL
          AND (
            upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
            OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
            OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%'
          )
      )
    ) AS st_scraps_piso_taller,
    bool_or(
      s.current_box_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.boxes b
        WHERE b.id = s.current_box_id
          AND (
            upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
            OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
            OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%'
          )
      )
    ) AS in_bodega_scraps_caja,
    bool_or(s.current_status::text IN ('scrapped', 'in_scraps', 'irreparable')) AS st_scrap_ledger
  FROM public.service_orders so
  LEFT JOIN public.series s ON s.service_order_id = so.id
  GROUP BY so.id
),
cac_pendiente AS (
  -- SSOT operativo: pendiente de ingresar a Bodega Central
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
equipo_listo AS (
  SELECT count(DISTINCT s.service_order_id)::bigint AS n
  FROM public.series s
  WHERE s.current_status::text = 'in_central_warehouse'
    AND s.service_order_id IS NOT NULL
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
),
totales AS (
  SELECT
    (SELECT count(*) FROM public.service_orders)::bigint AS historico_total,
    (SELECT count(*) FROM os_flags WHERE any_dispatched)::bigint AS despachadas,
    (SELECT count(*) FROM os_flags WHERE in_bodega_central_caja)::bigint AS bodega_central,
    (SELECT count(*) FROM os_flags WHERE in_pistoleo_tmp)::bigint AS pistoleo_tmp,
    (SELECT n FROM cac_pendiente) AS bo_pendiente_bodega,
    (SELECT count(*) FROM os_flags WHERE st_recepcionado_bo)::bigint AS series_recepcionado_bo,
    (SELECT count(*) FROM os_flags WHERE st_diagnostico)::bigint AS taller_diagnostico,
    (SELECT count(*) FROM os_flags WHERE st_reparacion)::bigint AS taller_reparacion,
    (SELECT count(*) FROM os_flags WHERE st_reacondicionado)::bigint AS taller_reacondicionado,
    (SELECT count(*) FROM os_flags WHERE st_qc)::bigint AS taller_qc,
    (SELECT count(*) FROM os_flags WHERE st_l3)::bigint AS taller_l3,
    (SELECT count(*) FROM os_flags WHERE st_scraps_piso_taller)::bigint AS taller_scraps_piso,
    (SELECT count(*) FROM os_flags WHERE in_bodega_scraps_caja)::bigint AS bodega_scraps,
    (SELECT count(*) FROM os_flags WHERE st_scrap_ledger)::bigint AS scrap_ledger,
    (SELECT n FROM equipo_listo) AS equipo_listo
)
SELECT * FROM (
  SELECT 10 AS ord, '01 · Histórico (todas las OS)' AS modulo,
         historico_total AS os,
         'Todas las filas service_orders' AS definicion
  FROM totales
  UNION ALL
  SELECT 20, '02 · Despachadas (históricas)',
         despachadas,
         'OS con ≥1 serie status=dispatched'
  FROM totales
  UNION ALL
  SELECT 30, '03 · Activas (físico estimado)',
         historico_total - despachadas,
         'Histórico − Despachadas (incluye residual sin módulo)'
  FROM totales
  UNION ALL
  SELECT 40, '04 · Backoffice · PENDIENTE ingresar Bodega Central ★',
         bo_pendiente_bodega,
         'cac_tray_units activas (SSOT operativo = Historial CAC)'
  FROM totales
  UNION ALL
  SELECT 45, '04b · series RECEPCIONADO_BODEGA_GENERAL (referencia)',
         series_recepcionado_bo,
         'Solo status series; puede diferir de bandeja CAC'
  FROM totales
  UNION ALL
  SELECT 50, '05 · Bodega Central (con caja, no TMP)',
         bodega_central,
         'in_central_warehouse/ready_to_dispatch + caja real (no TMP/EN_PROCESO)'
  FROM totales
  UNION ALL
  SELECT 55, '05b · Pistoleo en curso (TMP)',
         pistoleo_tmp,
         'Series en caja TMP / rack EN_PROCESO'
  FROM totales
  UNION ALL
  SELECT 60, '06 · Taller · Diagnóstico',
         taller_diagnostico,
         'status = in_workshop'
  FROM totales
  UNION ALL
  SELECT 70, '07 · Taller · Reparación',
         taller_reparacion,
         'status = in_qc'
  FROM totales
  UNION ALL
  SELECT 80, '08 · Taller · Reacondicionado',
         taller_reacondicionado,
         'status = ready_to_dispatch'
  FROM totales
  UNION ALL
  SELECT 90, '09 · Taller · Control Calidad (CQ)',
         taller_qc,
         'status = in_validation'
  FROM totales
  UNION ALL
  SELECT 100, '10 · Taller · L3',
         taller_l3,
         'status = in_control_warehouse'
  FROM totales
  UNION ALL
  SELECT 110, '11 · Taller · SCRAPS (piso, pendientes caja)',
         taller_scraps_piso,
         'irreparable sin caja y OS sin series ya en BOX-BAD'
  FROM totales
  UNION ALL
  SELECT 120, '12 · Bodega SCRAPS (ya en caja)',
         bodega_scraps,
         'OS con ≥1 serie en caja rack SCRAP / BOX-BAD'
  FROM totales
  UNION ALL
  SELECT 125, '12b · Scrap ledger (todos status scrap)',
         scrap_ledger,
         'irreparable + in_scraps + scrapped (piso + caja)'
  FROM totales
  UNION ALL
  SELECT 130, '13 · Equipo Listo (post-taller → outbound)',
         equipo_listo,
         'in_central_warehouse + auditoría de taller/QC'
  FROM totales
  UNION ALL
  SELECT 140, '14 · Taller TOTAL etapas piso',
         taller_diagnostico + taller_reparacion + taller_reacondicionado
           + taller_qc + taller_l3 + taller_scraps_piso,
         'Suma Diag+Rep+Reac+CQ+L3+SCRAPS piso'
  FROM totales
) x
ORDER BY ord;
