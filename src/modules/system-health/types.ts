export type HealthOverall = 'ok' | 'degraded' | 'down';

export type HealthProbeStatus = 'ok' | 'error';

export type ExternalServiceStatus = 'ok' | 'error' | 'not_configured' | 'degraded';

export type CronJobStatus = 'ok' | 'error' | 'unknown' | 'stale';

export type SemaphoreTone = 'ok' | 'warn' | 'error' | 'unknown' | 'not_configured';

export type AlertSeverity = 'critical' | 'warning' | 'info';

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

export type ConnectedUserPresence = {
  sessionId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: string | null;
  ipAddress: string | null;
  connectedAt: string;
  lastSeenAt: string;
};

export type HealthAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  service: string;
  at: string;
  actionHint: string;
};

export type ServiceSemaphoreItem = {
  id: string;
  label: string;
  tone: SemaphoreTone;
  detail: string;
  latencyMs: number | null;
};

export type HealthScoreBreakdown = {
  api: number;
  database: number;
  queue: number;
  crons: number;
  sessions: number;
  integrations: number;
};

export type DeployMeta = {
  version: string;
  commitSha: string | null;
  commitShort: string | null;
  branch: string | null;
  environment: string;
  checkedAt: string;
};

export type LatencyStats = {
  avgMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
  sampleCount: number;
  note: string;
};

export type AvailabilityStats = {
  todayPct: number | null;
  d7Pct: number | null;
  d30Pct: number | null;
  note: string;
};

export type HttpStatusBucket = {
  code: string;
  count: number;
  pct: number;
};

export type IntegrationHealth = {
  id: string;
  label: string;
  status: ExternalServiceStatus;
  lastPingAt: string | null;
  latencyMs: number | null;
  lastError: string | null;
  note: string;
};

export type PostgresDeepHealth = {
  activeConnections: number | null;
  note: string;
};

export type PlatformProbes = {
  auth: ServiceProbe;
  storage: ServiceProbe;
  rest: ServiceProbe;
  realtime: ServiceProbe;
  edgeFunctions: ServiceProbe;
  postgres: PostgresDeepHealth;
};

export type QueueDeep = {
  pending: number | null;
  processing: number | null;
  failed: number | null;
  deadLetter: number | null;
  note: string;
};

export type SecuritySnapshot = {
  loginFailures24h: number | null;
  note: string;
};

export type BackupSnapshot = {
  status: ExternalServiceStatus;
  lastBackupAt: string | null;
  note: string;
};

export type DiagnosisHint = {
  needsIntervention: boolean;
  severity: AlertSeverity | 'none';
  summary: string;
  affectedUsers: number | null;
  failedService: string | null;
  recommendedAction: string;
};

export type SparkPoint = { t: string; v: number };

export type SystemHealthReport = {
  overall: HealthOverall;
  checkedAt: string;
  healthScore: number;
  scoreBreakdown: HealthScoreBreakdown;
  riskLabel: 'Bajo' | 'Medio' | 'Alto' | 'Crítico';
  intervene: boolean;
  alerts: HealthAlert[];
  semaphore: ServiceSemaphoreItem[];
  deploy: DeployMeta;
  diagnosis: DiagnosisHint;
  api: {
    status: HealthProbeStatus;
    latencyMs: number;
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
  platform: PlatformProbes;
  redis: ServiceProbe;
  bullmq: ServiceProbe & {
    queueEngine: 'postgres_outbox';
    queueBacklog: number | null;
  };
  traffic: {
    requestsPerMinute: number | null;
    requestsPerSecond: number | null;
    requestsPerHour: number | null;
    avgResponseMs: number | null;
    peakRpm24h: number | null;
    note: string;
  };
  latency: LatencyStats;
  availability: AvailabilityStats;
  httpStatus: {
    buckets: HttpStatusBucket[];
    note: string;
  };
  users: {
    connected: number | null;
    sessions: number | null;
    idleMinutes: number;
    note: string;
    connectedUsers: ConnectedUserPresence[];
  };
  queues: {
    outboxPending: number | null;
    outboxFailed: number | null;
    kpiInvalidationPending: number | null;
  };
  queueDeep: QueueDeep;
  integrations: IntegrationHealth[];
  security: SecuritySnapshot;
  backups: BackupSnapshot;
  performanceSparks: {
    rpm: SparkPoint[];
    latency: SparkPoint[];
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
export const OUTBOX_PENDING_CRITICAL_THRESHOLD = 2000;
