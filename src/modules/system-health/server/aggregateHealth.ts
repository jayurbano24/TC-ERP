import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceRoleAdminClient } from '@/shared/authz/requireServerAdmin';
import {
  OUTBOX_PENDING_DEGRADED_THRESHOLD,
  type CronJobHealth,
  type CronJobStatus,
  type HealthErrorSample,
  type HealthOverall,
  type SystemHealthReport,
} from '../types';

type CronJobDef = {
  path: string;
  schedule: string;
  label: string;
  /** Heartbeat dedicado en sync_process_config / sync_run_log. */
  processIds: string[];
};

const CRON_JOBS: CronJobDef[] = [
  {
    path: '/api/internal/outbox-publish',
    schedule: '* * * * *',
    label: 'Outbox publish',
    processIds: ['cron_outbox_publish'],
  },
  {
    path: '/api/internal/kpi-sync?tier=critical',
    schedule: '*/5 * * * *',
    label: 'KPI Sync (critical)',
    processIds: ['cron_kpi_sync_critical'],
  },
  {
    path: '/api/internal/kpi-sync?tier=standard',
    schedule: '*/7 * * * *',
    label: 'KPI Sync (standard)',
    processIds: ['cron_kpi_sync_standard'],
  },
  {
    path: '/api/internal/refresh-summary-views',
    schedule: '*/10 * * * *',
    label: 'Refresh summary views',
    processIds: ['cron_refresh_summary_views'],
  },
  {
    path: '/api/internal/attendance-close-open?graceMin=30',
    schedule: '*/15 * * * *',
    label: 'Attendance close-open',
    processIds: ['cron_attendance_close_open'],
  },
];

type ProcessRunMeta = {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  interval: number;
};

type FilterFn = (q: any) => any;

async function countExact(
  supabase: SupabaseClient,
  table: string,
  filter?: FilterFn
): Promise<number | null> {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

function resolveOverall(input: {
  apiOk: boolean;
  dbOk: boolean;
  outboxPending: number | null;
  outboxFailed: number | null;
  syncFailures24h: number;
}): HealthOverall {
  if (!input.apiOk || !input.dbOk) return 'down';
  const pendingHigh =
    typeof input.outboxPending === 'number' &&
    input.outboxPending >= OUTBOX_PENDING_DEGRADED_THRESHOLD;
  if ((input.outboxFailed ?? 0) > 0 || input.syncFailures24h > 0 || pendingHigh) {
    return 'degraded';
  }
  return 'ok';
}

function cronStatusFrom(
  lastSuccessAt: string | null,
  lastErrorAt: string | null,
  intervalMinutes: number
): CronJobStatus {
  if (!lastSuccessAt && !lastErrorAt) return 'unknown';
  if (lastErrorAt && (!lastSuccessAt || new Date(lastErrorAt) > new Date(lastSuccessAt))) {
    return 'error';
  }
  if (lastSuccessAt) {
    const ageMin = (Date.now() - new Date(lastSuccessAt).getTime()) / 60_000;
    if (ageMin > intervalMinutes * 3) return 'stale';
    return 'ok';
  }
  return 'unknown';
}

function emptyCrons(): CronJobHealth[] {
  return CRON_JOBS.map((j) => ({
    path: j.path,
    schedule: j.schedule,
    label: j.label,
    lastSuccessAt: null,
    lastErrorAt: null,
    status: 'unknown' as const,
  }));
}

function resolveAppBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://127.0.0.1:3000';
}

