-- Validación: domain_events (Proceso 2 — timeline estructurado)
-- Ejecutar en Supabase SQL Editor DESPUÉS de migración 045
--
-- Si audit_cac_30d / events_cac_30d = 0: normal hasta la primera clasificación CAC
-- POST-045 o devolución bloque POST-044.
-- PX: aplicar migración 046 para backfill; nuevas capturas vía emitPxDomainEvent (dual-write).

-- =============================================================================
-- 0) BACKFILL PX (solo una vez, migración 046)
-- =============================================================================
-- SELECT public.audit_domain_events_stats(30);

-- =============================================================================
-- 1) RESUMEN (últimos 30 días)
-- =============================================================================
SELECT public.audit_domain_events_stats(30);

-- =============================================================================
-- 2) EVENTOS POR TIPO
-- =============================================================================
SELECT
  event_type,
  source,
  count(*) AS eventos,
  max(occurred_at) AS ultimo
FROM public.domain_events
WHERE occurred_at > now() - interval '30 days'
GROUP BY event_type, source
ORDER BY eventos DESC;

-- =============================================================================
-- 3) TIMELINE POR RECEPCIÓN (usa la recepción CAC más reciente en bandeja)
-- =============================================================================
SELECT e.*
FROM public.cac_tray_units t
CROSS JOIN LATERAL public.get_correlation_timeline(t.reception_id, 20) e
WHERE t.is_active
ORDER BY t.classified_at DESC, e.occurred_at DESC
LIMIT 50;

-- Alternativa: una recepción concreta (copiar id de la consulta anterior)
-- SELECT * FROM public.get_correlation_timeline('29877a89-a6a4-417d-b4d8-25e74f47d712'::uuid, 50);

-- =============================================================================
-- 4) TIMELINE POR OS / SERIE / SAP (ejemplos auto con datos reales)
-- =============================================================================
SELECT e.*
FROM public.cac_tray_units t
CROSS JOIN LATERAL public.get_entity_timeline('service_order', t.service_order_id::text, 15) e
WHERE t.is_active
ORDER BY t.classified_at DESC, e.occurred_at DESC
LIMIT 30;

-- SELECT e.*
-- FROM public.cac_tray_units t
-- CROSS JOIN LATERAL public.get_entity_timeline('sap_transfer_document', t.sap_transfer_id::text, 15) e
-- WHERE t.is_active AND t.sap_transfer_id IS NOT NULL
-- ORDER BY t.classified_at DESC, e.occurred_at DESC
-- LIMIT 30;

-- =============================================================================
-- 5) DUAL-WRITE: audit CAC vs domain_events (últimos 30 días)
-- =============================================================================
SELECT
  (SELECT count(*) FROM public.erp_audit_logs
   WHERE module = 'cac_backoffice' AND created_at > now() - interval '30 days') AS audit_cac_30d,
  (SELECT count(*) FROM public.erp_audit_logs
   WHERE module = 'px_reception' AND created_at > now() - interval '30 days') AS audit_px_30d,
  (SELECT count(*) FROM public.domain_events
   WHERE source = 'cac_backoffice' AND occurred_at > now() - interval '30 days') AS events_cac_30d,
  (SELECT count(*) FROM public.domain_events
   WHERE source = 'px_reception' AND occurred_at > now() - interval '30 days') AS events_px_30d,
  (SELECT count(*) FROM public.domain_events
   WHERE audit_log_id IS NOT NULL AND occurred_at > now() - interval '30 days') AS events_linked_audit;

-- Detalle eventos recientes
-- SELECT occurred_at, event_type, aggregate_type, aggregate_id, payload
-- FROM public.domain_events
-- ORDER BY occurred_at DESC
-- LIMIT 25;
