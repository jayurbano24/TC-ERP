-- 073: Corregir linter security_definer_view en vistas KPI Digital Twin
-- Las vistas deben respetar RLS del usuario que consulta (security_invoker).

CREATE OR REPLACE VIEW public.vw_kpi_ledger
WITH (security_invoker = true) AS
SELECT count(*)::bigint AS os_total FROM public.service_orders;

CREATE OR REPLACE VIEW public.vw_kpi_snapshot
WITH (security_invoker = true) AS
SELECT
  state_code,
  state_label,
  count(*)::bigint AS os_count
FROM public.service_order_operational_state
GROUP BY state_code, state_label
ORDER BY os_count DESC;

CREATE OR REPLACE VIEW public.vw_kpi_snapshot_reconciliation
WITH (security_invoker = true) AS
SELECT
  l.os_total AS ledger_total,
  coalesce(s.snapshot_total, 0) AS snapshot_total,
  l.os_total - coalesce(s.snapshot_total, 0) AS delta
FROM public.vw_kpi_ledger l
LEFT JOIN (
  SELECT sum(os_count)::bigint AS snapshot_total FROM public.vw_kpi_snapshot
) s ON true;

CREATE OR REPLACE VIEW public.vw_kpi_production
WITH (security_invoker = true) AS
SELECT
  stage_code,
  count(*) FILTER (WHERE visit_count >= 1)::bigint AS produccion_os,
  sum(rework_count)::bigint AS retrabajos_eventos,
  sum(visit_count)::bigint AS eventos_totales
FROM public.service_order_stage_summary
GROUP BY stage_code
ORDER BY stage_code;

CREATE OR REPLACE VIEW public.vw_kpi_production_today
WITH (security_invoker = true) AS
SELECT
  stage_code,
  count(*) FILTER (
    WHERE first_entered_at >= date_trunc('day', now())
      AND first_entered_at < date_trunc('day', now()) + interval '1 day'
  )::bigint AS produccion_hoy
FROM public.service_order_stage_summary
GROUP BY stage_code;

CREATE OR REPLACE VIEW public.vw_kpi_quality
WITH (security_invoker = true) AS
SELECT
  stage_code,
  sum(rework_count)::bigint AS retrabajos,
  count(*) FILTER (WHERE rework_count > 0)::bigint AS os_con_retrabajo
FROM public.service_order_stage_summary
WHERE rework_count > 0
GROUP BY stage_code;

GRANT SELECT ON public.vw_kpi_ledger TO authenticated, service_role;
GRANT SELECT ON public.vw_kpi_snapshot TO authenticated, service_role;
GRANT SELECT ON public.vw_kpi_snapshot_reconciliation TO authenticated, service_role;
GRANT SELECT ON public.vw_kpi_production TO authenticated, service_role;
GRANT SELECT ON public.vw_kpi_production_today TO authenticated, service_role;
GRANT SELECT ON public.vw_kpi_quality TO authenticated, service_role;

COMMENT ON VIEW public.vw_kpi_ledger IS 'Motor 1 — Libro mayor: COUNT(service_orders). security_invoker.';
COMMENT ON VIEW public.vw_kpi_snapshot IS 'Motor 2 — Snapshot: debe sumar vw_kpi_ledger.os_total.';
COMMENT ON VIEW public.vw_kpi_production IS 'Motor 4 — Producción por etapa (1ª visita) vs eventos/retrabajos.';

NOTIFY pgrst, 'reload schema';
