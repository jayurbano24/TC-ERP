export type SyncTier = 'critical' | 'standard' | 'all';

export type SyncProcessConfig = {
  process_id: string;
  priority: number;
  interval_minutes: number;
  source_table: string;
  cursor_type: string;
  enabled: boolean;
  description: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
};

export type SyncWatermark = {
  process_id: string;
  cursor_ts: string;
  cursor_id: string | null;
  rows_processed: number;
  updated_at: string;
};

export type AuditMetricEvent = {
  proceso: string;
  metrica: string;
  dimensionKey?: string;
};

export type SyncRunResult = {
  processId: string;
  status: 'success' | 'error' | 'skipped';
  rowsRead: number;
  rowsAffected: number;
  error?: string;
  metadata?: Record<string, unknown>;
};

export const KPI_TZ = 'America/Guatemala';
