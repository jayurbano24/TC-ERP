import {
  OUTBOX_PENDING_CRITICAL_THRESHOLD,
  OUTBOX_PENDING_DEGRADED_THRESHOLD,
  type CronJobHealth,
  type DiagnosisHint,
  type ExternalServiceStatus,
  type HealthAlert,
  type HealthOverall,
  type HealthScoreBreakdown,
  type SemaphoreTone,
  type ServiceSemaphoreItem,
} from '../types';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function scoreComponentApi(apiOk: boolean, latencyMs: number): number {
  if (!apiOk) return 0;
  if (latencyMs > 3000) return 40;
  if (latencyMs > 1500) return 70;
  if (latencyMs > 800) return 85;
  return 100;
}

export function scoreComponentDb(dbOk: boolean, latencyMs: number): number {
  if (!dbOk) return 0;
  if (latencyMs > 2000) return 40;
  if (latencyMs > 800) return 70;
  if (latencyMs > 400) return 85;
  return 100;
}

export function scoreComponentQueue(
  pending: number | null,
  failed: number | null
): number {
  if ((failed ?? 0) > 0) return 35;
  if (pending == null) return 70;
  if (pending >= OUTBOX_PENDING_CRITICAL_THRESHOLD) return 25;
  if (pending >= OUTBOX_PENDING_DEGRADED_THRESHOLD) return 55;
  if (pending >= 20) return 85;
  return 100;
}

export function scoreComponentCrons(crons: CronJobHealth[]): number {
  if (crons.length === 0) return 70;
  const errors = crons.filter((c) => c.status === 'error').length;
  const stale = crons.filter((c) => c.status === 'stale').length;
  const unknown = crons.filter((c) => c.status === 'unknown').length;
  if (errors > 0) return clamp(40 - errors * 10);
  if (stale > 0) return clamp(70 - stale * 8);
  if (unknown === crons.length) return 75;
  if (unknown > 0) return 85;
  return 100;
}

export function scoreComponentSessions(connected: number | null): number {
  // Presencia operativa: no penaliza 0 usuarios (fuera de horario).
  if (connected == null) return 80;
  return 100;
}

export function scoreComponentIntegrations(
  items: { status: ExternalServiceStatus }[]
): number {
  const relevant = items.filter((i) => i.status !== 'not_configured');
  if (relevant.length === 0) return 85;
  const bad = relevant.filter((i) => i.status === 'error').length;
  const deg = relevant.filter((i) => i.status === 'degraded').length;
  if (bad > 0) return clamp(30 - bad * 10);
  if (deg > 0) return clamp(70 - deg * 10);
  return 100;
}

/** Pesos plan: API 20, DB 20, Queue 20, Crons 15, Sessions 10, Integrations 15 */
export function computeHealthScore(parts: HealthScoreBreakdown): number {
  const total =
    parts.api * 0.2 +
    parts.database * 0.2 +
    parts.queue * 0.2 +
    parts.crons * 0.15 +
    parts.sessions * 0.1 +
    parts.integrations * 0.15;
  return Math.round(clamp(total));
}

export function riskFromScore(score: number, overall: HealthOverall): 'Bajo' | 'Medio' | 'Alto' | 'Crítico' {
  if (overall === 'down' || score < 40) return 'Crítico';
  if (overall === 'degraded' || score < 70) return 'Alto';
  if (score < 90) return 'Medio';
  return 'Bajo';
}

