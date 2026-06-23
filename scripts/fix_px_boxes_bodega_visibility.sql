-- Diagnóstico y reparación: cajas PX (BOX-33, BOX-34, etc.) visibles en historial pero no en Bodega General
-- Ejecutar en Supabase SQL Editor
-- Nota: series_status no incluye "in_warehouse"; usamos ::text para estados extendidos en prod.

-- =============================================================================
-- 1) DIAGNÓSTICO — cajas BOX con recepción PX y por qué no aparecen en bodega
-- =============================================================================
SELECT
  b.box_code,
  b.id AS box_id,
  b.rack_location,
  b.status AS box_status,
  b.created_at,
  r.guide_number,
  r.sap_document,
  r.status AS reception_status,
  (SELECT count(*) FROM public.series s WHERE s.current_box_id = b.id) AS series_en_caja,
  (SELECT count(*) FROM public.series s
   WHERE s.current_reception_id = r.id
     AND s.current_status::text IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL')
  ) AS series_recepcion_bodega,
  (SELECT count(*) FROM public.px_reception_equipment e
   WHERE e.box_id = b.id AND e.capture_status = 'active'
  ) AS equipos_px_staging
FROM public.boxes b
JOIN public.receptions r ON r.id = b.reception_id
WHERE b.box_code IN ('BOX-33', 'BOX-34')
   OR r.sap_document = 'TEST-0010'
ORDER BY b.box_code, b.created_at;

-- Cajas con series en bodega pero rack excluido del listado (ELIMINADO / PX_CAPTURA)
SELECT
  b.box_code,
  b.id,
  b.rack_location,
  r.sap_document,
  r.status AS reception_status,
  count(s.id) AS series_count
FROM public.series s
JOIN public.boxes b ON b.id = s.current_box_id
JOIN public.receptions r ON r.id = b.reception_id
WHERE s.current_status::text IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL')
  AND coalesce(b.rack_location, '') IN ('ELIMINADO', 'PX_CAPTURA')
GROUP BY b.id, b.box_code, b.rack_location, r.sap_document, r.status
ORDER BY b.box_code;

-- =============================================================================
-- 2) REPARAR — promover cajas PX finalizadas atascadas en PX_CAPTURA
-- =============================================================================
UPDATE public.boxes b
SET
  rack_location = 'BODEGA_CENTRAL',
  status = 'closed'::public.box_status,
  closed_at = coalesce(b.closed_at, now())
FROM public.receptions r
WHERE r.id = b.reception_id
  AND r.source = 'px'
  AND upper(r.status) = 'CLASIFICADA'
  AND coalesce(b.rack_location, 'PX_CAPTURA') = 'PX_CAPTURA'
  AND b.box_code ~ '^BOX-[0-9]+$'
  AND EXISTS (
    SELECT 1 FROM public.series s
    WHERE s.current_box_id = b.id
      AND s.current_status::text IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL')
  );

-- =============================================================================
-- 3) REPARAR — cajas marcadas ELIMINADO pero con inventario activo
-- =============================================================================
UPDATE public.boxes b
SET
  rack_location = 'BODEGA_CENTRAL',
  status = 'closed'::public.box_status
FROM public.series s
WHERE s.current_box_id = b.id
  AND s.current_status::text IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL')
  AND b.rack_location = 'ELIMINADO';

-- =============================================================================
-- 4) REPARAR — series PX en RECEPCIONADO_BODEGA_GENERAL → in_central_warehouse
-- =============================================================================
UPDATE public.series s
SET
  current_status = 'in_central_warehouse',
  updated_at = now()
FROM public.receptions r
WHERE r.id = s.current_reception_id
  AND r.source = 'px'
  AND upper(r.status) = 'CLASIFICADA'
  AND s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  AND s.current_box_id IS NOT NULL;

-- =============================================================================
-- 5) REPARAR — vincular series a caja si solo tienen reception_id (sin current_box_id)
-- =============================================================================
UPDATE public.series s
SET
  current_box_id = b.id,
  updated_at = now()
FROM public.boxes b
JOIN public.receptions r ON r.id = b.reception_id
WHERE s.current_reception_id = r.id
  AND s.current_box_id IS NULL
  AND r.source = 'px'
  AND upper(r.status) = 'CLASIFICADA'
  AND b.reception_id = r.id
  AND coalesce(b.rack_location, 'PX_CAPTURA') NOT IN ('ELIMINADO', 'DESPACHO')
  AND b.box_code ~ '^BOX-[0-9]+$'
  AND s.current_status::text IN ('in_central_warehouse', 'RECEPCIONADO_BODEGA_GENERAL');

-- =============================================================================
-- 6) VERIFICACIÓN — deben aparecer en Bodega General tras recargar
-- =============================================================================
SELECT
  b.box_code,
  b.rack_location,
  b.status,
  count(s.id) AS series_en_caja
FROM public.boxes b
LEFT JOIN public.series s ON s.current_box_id = b.id
WHERE b.box_code IN ('BOX-33', 'BOX-34')
GROUP BY b.id, b.box_code, b.rack_location, b.status
ORDER BY b.box_code;
