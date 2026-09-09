-- =============================================================================
-- RECONCILIACIÓN "Sin ubicación" — por qué UI dice 86 pero listado da 0 filas
-- Ejecutar cada bloque por separado en Supabase SQL Editor
-- =============================================================================

-- ── A) Números del RPC (misma fuente que el dashboard) ───────────────────────
SELECT
  (j->>'activas_ledger')::bigint AS en_planta_ledger,
  (j->>'activas')::bigint AS activas_rpc,
  (j->>'pendiente_bodega_os')::bigint AS tile_pendiente_bodega,
  (j->>'bodega_con_caja')::bigint AS tile_bodega,
  (j->>'taller_diagnostico')::bigint AS tile_diag,
  (j->>'taller_reparacion')::bigint AS tile_rep,
  (j->>'taller_qc')::bigint AS tile_cq,
  (j->>'taller_l3')::bigint AS tile_l3,
  (j->>'taller_scraps_piso')::bigint AS tile_scraps_piso,
  (j->>'reac_suelto')::bigint AS tile_reac_suelto,
  (j->>'bodega_scraps')::bigint AS tile_scraps_caja,
  (j->>'equipo_listo')::bigint AS tile_equipo_listo,
  (j->>'bodega_despacho')::bigint AS tile_despacho,
  (j->>'pistoleo_en_curso')::bigint AS tile_tmp,
  (
    (j->>'pendiente_bodega_os')::bigint
    + (j->>'bodega_con_caja')::bigint
    + (j->>'taller_diagnostico')::bigint
    + (j->>'taller_reparacion')::bigint
    + (j->>'taller_qc')::bigint
    + (j->>'taller_l3')::bigint
    + (j->>'taller_scraps_piso')::bigint
    + (j->>'reac_suelto')::bigint
    + (j->>'bodega_scraps')::bigint
    + (j->>'equipo_listo')::bigint
    + (j->>'bodega_despacho')::bigint
    + (j->>'pistoleo_en_curso')::bigint
  ) AS suma_tiles_ui,
  (j->>'sin_series_en_planta')::bigint AS os_sin_serie_en_planta,
  (j->>'activas_ledger')::bigint
    - (
      (j->>'pendiente_bodega_os')::bigint
      + (j->>'bodega_con_caja')::bigint
      + (j->>'taller_diagnostico')::bigint
      + (j->>'taller_reparacion')::bigint
      + (j->>'taller_qc')::bigint
      + (j->>'taller_l3')::bigint
      + (j->>'taller_scraps_piso')::bigint
      + (j->>'reac_suelto')::bigint
      + (j->>'bodega_scraps')::bigint
      + (j->>'equipo_listo')::bigint
      + (j->>'bodega_despacho')::bigint
      + (j->>'pistoleo_en_curso')::bigint
    ) AS gap_sin_ubicacion_ui
FROM (SELECT public.count_os_inventory_modules() AS j) x;


-- ── B) OS SIN SERIE en planta (causa #1 más común del gap) ───────────────────
-- Ejecutar solo este SELECT:
/*
SELECT
  so.os_label AS "OS",
  so.main_serial AS "Serie",
  so.status AS "Status OS",
  so.sap_integration_status AS "SAP",
  so.created_at::date AS "Creada",
  so.id AS "UUID"
FROM public.service_orders so
WHERE upper(trim(coalesce(so.status, ''))) NOT IN ('DESPACHADO', 'CERRADO')
  AND NOT EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.service_order_id = so.id
      AND s.current_status::text = 'dispatched'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.series s WHERE s.service_order_id = so.id
  )
ORDER BY so.os_label;
*/


-- ── C) Series con status NO mapeado a ningún tile (causa #2) ────────────────
/*
SELECT
  s.current_status::text AS status_series,
  count(DISTINCT s.service_order_id)::bigint AS os_distintas
FROM public.series s
WHERE s.service_order_id IS NOT NULL
  AND s.current_status::text NOT IN (
    'dispatched',
    'RECEPCIONADO_BODEGA_GENERAL',
    'in_central_warehouse', 'ready_to_dispatch',
    'in_dispatch_warehouse',
    'in_workshop', 'in_qc', 'in_validation', 'in_control_warehouse',
    'irreparable', 'scrapped', 'in_scraps'
  )
GROUP BY 1
ORDER BY 2 DESC;
*/


-- ── D) Detalle OS con series "huérfanas" (status raro, no despachadas) ───────
/*
WITH orphan_status AS (
  SELECT unnest(ARRAY[
    'returned', 'INGRESADO', 'classified', 'in_backoffice'
  ]) AS st
)
SELECT
  so.os_label AS "OS",
  so.main_serial AS "Serie",
  so.status AS "Status OS",
  so.sap_integration_status AS "SAP",
  string_agg(DISTINCT s.serial_number || ':' || s.current_status::text, ' | ') AS "Series",
  so.id AS "UUID"
FROM public.service_orders so
JOIN public.series s ON s.service_order_id = so.id
WHERE upper(trim(coalesce(so.status, ''))) NOT IN ('DESPACHADO', 'CERRADO')
  AND NOT EXISTS (
    SELECT 1 FROM public.series sd
    WHERE sd.service_order_id = so.id AND sd.current_status::text = 'dispatched'
  )
  AND s.current_status::text IN (SELECT st FROM orphan_status)
GROUP BY so.id, so.os_label, so.main_serial, so.status, so.sap_integration_status
ORDER BY so.os_label
LIMIT 200;
*/
