export type HealthOverall = 'ok' | 'degraded' | 'down';

export type HealthProbeStatus = 'ok' | 'error';

export type ExternalServiceStatus = 'ok' | 'error' | 'not_configured';

export type CronJobStatus = 'ok' | 'error' | 'unknown' | 'stale';

export type HealthErrorSample = {
  source: 'sync_run_log' | 'outbox_event';
  id: string;
  processOrEvent: string;
  message: string;
  at: string;
};

export type CronJobHealth = {
  path: string;
  schedule: string;
  label: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  status: CronJobStatus;
};

export type ServiceProbe = {
  status: ExternalServiceStatus;
  latencyMs: number | null;
  note?: string;
};

export type SystemHealthReport = {
  overall: HealthOverall;
  checkedAt: string;
  api: {
    status: HealthProbeStatus;
    /** Latencia del probe /api/health (no del agregador completo). */
    latencyMs: number;
    /** Tiempo total del agregador de salud. */
    aggregateMs: number;
    version: string;
    service: string;
  };
  database: {
    status: HealthProbeStatus;
    latencyMs: number;
    error?: string;
  };
  supabase: {
    reachable: boolean;
    latencyMs: number;
    schema: string;
    error?: string;
  };
  /** Redis no está en el stack actual. */
  redis: ServiceProbe;
  /**
   * BullMQ no está en el stack; las colas viven en Postgres (outbox / KPI).
   * `queueBacklog` refleja trabajo pendiente equivalente.
   */
  bullmq: ServiceProbe & {
    queueEngine: 'postgres_outbox';
    queueBacklog: number | null;
  };
  traffic: {
    /** Proxy: eventos erp_audit_logs en el último minuto. */
    requestsPerMinute: number | null;
    /** Latencia del probe API (ms). */
    avgResponseMs: number | null;
    note: string;
  };
  users: {
    connected: number | null;
    sessions: number | null;
    note: string;
  };
  queues: {
    outboxPending: number | null;
    outboxFailed: number | null;
    kpiInvalidationPending: number | null;
  };
  errors24h: {
    syncFailures: number;
    outboxFailed: number;
    samples: HealthErrorSample[];
  };
  crons: CronJobHealth[];
  host: {
    cpu: null;
    ram: null;
    disk: null;
    note: string;
  };
  consumption: {
    receptions24h: number | null;
    auditLogs24h: number | null;
    domainEvents7d: number | null;
    outboxBacklog: number | null;
  };
};

export const OUTBOX_PENDING_DEGRADED_THRESHOLD = 100;
