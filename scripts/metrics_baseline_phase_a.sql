-- Fase A — Métricas baseline (ejecutar en Supabase y guardar resultado como referencia)
-- Uso: comparar antes/después de cada migración Strangler.

-- =============================================================================
-- 1) Volumen diario (últimos 7 días)
-- =============================================================================
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Guatemala')::date AS dia,
  count(*) AS recepciones
FROM public.receptions
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- =============================================================================
-- 2) Despachos / movimientos bodega (ajustar si tabla difiere)
-- =============================================================================
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Guatemala')::date AS dia,
  count(*) AS movimientos
FROM public.erp_audit_logs
WHERE module IN ('warehouse', 'despacho', 'bodega')
  AND created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- =============================================================================
-- 3) Errores API / auditoría (proxy)
-- =============================================================================
SELECT
  date_trunc('day', created_at AT TIME ZONE 'America/Guatemala')::date AS dia,
  count(*) AS eventos_auditoria
FROM public.erp_audit_logs
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1 DESC;

-- =============================================================================
-- 4) Domain events (post-migración 050)
-- =============================================================================
SELECT public.audit_domain_events_stats(7);

-- =============================================================================
-- 5) Outbox pendiente (salud del worker)
-- =============================================================================
SELECT status, count(*) AS total
FROM public.outbox_event
GROUP BY status
ORDER BY status;
