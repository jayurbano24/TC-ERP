-- 256 — Identidad de evento KPI: un audit_id puede emitir varias métricas (ej. QC completado + rechazado).
-- Corrige upsert PostgREST on_conflict=audit_id cuando solo existía dedup parcial por record_id.

ALTER TABLE public.kpi_event_ledger
  DROP CONSTRAINT IF EXISTS kpi_event_ledger_pkey;

ALTER TABLE public.kpi_event_ledger
  ADD CONSTRAINT kpi_event_ledger_pkey
  PRIMARY KEY (audit_id, proceso, metrica, dimension_key);

COMMENT ON CONSTRAINT kpi_event_ledger_pkey ON public.kpi_event_ledger IS
  'Un erp_audit_logs.id puede mapear a N filas (classifyAuditMetrics). Upsert: audit_id,proceso,metrica,dimension_key.';

-- Dedup por record_id de negocio (parcial) se mantiene; no usar como on_conflict de PostgREST.
COMMENT ON INDEX public.idx_kpi_event_ledger_dedup IS
  'Evita doble conteo por mismo record_id/métrica/día; independiente de audit_id. Reconciliar duplicados antes de CREATE UNIQUE si falla.';

NOTIFY pgrst, 'reload schema';
