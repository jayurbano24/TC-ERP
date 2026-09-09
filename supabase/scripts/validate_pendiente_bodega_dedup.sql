-- =============================================================================
-- VALIDAR Pendiente Bodega — por qué CAC + BO no se suman
-- Ejecutar en Supabase antes/después de migración 155000
-- =============================================================================

WITH
cac AS (
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
),
bo AS (
  SELECT DISTINCT s.service_order_id AS os_id
  FROM public.series s
  WHERE s.service_order_id IS NOT NULL
    AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
),
union_os AS (
  SELECT os_id FROM cac
  UNION
  SELECT os_id FROM bo
)
SELECT
  (SELECT count(*) FROM public.cac_tray_units t WHERE t.is_active = true
    AND coalesce(t.unit_status, '') NOT IN (
      'returned','DEVUELTO_BLOQUE','DEVUELTO','ingresado_bodega','INGRESADO_BODEGA',
      'in_central_warehouse','IN_CENTRAL_WAREHOUSE')
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%devuelt%'
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%devolver%'
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%retorno%'
    AND coalesce(t.unit_status_label,'') NOT ILIKE '%bodega general%') AS filas_bandeja_cac,
  (SELECT count(DISTINCT os_id) FROM cac) AS os_en_bandeja_cac,
  (SELECT count(*) FROM bo) AS os_series_recep_bo,
  (SELECT count(*) FROM union_os) AS os_unicas_pendiente_bodega,
  (SELECT count(*) FROM cac c INNER JOIN bo b ON b.os_id = c.os_id) AS solape_cac_y_bo,
  (SELECT count(*) FROM cac c LEFT JOIN bo b ON b.os_id = c.os_id WHERE b.os_id IS NULL) AS solo_cac_sin_bo,
  (SELECT count(*) FROM bo b LEFT JOIN cac c ON c.os_id = b.os_id WHERE c.os_id IS NULL) AS solo_bo_sin_cac;
