-- =============================================================================
-- 094 — Motor de Sincronización Incremental (MSI) + tablas KPI materializadas
-- Fase 1: kpi_audit_feed (incremental) + kpi_pipeline_wip (snapshot)
-- =============================================================================

-- ── Control del motor ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sync_process_config (
  process_id       text PRIMARY KEY,
  priority         smallint NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 3),
  interval_minutes integer  NOT NULL DEFAULT 7 CHECK (interval_minutes BETWEEN 1 AND 60),
  source_table     text     NOT NULL,
  cursor_type      text     NOT NULL DEFAULT 'created_at' CHECK (cursor_type IN ('created_at', 'updated_at', 'id')),
  enabled          boolean  NOT NULL DEFAULT true,
  description      text,
  last_run_at      timestamptz,
  last_success_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_watermarks (
  process_id       text PRIMARY KEY REFERENCES public.sync_process_config(process_id) ON DELETE CASCADE,
  cursor_ts        timestamptz NOT NULL DEFAULT '1970-01-01'::timestamptz,
  cursor_id        uuid,
  rows_processed   integer NOT NULL DEFAULT 0,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sync_run_log (
  id               bigserial PRIMARY KEY,
  process_id       text NOT NULL,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  status           text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'error')),
  rows_read        integer NOT NULL DEFAULT 0,
  rows_affected    integer NOT NULL DEFAULT 0,
  error_message    text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_run_log_process_started
  ON public.sync_run_log (process_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.kpi_invalidation_queue (
  id                 bigserial PRIMARY KEY,
  entity_type        text NOT NULL,
  entity_id          text NOT NULL,
  affected_fecha     date,
  affected_process   text,
  reason             text,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz,
  error_message      text
);

CREATE INDEX IF NOT EXISTS idx_kpi_invalidation_pending
  ON public.kpi_invalidation_queue (status, created_at)
  WHERE status = 'pending';

-- ── Ledger idempotente (evita doble conteo por record_id / audit) ─────────────

CREATE TABLE IF NOT EXISTS public.kpi_event_ledger (
  audit_id         uuid PRIMARY KEY,
  fecha            date NOT NULL,
  proceso          text NOT NULL,
  metrica          text NOT NULL,
  user_id          uuid,
  record_id        text,
  dimension_key    text NOT NULL DEFAULT 'ALL',
  branch_id        text,
  valor            numeric NOT NULL DEFAULT 1,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_event_ledger_fecha_proceso
  ON public.kpi_event_ledger (fecha, proceso, metrica);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_event_ledger_dedup
  ON public.kpi_event_ledger (fecha, proceso, metrica, record_id)
  WHERE record_id IS NOT NULL AND record_id <> '';

-- ── Proyecciones KPI ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kpi_diario (
  fecha            date NOT NULL,
  proceso          text NOT NULL,
  metrica          text NOT NULL,
  dimension_key    text NOT NULL DEFAULT 'ALL',
  valor            numeric NOT NULL DEFAULT 0,
  valor_secundario numeric,
  source_version   smallint NOT NULL DEFAULT 1,
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, proceso, metrica, dimension_key)
);

CREATE TABLE IF NOT EXISTS public.kpi_usuario (
  fecha            date NOT NULL,
  user_id          uuid NOT NULL,
  proceso          text NOT NULL,
  metrica          text NOT NULL,
  valor            numeric NOT NULL DEFAULT 0,
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, user_id, proceso, metrica)
);

CREATE TABLE IF NOT EXISTS public.kpi_proceso (
  fecha            date NOT NULL,
  metrica          text NOT NULL,
  valor            numeric NOT NULL DEFAULT 0,
  refreshed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fecha, metrica)
);

CREATE INDEX IF NOT EXISTS idx_kpi_diario_fecha ON public.kpi_diario (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_usuario_fecha ON public.kpi_usuario (fecha DESC);

-- ── Seeds de procesos ───────────────────────────────────────────────────────

INSERT INTO public.sync_process_config (process_id, priority, interval_minutes, source_table, cursor_type, description)
VALUES
  ('kpi_audit_feed', 1, 5, 'erp_audit_logs', 'created_at',
   'Incremental: producción taller, despacho, bodega desde erp_audit_logs'),
  ('kpi_pipeline_wip', 1, 5, 'mv_dashboard', 'updated_at',
   'Snapshot WIP pipeline (recepción→despacho) desde MVs'),
  ('kpi_recepcion', 2, 7, 'receptions', 'created_at',
   'Incremental: recepción general (Fase 2)')
ON CONFLICT (process_id) DO NOTHING;

INSERT INTO public.sync_watermarks (process_id, cursor_ts, cursor_id)
SELECT process_id, '1970-01-01'::timestamptz, NULL
FROM public.sync_process_config
ON CONFLICT (process_id) DO NOTHING;

-- ── RLS: lectura autenticada, escritura solo service_role ───────────────────

ALTER TABLE public.kpi_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_usuario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_proceso ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kpi_diario_select ON public.kpi_diario;
CREATE POLICY kpi_diario_select ON public.kpi_diario FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS kpi_usuario_select ON public.kpi_usuario;
CREATE POLICY kpi_usuario_select ON public.kpi_usuario FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS kpi_proceso_select ON public.kpi_proceso;
CREATE POLICY kpi_proceso_select ON public.kpi_proceso FOR SELECT TO authenticated USING (true);

ALTER TABLE public.sync_process_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_watermarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_run_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_event_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_invalidation_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sync_process_config FROM PUBLIC, authenticated;
REVOKE ALL ON public.sync_watermarks FROM PUBLIC, authenticated;
REVOKE ALL ON public.sync_run_log FROM PUBLIC, authenticated;
REVOKE ALL ON public.kpi_event_ledger FROM PUBLIC, authenticated;
REVOKE ALL ON public.kpi_invalidation_queue FROM PUBLIC, authenticated;

GRANT SELECT ON public.kpi_diario TO authenticated;
GRANT SELECT ON public.kpi_usuario TO authenticated;
GRANT SELECT ON public.kpi_proceso TO authenticated;

NOTIFY pgrst, 'reload schema';
