-- Validación y reparación: agency_name / sap_document_number en cac_tray_units
-- Ejecutar en Supabase SQL Editor

-- =============================================================================
-- 1) RESUMEN DE CALIDAD (ejecutar primero)
-- =============================================================================
-- sap_formato_traslado_cac (415XXXXXX-N) es FORMATO VÁLIDO en CAC — no es error por sí solo.
SELECT
  count(*) FILTER (WHERE t.is_active) AS filas_activas,
  count(*) FILTER (WHERE t.is_active AND coalesce(t.sap_document_number, '') IN ('', '---')) AS sin_sap_doc,
  count(*) FILTER (WHERE t.is_active AND coalesce(t.agency_name, '') IN ('', '---')) AS sin_agencia,
  count(*) FILTER (WHERE t.is_active AND t.sap_transfer_id IS NOT NULL
    AND coalesce(t.sap_document_number, '') IN ('', '---')) AS tiene_sap_id_pero_sin_doc,
  count(*) FILTER (WHERE t.is_active AND t.agency_name IS NOT NULL
    AND t.carrier IS NOT NULL AND lower(trim(t.agency_name)) = lower(trim(t.carrier))) AS agencia_igual_courier,
  count(*) FILTER (
    WHERE t.is_active
      AND coalesce(t.sap_document_number, '---') NOT IN ('', '---')
      AND NOT EXISTS (
        SELECT 1 FROM public.sap_transfer_documents std
        WHERE std.reception_id = t.reception_id
          AND std.sap_document_number = t.sap_document_number
      )
  ) AS sap_sin_fuente_canonica,
  count(*) FILTER (
    WHERE t.is_active
      AND t.sap_transfer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.sap_transfer_documents std
        WHERE std.id = t.sap_transfer_id
          AND coalesce(trim(std.agency), '') = ''
      )
  ) AS sap_canonico_sin_agencia,
  count(*) FILTER (WHERE t.is_active AND t.sap_document_number ~ '^\d+-\d+$') AS sap_formato_traslado_cac
FROM public.cac_tray_units t;

-- =============================================================================
-- 1b) SAP CANÓNICO SIN AGENCIA (acción manual pendiente)
-- =============================================================================
SELECT
  std.sap_document_number,
  std.agency,
  rg.guide_number,
  count(t.service_order_id) AS filas_tray
FROM public.cac_tray_units t
JOIN public.sap_transfer_documents std ON std.id = t.sap_transfer_id
LEFT JOIN public.reception_guides rg ON rg.id = std.reception_guide_id
WHERE t.is_active
  AND coalesce(trim(std.agency), '') = ''
GROUP BY std.sap_document_number, std.agency, rg.guide_number
ORDER BY filas_tray DESC;

-- =============================================================================
-- 2) TRAY vs FUENTE CANÓNICA (detecta desincronización por SQL manual o backfill)
-- =============================================================================
SELECT
  t.os_label,
  t.guide_number,
  t.sap_document_number AS tray_sap,
  std.sap_document_number AS fuente_sap_tabla,
  t.agency_name AS tray_agencia,
  coalesce(std.agency, rg.agency) AS fuente_agencia,
  t.sap_transfer_id,
  t.updated_at AS tray_updated
FROM public.cac_tray_units t
JOIN public.service_orders so ON so.id = t.service_order_id
LEFT JOIN public.sap_transfer_documents std ON std.id = so.sap_transfer_id
LEFT JOIN public.reception_guides rg ON rg.id = so.reception_guide_id
WHERE t.is_active
  AND (
    (std.sap_document_number IS NOT NULL AND t.sap_document_number IS DISTINCT FROM std.sap_document_number)
    OR (coalesce(std.agency, rg.agency) IS NOT NULL AND t.agency_name IS DISTINCT FROM coalesce(std.agency, rg.agency))
    OR (t.sap_transfer_id IS NOT NULL AND coalesce(t.sap_document_number, '---') = '---')
  )
ORDER BY t.classified_at DESC
LIMIT 100;

-- =============================================================================
-- 3) DATOS HISTÓRICOS EN NOTAS (clasificaciones viejas sin sap_transfer_documents)
-- =============================================================================
SELECT
  t.os_label,
  t.guide_number,
  t.sap_document_number AS tray_sap,
  substring(r.notes FROM 'Backoffice_SAP:\s*([^\n]+)') AS notas_sap,
  t.agency_name AS tray_agencia,
  substring(r.notes FROM 'Backoffice_Agency:\s*([^\n]+)') AS notas_agencia,
  r.carrier
FROM public.cac_tray_units t
JOIN public.receptions r ON r.id = t.reception_id
WHERE t.is_active
  AND (
    coalesce(t.sap_document_number, '---') IN ('', '---')
    OR coalesce(t.agency_name, '') IN ('', '---')
  )
  AND (
    r.notes ~* 'Backoffice_SAP:'
    OR r.notes ~* 'Backoffice_Agency:'
  )
ORDER BY t.classified_at DESC
LIMIT 100;

-- =============================================================================
-- 4) OS sin sap_transfer_id pero con documento SAP canónico (migración 043)
-- =============================================================================
SELECT
  t.os_label,
  t.guide_number,
  t.sap_document_number,
  so.sap_transfer_id,
  std.id AS std_canonico_id,
  std.agency AS fuente_agencia
FROM public.cac_tray_units t
JOIN public.service_orders so ON so.id = t.service_order_id
JOIN public.sap_transfer_documents std
  ON std.reception_id = t.reception_id
 AND std.sap_document_number = t.sap_document_number
WHERE t.is_active
  AND so.sap_transfer_id IS NULL
ORDER BY t.classified_at DESC
LIMIT 50;

-- =============================================================================
-- 5) AUDIT RPC (después de migración 042/043)
-- =============================================================================
-- SELECT public.audit_cac_tray_metadata();
-- Campos 043: os_sin_vinculo_sap, recuperables_desde_notas (sin courier falso)

-- =============================================================================
-- 6) REPARACIÓN (después de migración 042/043)
-- =============================================================================
-- Dry-run: cuántas filas se re-sincronizarían
-- SELECT public.repair_cac_tray_metadata(5000, true);

-- Aplicar por lotes (repetir hasta processed = 0)
-- SELECT public.repair_cac_tray_metadata(500, false);

-- =============================================================================
-- 7) AUDIT CAC BACKOFFICE (después de migración 044)
-- =============================================================================
SELECT
  action,
  count(*) AS eventos,
  max(created_at) AS ultimo
FROM public.erp_audit_logs
WHERE module = 'cac_backoffice'
  AND created_at > now() - interval '30 days'
GROUP BY action
ORDER BY eventos DESC;

-- Muestra recientes
-- SELECT created_at, action, table_name, record_id, new_values
-- FROM public.erp_audit_logs
-- WHERE module = 'cac_backoffice'
-- ORDER BY created_at DESC
-- LIMIT 20;
