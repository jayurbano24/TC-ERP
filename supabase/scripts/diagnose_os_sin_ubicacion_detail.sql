-- =============================================================================
-- SIN UBICACIÓN — listado rápido (evita timeout Supabase SQL Editor)
-- Ejecutar en orden: (1) resumen → (2) detalle 86 filas
-- =============================================================================

-- ── PASO 1: Resumen por motivo (~5s) ─────────────────────────────────────────
WITH
despachado AS (
  SELECT so.id
  FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1 FROM public.series s
       WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
     )
),
os_in_dispatch AS (
  SELECT DISTINCT service_order_id AS os_id
  FROM public.series
  WHERE current_status::text = 'in_dispatch_warehouse' AND service_order_id IS NOT NULL
),
os_equipo_listo AS (
  SELECT DISTINCT s.service_order_id AS os_id
  FROM public.series s
  WHERE s.current_status::text = 'in_central_warehouse'
    AND s.service_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.erp_audit_logs al
      WHERE al.record_id = s.id::text
        AND al.action IN (
          'INGRESO A TALLER', 'DIAGNÓSTICO INICIAL COMPLETADO', 'REPARACIÓN COMPLETADA',
          'REPARACIÓN L3 COMPLETADA', 'CONTROL DE CALIDAD COMPLETADO',
          'REACONDICIONADO COMPLETADO', 'TRASLADO MASIVO A TALLER'
        )
    )
),
os_pendiente_bodega AS (
  SELECT DISTINCT t.service_order_id AS os_id
  FROM public.cac_tray_units t
  WHERE t.is_active = true AND t.service_order_id IS NOT NULL
    AND coalesce(t.unit_status, '') NOT IN (
      'returned','DEVUELTO_BLOQUE','DEVUELTO','ingresado_bodega','INGRESADO_BODEGA',
      'in_central_warehouse','IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label, '') NOT ILIKE '%bodega general%'
  UNION
  SELECT DISTINCT service_order_id AS os_id
  FROM public.series
  WHERE service_order_id IS NOT NULL
    AND current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
),
sa AS (
  SELECT
    s.service_order_id AS os_id,
    count(*)::int AS n_series,
    bool_or(s.current_status::text = 'in_workshop') AS in_diag,
    bool_or(s.current_status::text = 'in_qc') AS in_rep,
    bool_or(s.current_status::text = 'in_validation') AS in_cq,
    bool_or(s.current_status::text = 'in_control_warehouse') AS in_l3,
    bool_or(s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL') AS st_recep_bo,
    bool_or(s.current_status::text = 'ready_to_dispatch' AND s.current_box_id IS NULL) AS in_reac_suelto,
    bool_or(s.current_status::text = 'in_dispatch_warehouse') AS st_dispatch,
    bool_or(
      s.current_status::text IN ('in_central_warehouse', 'ready_to_dispatch')
      AND s.current_box_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.boxes b
        WHERE b.id = s.current_box_id
          AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
            OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
      )
    ) AS st_bodega_caja_candidata,
    bool_or(
      s.current_box_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.boxes b
        WHERE b.id = s.current_box_id
          AND (upper(coalesce(b.rack_location, '')) = 'EN_PROCESO'
            OR upper(coalesce(b.box_code, '')) LIKE 'TMP-%')
      )
    ) AS in_pistoleo,
    bool_or(
      s.current_box_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.boxes b
        WHERE b.id = s.current_box_id
          AND (upper(trim(coalesce(b.rack_location, ''))) IN ('SCRAP', 'SCRAPS')
            OR upper(trim(coalesce(b.rack_location, ''))) LIKE 'SCRAP%'
            OR upper(trim(coalesce(b.box_code, ''))) LIKE 'BOX-BAD%')
      )
    ) AS in_scraps_caja,
    bool_or(
      s.current_status::text = 'irreparable'
      AND s.current_box_id IS NULL
    ) AS st_irreparable_suelto,
    string_agg(DISTINCT s.current_status::text, ', ' ORDER BY s.current_status::text) AS statuses
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
  GROUP BY s.service_order_id
),
eval AS (
  SELECT
    so.id AS os_id,
    coalesce(sa.n_series, 0) AS n_series,
    sa.statuses,
    (pb.os_id IS NOT NULL) AS in_pendiente_bodega,
    (ol.os_id IS NOT NULL) AS in_equipo_listo,
    (od.os_id IS NOT NULL) AS in_bodega_despacho,
    (
      sa.st_bodega_caja_candidata
      AND od.os_id IS NULL
      AND ol.os_id IS NULL
    ) AS in_bodega_caja,
    coalesce(sa.in_pistoleo, false) AS in_pistoleo,
    coalesce(sa.in_diag, false) AS in_diag,
    coalesce(sa.in_rep, false) AS in_rep,
    coalesce(sa.in_cq, false) AS in_cq,
    coalesce(sa.in_l3, false) AS in_l3,
    coalesce(sa.in_reac_suelto, false) AS in_reac_suelto,
    coalesce(sa.in_scraps_caja, false) AS in_scraps_caja,
    coalesce(sa.st_irreparable_suelto, false) AS st_irreparable_suelto
  FROM public.service_orders so
  LEFT JOIN sa ON sa.os_id = so.id
  LEFT JOIN os_pendiente_bodega pb ON pb.os_id = so.id
  LEFT JOIN os_equipo_listo ol ON ol.os_id = so.id
  LEFT JOIN os_in_dispatch od ON od.os_id = so.id
  WHERE so.id NOT IN (SELECT id FROM despachado)
),
sin_ubic AS (
  SELECT
    e.*,
    NOT (
      e.in_pendiente_bodega OR e.in_bodega_caja OR e.in_pistoleo OR e.in_bodega_despacho
      OR e.in_equipo_listo OR e.in_diag OR e.in_rep OR e.in_cq OR e.in_l3
      OR e.in_reac_suelto OR e.in_scraps_caja
      OR (e.st_irreparable_suelto AND NOT e.in_scraps_caja)
    ) AS es_sin_ubic,
    CASE
      WHEN e.n_series = 0 THEN 'A · Sin serie en planta'
      WHEN e.in_reac_suelto THEN 'B · ready_to_dispatch sin caja'
      WHEN e.statuses LIKE '%RECEPCIONADO_BODEGA_GENERAL%' AND NOT e.in_pendiente_bodega
        THEN 'C · RECEPCIONADO BO sin bandeja CAC'
      WHEN e.statuses LIKE '%in_central_warehouse%' AND NOT e.in_bodega_caja AND NOT e.in_equipo_listo
        THEN 'D · in_central_warehouse sin bucket'
      WHEN e.statuses LIKE '%ready_to_dispatch%' THEN 'E · ready_to_dispatch exclusión bodega'
      WHEN e.statuses LIKE '%irreparable%' THEN 'F · irreparable sin scrap bucket'
      ELSE 'G · Huérfano / otro'
    END AS motivo
  FROM eval e
)
SELECT motivo, count(*)::bigint AS cantidad
FROM sin_ubic
WHERE es_sin_ubic
GROUP BY motivo
ORDER BY cantidad DESC;


