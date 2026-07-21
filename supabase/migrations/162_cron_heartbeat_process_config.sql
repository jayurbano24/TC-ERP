-- =============================================================================
-- 162 — Heartbeats de crons Vercel en sync_process_config
-- =============================================================================
-- Salud lee last_success_at / sync_run_log por process_id. Los jobs internos
-- (outbox, refresh, attendance) y los tiers KPI tienen process_id dedicado.
-- enabled=false: el orchestrator KPI no los ejecuta.
-- =============================================================================

INSERT INTO public.sync_process_config (
  process_id, priority, interval_minutes, source_table, cursor_type, enabled, description
)
VALUES
  ('cron_outbox_publish', 3, 1, 'cron', 'created_at', false,
   'Heartbeat: Vercel cron outbox-publish'),
  ('cron_kpi_sync_critical', 3, 5, 'cron', 'created_at', false,
   'Heartbeat: Vercel cron kpi-sync tier=critical'),
  ('cron_kpi_sync_standard', 3, 7, 'cron', 'created_at', false,
   'Heartbeat: Vercel cron kpi-sync tier=standard'),
  ('cron_refresh_summary_views', 3, 10, 'cron', 'created_at', false,
   'Heartbeat: Vercel cron refresh-summary-views'),
  ('cron_attendance_close_open', 3, 15, 'cron', 'created_at', false,
   'Heartbeat: Vercel cron attendance-close-open')
ON CONFLICT (process_id) DO UPDATE
SET
  interval_minutes = EXCLUDED.interval_minutes,
  source_table = EXCLUDED.source_table,
  enabled = false,
  description = EXCLUDED.description;
