-- Validación: series RECEPCIONADO_BODEGA_GENERAL (pendientes ingreso físico bodega)
-- Ejecutar en Supabase SQL Editor

-- =============================================================================
-- 1) TOTAL global por estado de serie
-- =============================================================================
SELECT
  current_status::text AS estado_serie,
  count(*) AS n
FROM public.series
WHERE current_status::text IN (
  'RECEPCIONADO_BODEGA_GENERAL',
  'in_central_warehouse',
  'in_control_warehouse'
)
GROUP BY 1
ORDER BY n DESC;

-- =============================================================================
-- 2) Desglose por recepción / guía / fuente (respuesta: ¿un lote o todos?)
-- =============================================================================
SELECT
  r.source,
  r.guide_number,
  r.sap_document,
  r.status AS reception_status,
  count(s.id) AS series_pendientes,
  count(s.id) FILTER (WHERE s.sap_transfer_id IS NOT NULL) AS con_sap_transfer,
  count(s.id) FILTER (WHERE s.current_box_id IS NOT NULL) AS con_caja
FROM public.series s
JOIN public.receptions r ON r.id = s.current_reception_id
WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
GROUP BY r.id, r.source, r.guide_number, r.sap_document, r.status
ORDER BY series_pendientes DESC;

-- =============================================================================
-- 3) Solo elegibles para escaneo en Bodega Gestión
--    (recepción clasificada u OS existente — alineado con canScanSeriesIntoWarehouse)
-- =============================================================================
SELECT
  r.guide_number,
  r.sap_document,
  r.status AS reception_status,
  count(s.id) AS series_elegibles
FROM public.series s
JOIN public.receptions r ON r.id = s.current_reception_id
LEFT JOIN public.service_orders so ON so.id = s.service_order_id
WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  AND (
    upper(coalesce(r.status, '')) IN (
      'CLASIFICADA', 'PROCESADO', 'RECIBIDO_BACKOFFICE', 'RECIBIDO',
      'PENDIENTE DE CLASIFICAR', 'PENDIENTE_CLASIFICAR'
    )
    OR so.id IS NOT NULL
  )
GROUP BY r.id, r.guide_number, r.sap_document, r.status
HAVING count(s.id) > 0
ORDER BY series_elegibles DESC;

-- =============================================================================
-- 4) Recepciones CLASIFICADAS pero series aún sin ingreso físico (acción bodega)
-- =============================================================================
SELECT
  r.guide_number,
  r.sap_document,
  count(s.id) AS series_sin_ingresar
FROM public.series s
JOIN public.receptions r ON r.id = s.current_reception_id
WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  AND upper(r.status) = 'CLASIFICADA'
GROUP BY r.id, r.guide_number, r.sap_document
ORDER BY series_sin_ingresar DESC;

-- =============================================================================
-- 5) Cruce con sap_transfer_documents (los 55 PENDIENTE_INGRESO_BODEGA)
-- =============================================================================
SELECT
  std.sap_document_number,
  std.status AS sap_doc_status,
  std.agency,
  count(s.id) AS series_vinculadas,
  count(s.id) FILTER (WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL') AS pendientes_bodega,
  count(s.id) FILTER (WHERE s.current_status::text = 'in_central_warehouse') AS en_bodega
FROM public.sap_transfer_documents std
LEFT JOIN public.series s ON s.sap_transfer_id = std.id
WHERE std.status = 'PENDIENTE_INGRESO_BODEGA'
GROUP BY std.id, std.sap_document_number, std.status, std.agency
ORDER BY series_vinculadas DESC;

-- =============================================================================
-- 6) Series pendientes SIN documento SAP (huérfanas de traslado)
-- =============================================================================
SELECT
  r.guide_number,
  r.status,
  count(*) AS n
FROM public.series s
JOIN public.receptions r ON r.id = s.current_reception_id
WHERE s.current_status::text = 'RECEPCIONADO_BODEGA_GENERAL'
  AND s.sap_transfer_id IS NULL
GROUP BY r.id, r.guide_number, r.status
ORDER BY n DESC;
