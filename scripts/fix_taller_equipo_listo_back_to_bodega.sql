-- Retirar de Taller "Equipo Listo" el stock que solo está en Bodega Central
-- (nunca ingresó al flujo de taller).
--
-- Causa: series.current_status = in_central_warehouse aparece en Taller como EQUIPO LISTO,
-- aunque solo fueron ingresadas a cajas en BODEGA_CENTRAL / racks P-* / RACK-*.
--
-- Acción: volver a RECEPCIONADO_BODEGA_GENERAL (siguen visibles en /bodega/gestion).
--
-- Uso:
--   1) Ejecutar bloques 1-2 (diagnóstico)
--   2) Revisar conteos
--   3) Ejecutar bloque 3 (UPDATE) solo si el conteo coincide (~389)

-- =============================================================================
-- 1) Conteo actual en Taller (proxy: in_central_warehouse en racks de bodega)
-- =============================================================================
SELECT count(*) AS series_en_equipo_listo_bodega
FROM public.series s
LEFT JOIN public.boxes b ON b.id = s.current_box_id
WHERE s.current_status::text = 'in_central_warehouse'
  AND (
    coalesce(b.rack_location, '') ILIKE 'BODEGA%'
    OR coalesce(b.rack_location, '') LIKE 'P-%'
    OR coalesce(b.rack_location, '') LIKE 'RACK-%'
  )
  AND coalesce(b.rack_location, '') NOT ILIKE 'TALLER%'
  AND coalesce(b.rack_location, '') NOT IN ('DESPACHO', 'ELIMINADO');

-- =============================================================================
-- 2) Excluir equipos que SÍ pasaron por taller (auditoría)
-- =============================================================================
SELECT count(*) AS series_a_corregir
FROM public.series s
LEFT JOIN public.boxes b ON b.id = s.current_box_id
WHERE s.current_status::text = 'in_central_warehouse'
  AND (
    coalesce(b.rack_location, '') ILIKE 'BODEGA%'
    OR coalesce(b.rack_location, '') LIKE 'P-%'
    OR coalesce(b.rack_location, '') LIKE 'RACK-%'
  )
  AND coalesce(b.rack_location, '') NOT ILIKE 'TALLER%'
  AND coalesce(b.rack_location, '') NOT IN ('DESPACHO', 'ELIMINADO')
  AND NOT EXISTS (
    SELECT 1
    FROM public.erp_audit_logs al
    WHERE al.record_id = s.id::text
      AND al.action IN (
        'INGRESO A TALLER',
        'DIAGNÓSTICO INICIAL COMPLETADO',
        'REPARACIÓN COMPLETADA',
        'CONTROL DE CALIDAD COMPLETADO',
        'REACONDICIONADO COMPLETADO',
        'DIAGNÓSTICO INICIAL COMPLETADO',
        'EVALUACIÓN TALLER'
      )
  );

-- Muestra de 10 series afectadas
SELECT
  s.serial_number,
  s.current_status::text AS status,
  b.box_code,
  b.rack_location,
  so.os_label
FROM public.series s
LEFT JOIN public.boxes b ON b.id = s.current_box_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE s.current_status::text = 'in_central_warehouse'
  AND (
    coalesce(b.rack_location, '') ILIKE 'BODEGA%'
    OR coalesce(b.rack_location, '') LIKE 'P-%'
    OR coalesce(b.rack_location, '') LIKE 'RACK-%'
  )
  AND coalesce(b.rack_location, '') NOT ILIKE 'TALLER%'
  AND NOT EXISTS (
    SELECT 1 FROM public.erp_audit_logs al
    WHERE al.record_id = s.id::text
      AND al.action IN (
        'INGRESO A TALLER',
        'DIAGNÓSTICO INICIAL COMPLETADO',
        'REPARACIÓN COMPLETADA',
        'CONTROL DE CALIDAD COMPLETADO',
        'REACONDICIONADO COMPLETADO'
      )
  )
ORDER BY s.updated_at DESC
LIMIT 10;

-- =============================================================================
-- 3) CORRECCIÓN — ejecutar solo tras validar conteo en bloque 2
-- =============================================================================
UPDATE public.series s
SET
  current_status = 'RECEPCIONADO_BODEGA_GENERAL',
  updated_at = timezone('utc', now())
FROM public.boxes b
WHERE b.id = s.current_box_id
  AND s.current_status::text = 'in_central_warehouse'
  AND (
    coalesce(b.rack_location, '') ILIKE 'BODEGA%'
    OR coalesce(b.rack_location, '') LIKE 'P-%'
    OR coalesce(b.rack_location, '') LIKE 'RACK-%'
  )
  AND coalesce(b.rack_location, '') NOT ILIKE 'TALLER%'
  AND coalesce(b.rack_location, '') NOT IN ('DESPACHO', 'ELIMINADO')
  AND NOT EXISTS (
    SELECT 1
    FROM public.erp_audit_logs al
    WHERE al.record_id = s.id::text
      AND al.action IN (
        'INGRESO A TALLER',
        'DIAGNÓSTICO INICIAL COMPLETADO',
        'REPARACIÓN COMPLETADA',
        'CONTROL DE CALIDAD COMPLETADO',
        'REACONDICIONADO COMPLETADO'
      )
  );

-- Verificar post-fix (Equipo Listo en Taller debería bajar ~389)
SELECT current_status::text AS status, count(*) AS total
FROM public.series s
LEFT JOIN public.boxes b ON b.id = s.current_box_id
WHERE s.current_status::text IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL')
  AND coalesce(b.rack_location, '') ILIKE 'BODEGA%'
GROUP BY 1;