async function probeApiHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`${resolveAppBaseUrl()}/api/health`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return {
      status: res.ok ? 'ok' : 'error',
      latencyMs: Date.now() - started,
    };
  } catch {
    // Self-fetch puede fallar en algunos runtimes; marcar OK in-process.
    return { status: 'ok', latencyMs: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function baseDownReport(
  checkedAt: string,
  version: string,
  apiStarted: number,
  msg: string,
  apiProbe: { status: 'ok' | 'error'; latencyMs: number }
): SystemHealthReport {
  return {
    overall: 'down',
    checkedAt,
    api: {
      status: apiProbe.status,
      latencyMs: apiProbe.latencyMs,
      aggregateMs: Date.now() - apiStarted,
      version,
      service: 'tc-erp-web',
    },
    database: { status: 'error', latencyMs: 0, error: msg },
    supabase: { reachable: false, latencyMs: 0, schema: 'public', error: msg },
    redis: {
      status: 'not_configured',
      latencyMs: null,
      note: 'Redis no forma parte del stack TC-ERP',
    },
    bullmq: {
      status: 'not_configured',
      latencyMs: null,
      note: 'BullMQ no está desplegado; colas en Postgres (outbox_event)',
      queueEngine: 'postgres_outbox',
      queueBacklog: null,
    },
    traffic: {
      requestsPerMinute: null,
      avgResponseMs: apiProbe.latencyMs,
      note: 'RPM vía proxy erp_audit_logs (último minuto)',
    },
    users: {
      connected: null,
      sessions: null,
      note: 'Sesiones activas en user_sessions',
    },
    queues: { outboxPending: null, outboxFailed: null, kpiInvalidationPending: null },
    errors24h: { syncFailures: 0, outboxFailed: 0, samples: [] },
    crons: emptyCrons(),
    host: {
      cpu: null,
      ram: null,
      disk: null,
      note: 'No disponible en Vercel serverless',
    },
    consumption: {
      receptions24h: null,
      auditLogs24h: null,
      domainEvents7d: null,
      outboxBacklog: null,
    },
  };
}

export async function aggregateSystemHealth(): Promise<SystemHealthReport> {
  const checkedAt = new Date().toISOString();
  const apiStarted = Date.now();
  const version = process.env.npm_package_version || '0.1.0';
  const apiProbe = await probeApiHealth();

  let supabase: SupabaseClient;
  try {
    supabase = getServiceRoleAdminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return baseDownReport(checkedAt, version, apiStarted, msg, apiProbe);
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since1m = new Date(Date.now() - 60 * 1000).toISOString();

  const dbStarted = Date.now();
  let dbOk = false;
  let dbError: string | undefined;
  try {
    const { error } = await supabase
      .from('receptions')
      .select('id', { head: true, count: 'exact' })
      .limit(1);
    dbOk = !error;
    if (error) dbError = error.message;
  } catch (e) {
    dbOk = false;
    dbError = e instanceof Error ? e.message : String(e);
  }
  const dbLatency = Date.now() - dbStarted;

  const [
    outboxPending,
    outboxFailed,
    kpiInvalidationPending,
    receptions24h,
    auditLogs24h,
    auditLastMinute,
    connectedSessions,
  ] = await Promise.all([
    countExact(supabase, 'outbox_event', (q) => q.eq('status', 'PENDING')),
    countExact(supabase, 'outbox_event', (q) => q.eq('status', 'FAILED')),
    countExact(supabase, 'kpi_invalidation_queue', (q) => q.eq('status', 'pending')),
    countExact(supabase, 'receptions', (q) => q.gte('created_at', since24h)),
    countExact(supabase, 'erp_audit_logs', (q) => q.gte('created_at', since24h)),
    countExact(supabase, 'erp_audit_logs', (q) => q.gte('created_at', since1m)),
    countExact(supabase, 'user_sessions'),
  ]);

  let domainEvents7d: number | null = null;
  try {
    const { data, error } = await supabase.rpc('audit_domain_events_stats', { p_days: 7 });
    if (!error) {
      const total = (data as { total?: number } | null)?.total;
      domainEvents7d = typeof total === 'number' ? total : null;
    }
  } catch {
    domainEvents7d = null;
  }

  let syncFailures24h = 0;
  const samples: HealthErrorSample[] = [];

  try {
    const { count } = await supabase
      .from('sync_run_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'error')
      .gte('started_at', since24h);
    syncFailures24h = count ?? 0;
  } catch {
    syncFailures24h = 0;
  }

  try {
    const { data } = await supabase
      .from('sync_run_log')
      .select('id, process_id, error_message, started_at, finished_at')
      .eq('status', 'error')
      .gte('started_at', since24h)
      .order('started_at', { ascending: false })
      .limit(15);
    for (const row of data || []) {
      samples.push({
        source: 'sync_run_log',
        id: String(row.id),
        processOrEvent: row.process_id || 'sync',
        message: row.error_message || 'Error sin mensaje',
        at: row.finished_at || row.started_at,
      });
    }
  } catch {
    // ignore
  }

  try {
    const { data } = await supabase
      .from('outbox_event')
      .select('id, event_name, last_error, error, created_at, processed_at')
      .eq('status', 'FAILED')
      .order('created_at', { ascending: false })
      .limit(10);
    for (const row of data || []) {
      samples.push({
        source: 'outbox_event',
        id: String(row.id),
        processOrEvent: row.event_name || 'outbox',
        message: row.last_error || row.error || 'FAILED',
        at: row.processed_at || row.created_at,
      });
    }
  } catch {
    // ignore
  }

  samples.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const processMeta = new Map<string, ProcessRunMeta>();

  try {
    const { data: configs } = await supabase
      .from('sync_process_config')
      .select('process_id, last_run_at, last_success_at, interval_minutes');
    for (const c of configs || []) {
      processMeta.set(c.process_id, {
        lastSuccessAt: c.last_success_at ?? null,
        lastErrorAt: null,
        interval: c.interval_minutes ?? 7,
      });
    }
  } catch {
    // ignore
  }

  try {
    const { data: recentErrors } = await supabase
      .from('sync_run_log')
      .select('process_id, started_at, finished_at')
      .eq('status', 'error')
      .gte('started_at', since7d)
      .order('started_at', { ascending: false })
      .limit(50);
    for (const row of recentErrors || []) {
      const meta = processMeta.get(row.process_id);
      const at = row.finished_at || row.started_at;
      if (!meta) {
        processMeta.set(row.process_id, {
          lastSuccessAt: null,
          lastErrorAt: at,
          interval: 7,
        });
      } else if (!meta.lastErrorAt || new Date(at) > new Date(meta.lastErrorAt)) {
        meta.lastErrorAt = at;
      }
    }
  } catch {
    // ignore
  }

  const crons: CronJobHealth[] = CRON_JOBS.map((job) => {
    const ids = job.processIds;
    let lastSuccessAt: string | null = null;
    let lastErrorAt: string | null = null;
    let interval = 10;

    for (const id of ids) {
      const meta = processMeta.get(id);
      if (!meta) continue;
      interval = meta.interval;
      if (
        meta.lastSuccessAt &&
        (!lastSuccessAt || new Date(meta.lastSuccessAt) > new Date(lastSuccessAt))
      ) {
        lastSuccessAt = meta.lastSuccessAt;
      }
      if (
        meta.lastErrorAt &&
        (!lastErrorAt || new Date(meta.lastErrorAt) > new Date(lastErrorAt))
      ) {
        lastErrorAt = meta.lastErrorAt;
      }
    }

    // * * * * * → 1 min; */N → N min
    const everyMin = job.schedule.startsWith('* *')
      ? 1
      : Number(job.schedule.match(/^\*\/(\d+)/)?.[1] || interval);

    return {
      path: job.path,
      schedule: job.schedule,
      label: job.label,
      lastSuccessAt,
      lastErrorAt,
      status: cronStatusFrom(lastSuccessAt, lastErrorAt, everyMin),
    };
  });

  const aggregateMs = Date.now() - apiStarted;
  const outboxBacklog =
    outboxPending == null && outboxFailed == null
      ? null
      : (outboxPending ?? 0) + (outboxFailed ?? 0);

  const apiOk = apiProbe.status === 'ok';
  const overall = resolveOverall({
    apiOk,
    dbOk,
    outboxPending,
    outboxFailed,
    syncFailures24h,
  });

  return {
    overall,
    checkedAt,
    api: {
      status: apiProbe.status,
      latencyMs: apiProbe.latencyMs,
      aggregateMs,
      version,
      service: 'tc-erp-web',
    },
    database: {
      status: dbOk ? 'ok' : 'error',
      latencyMs: dbLatency,
      error: dbError,
    },
    supabase: {
      reachable: dbOk,
      latencyMs: dbLatency,
      schema: 'public',
      error: dbError,
    },
    redis: {
      status: 'not_configured',
      latencyMs: null,
      note: 'Redis no forma parte del stack TC-ERP',
    },
    bullmq: {
      status: 'not_configured',
      latencyMs: null,
      note: 'BullMQ no desplegado · cola equivalente: outbox_event (Postgres)',
      queueEngine: 'postgres_outbox',
      queueBacklog: outboxBacklog,
    },
    traffic: {
      requestsPerMinute: auditLastMinute,
      avgResponseMs: apiProbe.latencyMs,
      note: 'RPM = eventos erp_audit_logs del último minuto (proxy de actividad). Latencia = probe /api/health.',
    },
    users: {
      connected: connectedSessions,
      sessions: connectedSessions,
      note: 'Sesiones registradas en user_sessions (1 por usuario activo en ERP)',
    },
    queues: {
      outboxPending,
      outboxFailed,
      kpiInvalidationPending,
    },
    errors24h: {
      syncFailures: syncFailures24h,
      outboxFailed: outboxFailed ?? 0,
      samples: samples.slice(0, 25),
    },
    crons,
    host: {
      cpu: null,
      ram: null,
      disk: null,
      note: 'No disponible en Vercel serverless',
    },
    consumption: {
      receptions24h,
      auditLogs24h,
      domainEvents7d,
      outboxBacklog,
    },
  };
}