export function buildAlerts(input: {
  checkedAt: string;
  apiOk: boolean;
  dbOk: boolean;
  apiLatencyMs: number;
  outboxPending: number | null;
  outboxFailed: number | null;
  syncFailures24h: number;
  crons: CronJobHealth[];
}): HealthAlert[] {
  const alerts: HealthAlert[] = [];
  const at = input.checkedAt;

  if (!input.apiOk) {
    alerts.push({
      id: 'api-down',
      severity: 'critical',
      title: 'API no responde',
      detail: 'El probe /api/health falló.',
      service: 'API',
      at,
      actionHint: 'Revisar despliegue Vercel y logs de la función.',
    });
  } else if (input.apiLatencyMs > 1500) {
    alerts.push({
      id: 'api-slow',
      severity: 'warning',
      title: 'API lenta',
      detail: `Probe en ${input.apiLatencyMs} ms.`,
      service: 'API',
      at,
      actionHint: 'Revisar carga y consultas lentas.',
    });
  }

  if (!input.dbOk) {
    alerts.push({
      id: 'db-down',
      severity: 'critical',
      title: 'Base de datos inaccesible',
      detail: 'No se pudo consultar Supabase/Postgres.',
      service: 'Database',
      at,
      actionHint: 'Verificar service role, RLS y estado del proyecto Supabase.',
    });
  }

  if ((input.outboxFailed ?? 0) > 0) {
    alerts.push({
      id: 'outbox-failed',
      severity: 'critical',
      title: 'Outbox con fallos',
      detail: `${input.outboxFailed} eventos FAILED.`,
      service: 'Queue',
      at,
      actionHint: 'Revisar errores en outbox_event y reintentar / DLQ.',
    });
  }

  if (
    typeof input.outboxPending === 'number' &&
    input.outboxPending >= OUTBOX_PENDING_CRITICAL_THRESHOLD
  ) {
    alerts.push({
      id: 'outbox-critical',
      severity: 'critical',
      title: 'Cola outbox crítica',
      detail: `${input.outboxPending} PENDING (umbral ${OUTBOX_PENDING_CRITICAL_THRESHOLD}).`,
      service: 'Queue',
      at,
      actionHint: 'Verificar cron outbox-publish y throughput.',
    });
  } else if (
    typeof input.outboxPending === 'number' &&
    input.outboxPending >= OUTBOX_PENDING_DEGRADED_THRESHOLD
  ) {
    alerts.push({
      id: 'outbox-high',
      severity: 'warning',
      title: 'Cola outbox elevada',
      detail: `${input.outboxPending} PENDING.`,
      service: 'Queue',
      at,
      actionHint: 'Monitorear drenado; backlog alto puede ser esperado en picos.',
    });
  }

  if (input.syncFailures24h > 0) {
    alerts.push({
      id: 'sync-failures',
      severity: 'warning',
      title: 'Fallos de sync (24h)',
      detail: `${input.syncFailures24h} errores en sync_run_log.`,
      service: 'Sync',
      at,
      actionHint: 'Abrir Errores 24h y corregir procesos KPI/cron.',
    });
  }

  for (const cron of input.crons) {
    if (cron.status === 'error') {
      alerts.push({
        id: `cron-error-${cron.path}`,
        severity: 'critical',
        title: `Cron en error: ${cron.label}`,
        detail: cron.path,
        service: 'Cron',
        at: cron.lastErrorAt || at,
        actionHint: 'Revisar logs Vercel del path interno.',
      });
    } else if (cron.status === 'stale') {
      alerts.push({
        id: `cron-stale-${cron.path}`,
        severity: 'warning',
        title: `Cron stale: ${cron.label}`,
        detail: 'Sin éxito reciente según heartbeat.',
        service: 'Cron',
        at: cron.lastSuccessAt || at,
        actionHint: 'Confirmar CRON_SECRET y schedule en Vercel.',
      });
    }
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function buildSemaphore(input: {
  apiOk: boolean;
  apiLatencyMs: number;
  dbOk: boolean;
  dbLatencyMs: number;
  authStatus: ExternalServiceStatus;
  storageStatus: ExternalServiceStatus;
  outboxPending: number | null;
  outboxFailed: number | null;
  crons: CronJobHealth[];
  cacheStatus: ExternalServiceStatus;
}): ServiceSemaphoreItem[] {
  const queueTone: SemaphoreTone =
    (input.outboxFailed ?? 0) > 0
      ? 'error'
      : (input.outboxPending ?? 0) >= OUTBOX_PENDING_CRITICAL_THRESHOLD
        ? 'error'
        : (input.outboxPending ?? 0) >= OUTBOX_PENDING_DEGRADED_THRESHOLD
          ? 'warn'
          : 'ok';

  const cronErrors = input.crons.some((c) => c.status === 'error');
  const cronStale = input.crons.some((c) => c.status === 'stale');
  const cronTone: SemaphoreTone = cronErrors
    ? 'error'
    : cronStale
      ? 'warn'
      : input.crons.every((c) => c.status === 'unknown')
        ? 'unknown'
        : 'ok';

  const mapExt = (s: ExternalServiceStatus): SemaphoreTone => {
    if (s === 'ok') return 'ok';
    if (s === 'degraded') return 'warn';
    if (s === 'error') return 'error';
    if (s === 'not_configured') return 'not_configured';
    return 'unknown';
  };

  return [
    {
      id: 'api',
      label: 'API',
      tone: input.apiOk ? (input.apiLatencyMs > 1500 ? 'warn' : 'ok') : 'error',
      detail: `${input.apiLatencyMs} ms`,
      latencyMs: input.apiLatencyMs,
    },
    {
      id: 'database',
      label: 'Database',
      tone: input.dbOk ? (input.dbLatencyMs > 800 ? 'warn' : 'ok') : 'error',
      detail: `${input.dbLatencyMs} ms`,
      latencyMs: input.dbLatencyMs,
    },
    {
      id: 'queue',
      label: 'Queue',
      tone: queueTone,
      detail: `${input.outboxPending ?? '—'} pending`,
      latencyMs: null,
    },
    {
      id: 'storage',
      label: 'Storage',
      tone: mapExt(input.storageStatus),
      detail: input.storageStatus,
      latencyMs: null,
    },
    {
      id: 'auth',
      label: 'Auth',
      tone: mapExt(input.authStatus),
      detail: input.authStatus,
      latencyMs: null,
    },
    {
      id: 'cache',
      label: 'Cache',
      tone: mapExt(input.cacheStatus),
      detail: 'Redis N/D',
      latencyMs: null,
    },
    {
      id: 'crons',
      label: 'Cron Jobs',
      tone: cronTone,
      detail: `${input.crons.filter((c) => c.status === 'ok').length}/${input.crons.length} ok`,
      latencyMs: null,
    },
  ];
}

export function buildDiagnosis(input: {
  overall: HealthOverall;
  alerts: HealthAlert[];
  connectedUsers: number | null;
}): DiagnosisHint {
  const critical = input.alerts.filter((a) => a.severity === 'critical');
  const top = critical[0] || input.alerts[0];
  if (!top) {
    return {
      needsIntervention: false,
      severity: 'none',
      summary: 'Sin incidentes activos. Plataforma dentro de umbrales.',
      affectedUsers: input.connectedUsers,
      failedService: null,
      recommendedAction: 'Continuar monitoreo; no se requiere intervención.',
    };
  }
  return {
    needsIntervention: top.severity === 'critical' || input.overall === 'down',
    severity: top.severity,
    summary: top.title,
    affectedUsers: input.connectedUsers,
    failedService: top.service,
    recommendedAction: top.actionHint,
  };
}

export function resolveOverallFromScore(
  score: number,
  apiOk: boolean,
  dbOk: boolean
): HealthOverall {
  if (!apiOk || !dbOk || score < 40) return 'down';
  if (score < 85) return 'degraded';
  return 'ok';
}
