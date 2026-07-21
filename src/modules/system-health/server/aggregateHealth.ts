import type { SupabaseClient } from '@supabase/supabase-js';
import { SESSION_IDLE_MINUTES, sessionIdleCutoffIso } from '@/lib/session/idlePolicy';
import { getServiceRoleAdminClient } from '@/shared/authz/requireServerAdmin';
import {
  OUTBOX_PENDING_DEGRADED_THRESHOLD,
  type ConnectedUserPresence,
  type CronJobHealth,
  type CronJobStatus,
  type HealthErrorSample,
  type SystemHealthReport,
} from '../types';
import { buildIntegrations, probePlatform } from './platformProbes';
import {
  buildAlerts,
  buildDiagnosis,
  buildSemaphore,
  computeHealthScore,
  resolveOverallFromScore,
  riskFromScore,
  scoreComponentApi,
  scoreComponentCrons,
  scoreComponentDb,
  scoreComponentIntegrations,
  scoreComponentQueue,
  scoreComponentSessions,
} from './scoreAndAlerts';
import {
  loadAvailability,
  loadLatencyStats,
  loadPeakRpm,
  loadSparks,
  recordHealthSample,
} from './telemetry';

type CronJobDef = {
  path: string;
  schedule: string;
  label: string;
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
  {
    path: '/api/internal/session-idle-cleanup',
    schedule: '*/5 * * * *',
    label: 'Session idle cleanup',
    processIds: ['cron_session_idle_cleanup'],
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

function deployMeta(version: string, checkedAt: string) {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || null;
  return {
    version,
    commitSha: sha,
    commitShort: sha ? sha.slice(0, 7) : null,
    branch: process.env.VERCEL_GIT_COMMIT_REF || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF || null,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
    checkedAt,
  };
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
  const crons = emptyCrons();
  const scoreBreakdown = {
    api: scoreComponentApi(apiProbe.status === 'ok', apiProbe.latencyMs),
    database: 0,
    queue: 50,
    crons: 50,
    sessions: 50,
    integrations: 0,
  };
  const healthScore = computeHealthScore(scoreBreakdown);
  const overall = 'down' as const;
  const alerts = buildAlerts({
    checkedAt,
    apiOk: apiProbe.status === 'ok',
    dbOk: false,
    apiLatencyMs: apiProbe.latencyMs,
    outboxPending: null,
    outboxFailed: null,
    syncFailures24h: 0,
    crons,
  });

  return {
    overall,
    checkedAt,
    healthScore,
    scoreBreakdown,
    riskLabel: riskFromScore(healthScore, overall),
    intervene: true,
    alerts,
    semaphore: buildSemaphore({
      apiOk: apiProbe.status === 'ok',
      apiLatencyMs: apiProbe.latencyMs,
      dbOk: false,
      dbLatencyMs: 0,
      authStatus: 'error',
      storageStatus: 'error',
      outboxPending: null,
      outboxFailed: null,
      crons,
      cacheStatus: 'not_configured',
    }),
    deploy: deployMeta(version, checkedAt),
    diagnosis: buildDiagnosis({ overall, alerts, connectedUsers: null }),
    api: {
      status: apiProbe.status,
      latencyMs: apiProbe.latencyMs,
      aggregateMs: Date.now() - apiStarted,
      version,
      service: 'tc-erp-web',
    },
    database: { status: 'error', latencyMs: 0, error: msg },
    supabase: { reachable: false, latencyMs: 0, schema: 'public', error: msg },
    platform: {
      auth: { status: 'error', latencyMs: null, note: msg },
      storage: { status: 'error', latencyMs: null, note: msg },
      rest: { status: 'error', latencyMs: null, note: msg },
      realtime: { status: 'not_configured', latencyMs: null },
      edgeFunctions: { status: 'not_configured', latencyMs: null },
      postgres: { activeConnections: null, note: msg },
    },
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
      requestsPerSecond: null,
      requestsPerHour: null,
      avgResponseMs: apiProbe.latencyMs,
      peakRpm24h: null,
      note: 'RPM vía proxy erp_audit_logs',
    },
    latency: {
      avgMs: apiProbe.latencyMs,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      sampleCount: 0,
      note: 'Sin telemetría',
    },
    availability: { todayPct: null, d7Pct: null, d30Pct: null, note: 'N/D' },
    httpStatus: {
      buckets: [],
      note: 'Sin APM HTTP; instrumentación futura vía middleware',
    },
    users: {
      connected: null,
      sessions: null,
      idleMinutes: SESSION_IDLE_MINUTES,
      note: msg,
      connectedUsers: [],
    },
    queues: { outboxPending: null, outboxFailed: null, kpiInvalidationPending: null },
    queueDeep: {
      pending: null,
      processing: null,
      failed: null,
      deadLetter: null,
      note: msg,
    },
    integrations: [],
    security: { loginFailures24h: null, note: msg },
    backups: {
      status: 'not_configured',
      lastBackupAt: null,
      note: 'Gestionado en Supabase Dashboard / PITR',
    },
    performanceSparks: { rpm: [], latency: [] },
    errors24h: { syncFailures: 0, outboxFailed: 0, samples: [] },
    crons,
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
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString();

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

  const idleCutoff = sessionIdleCutoffIso();

  const [
    outboxPending,
    outboxFailed,
    outboxProcessing,
    outboxDeadLetter,
    kpiInvalidationPending,
    receptions24h,
    auditLogs24h,
    auditLastMinute,
    auditLastHour,
    connectedSessions,
    loginFailures24h,
  ] = await Promise.all([
    countExact(supabase, 'outbox_event', (q) => q.eq('status', 'PENDING')),
    countExact(supabase, 'outbox_event', (q) => q.eq('status', 'FAILED')),
    countExact(supabase, 'outbox_event', (q) => q.eq('status', 'PROCESSING')),
    countExact(supabase, 'outbox_event', (q) =>
      q.eq('status', 'FAILED').gte('attempts', 3)
    ),
    countExact(supabase, 'kpi_invalidation_queue', (q) => q.eq('status', 'pending')),
    countExact(supabase, 'receptions', (q) => q.gte('created_at', since24h)),
    countExact(supabase, 'erp_audit_logs', (q) => q.gte('created_at', since24h)),
    countExact(supabase, 'erp_audit_logs', (q) => q.gte('created_at', since1m)),
    countExact(supabase, 'erp_audit_logs', (q) => q.gte('created_at', since1h)),
    countExact(supabase, 'user_sessions', (q) => q.gte('last_seen', idleCutoff)),
    countExact(supabase, 'erp_audit_logs', (q) =>
      q.gte('created_at', since24h).ilike('action', '%login%fail%')
    ),
  ]);

  // Telemetría (best-effort)
  await Promise.all([
    recordHealthSample(supabase, 'api_latency_ms', apiProbe.latencyMs),
    recordHealthSample(supabase, 'api_up', apiProbe.status === 'ok' ? 1 : 0),
    recordHealthSample(supabase, 'db_latency_ms', dbLatency),
    recordHealthSample(supabase, 'rpm', auditLastMinute ?? 0),
  ]);

  let connectedUsers: ConnectedUserPresence[] = [];
  try {
    const { data: sessionRows } = await supabase
      .from('user_sessions')
      .select('id, user_id, ip_address, created_at, last_seen')
      .gte('last_seen', idleCutoff)
      .order('last_seen', { ascending: false })
      .limit(100);

    const rows = sessionRows ?? [];
    const userIds = [...new Set(rows.map((r) => r.user_id as string).filter(Boolean))];
    const profileById = new Map<
      string,
      { full_name: string | null; email: string | null; role: string | null }
    >();

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, user_roles(role)')
        .in('id', userIds);

      for (const p of profiles || []) {
        const roles = p.user_roles as { role?: string }[] | null;
        profileById.set(p.id as string, {
          full_name: (p.full_name as string | null) ?? null,
          email: (p.email as string | null) ?? null,
          role: roles?.[0]?.role ?? null,
        });
      }
    }

    connectedUsers = rows.map((r) => {
      const profile = profileById.get(r.user_id as string);
      return {
        sessionId: String(r.id),
        userId: String(r.user_id),
        fullName: profile?.full_name ?? null,
        email: profile?.email ?? null,
        role: profile?.role ?? null,
        ipAddress: (r.ip_address as string | null) ?? null,
        connectedAt: String(r.created_at),
        lastSeenAt: String(r.last_seen ?? r.created_at),
      };
    });
  } catch {
    connectedUsers = [];
  }

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

  const [platform, integrations, latency, availability, peakRpm24h, sparkRpm, sparkLatency] =
    await Promise.all([
      probePlatform(supabase),
      buildIntegrations(supabase, dbOk, dbLatency),
      loadLatencyStats(supabase, since24h),
      loadAvailability(supabase),
      loadPeakRpm(supabase, since24h),
      loadSparks(supabase, 'rpm', 24),
      loadSparks(supabase, 'api_latency_ms', 24),
    ]);

  const aggregateMs = Date.now() - apiStarted;
  const outboxBacklog =
    outboxPending == null && outboxFailed == null
      ? null
      : (outboxPending ?? 0) + (outboxFailed ?? 0);

  const apiOk = apiProbe.status === 'ok';
  const scoreBreakdown = {
    api: scoreComponentApi(apiOk, apiProbe.latencyMs),
    database: scoreComponentDb(dbOk, dbLatency),
    queue: scoreComponentQueue(outboxPending, outboxFailed),
    crons: scoreComponentCrons(crons),
    sessions: scoreComponentSessions(connectedSessions),
    integrations: scoreComponentIntegrations(integrations),
  };
  const healthScore = computeHealthScore(scoreBreakdown);
  const overall = resolveOverallFromScore(healthScore, apiOk, dbOk);

  const alerts = buildAlerts({
    checkedAt,
    apiOk,
    dbOk,
    apiLatencyMs: apiProbe.latencyMs,
    outboxPending,
    outboxFailed,
    syncFailures24h,
    crons,
  });

  const semaphore = buildSemaphore({
    apiOk,
    apiLatencyMs: apiProbe.latencyMs,
    dbOk,
    dbLatencyMs: dbLatency,
    authStatus: platform.auth.status,
    storageStatus: platform.storage.status,
    outboxPending,
    outboxFailed,
    crons,
    cacheStatus: 'not_configured',
  });

  const rpm = auditLastMinute;
  const latencyMerged = {
    ...latency,
    avgMs: latency.avgMs ?? apiProbe.latencyMs,
    maxMs: latency.maxMs ?? apiProbe.latencyMs,
    sampleCount: latency.sampleCount || 1,
  };

  return {
    overall,
    checkedAt,
    healthScore,
    scoreBreakdown,
    riskLabel: riskFromScore(healthScore, overall),
    intervene: alerts.some((a) => a.severity === 'critical') || overall === 'down',
    alerts,
    semaphore,
    deploy: deployMeta(version, checkedAt),
    diagnosis: buildDiagnosis({
      overall,
      alerts,
      connectedUsers: connectedSessions,
    }),
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
    platform,
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
      requestsPerMinute: rpm,
      requestsPerSecond: rpm == null ? null : Math.round((rpm / 60) * 100) / 100,
      requestsPerHour: auditLastHour,
      avgResponseMs: apiProbe.latencyMs,
      peakRpm24h,
      note: 'RPM/hora = proxy erp_audit_logs. Pico desde health_metric_samples.',
    },
    latency: latencyMerged,
    availability,
    httpStatus: {
      buckets: [
        { code: '2xx', count: 0, pct: 0 },
        { code: '4xx', count: 0, pct: 0 },
        { code: '5xx', count: syncFailures24h, pct: 0 },
      ],
      note: 'Sin APM de status HTTP aún; 5xx aproximado vía sync failures.',
    },
    users: {
      connected: connectedSessions,
      sessions: connectedSessions,
      idleMinutes: SESSION_IDLE_MINUTES,
      note: `Conectados = last_seen en los últimos ${SESSION_IDLE_MINUTES} min.`,
      connectedUsers,
    },
    queues: {
      outboxPending,
      outboxFailed,
      kpiInvalidationPending,
    },
    queueDeep: {
      pending: outboxPending,
      processing: outboxProcessing,
      failed: outboxFailed,
      deadLetter: outboxDeadLetter,
      note: 'DLQ proxy = FAILED con attempts ≥ 3. Motor: outbox_event.',
    },
    integrations,
    security: {
      loginFailures24h,
      note: 'Proxy ilike action login/fail en erp_audit_logs (puede ser 0 si no se audita así).',
    },
    backups: {
      status: 'not_configured',
      lastBackupAt: null,
      note: 'Backups/PITR se gestionan en Supabase Dashboard (no expuesto vía Data API).',
    },
    performanceSparks: {
      rpm: sparkRpm,
      latency: sparkLatency,
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

export { OUTBOX_PENDING_DEGRADED_THRESHOLD };