-- ── PASO 2: Detalle solo las ~86 (ejecutar aparte tras ver resumen) ──────────
/*
WITH
despachado AS (
  SELECT so.id FROM public.service_orders so
  WHERE upper(trim(coalesce(so.status, ''))) IN ('DESPACHADO', 'CERRADO')
     OR EXISTS (
       SELECT 1 FROM public.series s
       WHERE s.service_order_id = so.id AND s.current_status::text = 'dispatched'
     )
),
os_in_dispatch AS (
  SELECT DISTINCT service_order_id AS os_id FROM public.series
  WHERE current_status::text = 'in_dispatch_warehouse' AND service_order_id IS NOT NULL
),
os_equipo_listo AS (
  SELECT DISTINCT s.service_order_id AS os_id FROM public.series s
  WHERE s.current_status::text = 'in_central_warehouse' AND s.service_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.erp_audit_logs al WHERE al.record_id = s.id::text
        AND al.action IN (
          'INGRESO A TALLER','DIAGNÓSTICO INICIAL COMPLETADO','REPARACIÓN COMPLETADA',
          'REPARACIÓN L3 COMPLETADA','CONTROL DE CALIDAD COMPLETADO',
          'REACONDICIONADO COMPLETADO','TRASLADO MASIVO A TALLER')
    )
),
os_pendiente_bodega AS (
  SELECT DISTINCT t.service_order_id AS os_id FROM public.cac_tray_units t
  WHERE t.is_active = true AND t.service_order_id IS NOT NULL
    AND coalesce(t.unit_status,'') NOT IN (
      'returned','DEVUELTO_BLOQUE','DEVUELTO','ingresado_bodega','INGRESADO_BODEGA',
      'in_central_warehouse','IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%bodega general%'
  UNION
  SELECT DISTINCT service_order_id FROM public.series
  WHERE service_order_id IS NOT NULL AND current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
),
sa AS (
  SELECT s.service_order_id AS os_id, count(*)::int AS n_series,
    bool_or(s.current_status::text = 'in_workshop') AS in_diag,
    bool_or(s.current_status::text = 'in_qc') AS in_rep,
    bool_or(s.current_status::text = 'in_validation') AS in_cq,
    bool_or(s.current_status::text = 'in_control_warehouse') AS in_l3,
    bool_or(s.current_status::text = 'ready_to_dispatch' AND s.current_box_id IS NULL) AS in_reac_suelto,
    bool_or(s.current_status::text IN ('in_central_warehouse','ready_to_dispatch')
      AND s.current_box_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.boxes b WHERE b.id = s.current_box_id
          AND (upper(coalesce(b.rack_location,'')) = 'EN_PROCESO'
            OR upper(coalesce(b.box_code,'')) LIKE 'TMP-%'))) AS st_bodega_caja_candidata,
    bool_or(s.current_box_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.boxes b WHERE b.id = s.current_box_id
        AND (upper(coalesce(b.rack_location,'')) = 'EN_PROCESO'
          OR upper(coalesce(b.box_code,'')) LIKE 'TMP-%'))) AS in_pistoleo,
    bool_or(s.current_box_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.boxes b WHERE b.id = s.current_box_id
        AND (upper(trim(coalesce(b.rack_location,''))) IN ('SCRAP','SCRAPS')
          OR upper(trim(coalesce(b.rack_location,''))) LIKE 'SCRAP%'
          OR upper(trim(coalesce(b.box_code,''))) LIKE 'BOX-BAD%'))) AS in_scraps_caja,
    bool_or(s.current_status::text = 'irreparable' AND s.current_box_id IS NULL) AS st_irreparable_suelto,
    string_agg(DISTINCT s.serial_number || ':' || s.current_status::text, ' | ') AS detalle_series
  FROM public.series s WHERE s.service_order_id IS NOT NULL
  GROUP BY s.service_order_id
),
eval AS (
  SELECT so.id AS os_id, so.os_label, so.main_serial, so.status AS os_status,
    so.sap_integration_status, coalesce(sa.n_series, 0) AS n_series, sa.detalle_series,
    (pb.os_id IS NOT NULL) AS in_pendiente_bodega,
    (ol.os_id IS NOT NULL) AS in_equipo_listo,
    (od.os_id IS NOT NULL) AS in_bodega_despacho,
    (sa.st_bodega_caja_candidata AND od.os_id IS NULL AND ol.os_id IS NULL) AS in_bodega_caja,
    coalesce(sa.in_pistoleo,false) AS in_pistoleo,
    coalesce(sa.in_diag,false) AS in_diag, coalesce(sa.in_rep,false) AS in_rep,
    coalesce(sa.in_cq,false) AS in_cq, coalesce(sa.in_l3,false) AS in_l3,
    coalesce(sa.in_reac_suelto,false) AS in_reac_suelto,
    coalesce(sa.in_scraps_caja,false) AS in_scraps_caja,
    coalesce(sa.st_irreparable_suelto,false) AS st_irreparable_suelto
  FROM public.service_orders so
  LEFT JOIN sa ON sa.os_id = so.id
  LEFT JOIN os_pendiente_bodega pb ON pb.os_id = so.id
  LEFT JOIN os_equipo_listo ol ON ol.os_id = so.id
  LEFT JOIN os_in_dispatch od ON od.os_id = so.id
  WHERE so.id NOT IN (SELECT id FROM despachado)
),
sin_ubic AS (
  SELECT e.*,
    CASE WHEN e.n_series = 0 THEN 'A · Sin serie en planta'
         WHEN e.in_reac_suelto THEN 'B · ready_to_dispatch sin caja'
         WHEN e.detalle_series LIKE '%RECEPCIONADO_BODEGA_GENERAL%' AND NOT e.in_pendiente_bodega
           THEN 'C · RECEPCIONADO BO sin bandeja CAC'
         WHEN e.detalle_series LIKE '%in_central_warehouse%' AND NOT e.in_bodega_caja AND NOT e.in_equipo_listo
           THEN 'D · in_central_warehouse sin bucket'
         ELSE 'G · Huérfano / otro'
    END AS motivo
  FROM eval e
  WHERE NOT (
    e.in_pendiente_bodega OR e.in_bodega_caja OR e.in_pistoleo OR e.in_bodega_despacho
    OR e.in_equipo_listo OR e.in_diag OR e.in_rep OR e.in_cq OR e.in_l3
    OR e.in_reac_suelto OR e.in_scraps_caja
    OR (e.st_irreparable_suelto AND NOT e.in_scraps_caja)
  )
)
SELECT os_label AS "OS", main_serial AS "Serie", os_status AS "Status OS",
  sap_integration_status AS "SAP", motivo AS "Motivo", detalle_series AS "Series",
  n_series AS "N series", os_id AS "UUID"
FROM sin_ubic
ORDER BY motivo, os_label;
*/
