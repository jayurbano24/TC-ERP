-- Índices de rendimiento — consultas masivas TC-ERP
-- Aplicar después de analyze_db_indexes.sql confirme índices faltantes.
-- En producción con mucho tráfico, preferir CONCURRENTLY vía psql directo (5432).

-- series: joins OS + filtros WIP (kpi-engine, workshop, derive_os_operational_state)
CREATE INDEX IF NOT EXISTS idx_series_service_order_id
  ON public.series(service_order_id)
  WHERE service_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_series_current_status
  ON public.series(current_status);

CREATE INDEX IF NOT EXISTS idx_series_status_so
  ON public.series(current_status, service_order_id);

-- Búsqueda por serial en audit/Motor 4 (evita Seq Scan en upper(trim(serial_number)))
CREATE INDEX IF NOT EXISTS idx_series_serial_normalized
  ON public.series (upper(trim(serial_number)));

CREATE INDEX IF NOT EXISTS idx_so_main_serial_normalized
  ON public.service_orders (upper(trim(main_serial)))
  WHERE main_serial IS NOT NULL;

-- erp_audit_logs: KPI por acción + periodo (evita seq scan en millones de filas)
CREATE INDEX IF NOT EXISTS idx_audit_action_created
  ON public.erp_audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_record_id
  ON public.erp_audit_logs(record_id)
  WHERE record_id IS NOT NULL;

-- receptions / guides: dashboards por periodo
CREATE INDEX IF NOT EXISTS idx_receptions_created_at
  ON public.receptions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_orders_reception_id
  ON public.service_orders(reception_id)
  WHERE reception_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rg_reception_classified
  ON public.reception_guides(reception_id, classified_at DESC NULLS LAST);

-- cac_tray_units: KPI cola backoffice (is_active + unit_status)
CREATE INDEX IF NOT EXISTS idx_cac_tray_active_status
  ON public.cac_tray_units(is_active, unit_status)
  WHERE is_active = true;

-- domain_events (si tabla existe — migración 045+)
DO $$
BEGIN
  IF to_regclass('public.domain_events') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_domain_events_occurred
      ON public.domain_events(occurred_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate
      ON public.domain_events(aggregate_type, aggregate_id, occurred_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_domain_events_correlation
      ON public.domain_events(correlation_id, occurred_at DESC)
      WHERE correlation_id IS NOT NULL';
  END IF;
END $$;

ANALYZE public.series;
ANALYZE public.erp_audit_logs;
ANALYZE public.cac_tray_units;
ANALYZE public.receptions;
ANALYZE public.service_orders;
