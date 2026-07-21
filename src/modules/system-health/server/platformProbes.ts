import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExternalServiceStatus, IntegrationHealth, PlatformProbes, ServiceProbe } from '../types';

async function probeAuth(supabase: SupabaseClient): Promise<ServiceProbe> {
  const started = Date.now();
  try {
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
      return { status: 'error', latencyMs: Date.now() - started, note: error.message };
    }
    return { status: 'ok', latencyMs: Date.now() - started, note: 'auth.admin.listUsers' };
  } catch (e) {
    return {
      status: 'error',
      latencyMs: Date.now() - started,
      note: e instanceof Error ? e.message : String(e),
    };
  }
}

async function probeStorage(supabase: SupabaseClient): Promise<ServiceProbe> {
  const started = Date.now();
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      return { status: 'error', latencyMs: Date.now() - started, note: error.message };
    }
    return {
      status: 'ok',
      latencyMs: Date.now() - started,
      note: `${data?.length ?? 0} buckets`,
    };
  } catch (e) {
    return {
      status: 'degraded',
      latencyMs: Date.now() - started,
      note: e instanceof Error ? e.message : 'Storage no disponible',
    };
  }
}

export async function probePlatform(supabase: SupabaseClient): Promise<PlatformProbes> {
  const [auth, storage] = await Promise.all([probeAuth(supabase), probeStorage(supabase)]);

  return {
    auth,
    storage,
    rest: {
      status: 'ok',
      latencyMs: null,
      note: 'Data API vía PostgREST (mismo client service role)',
    },
    realtime: {
      status: 'not_configured',
      latencyMs: null,
      note: 'Sin probe Realtime dedicado en Health Center',
    },
    edgeFunctions: {
      status: 'not_configured',
      latencyMs: null,
      note: 'Edge Functions no monitorizadas aquí',
    },
    postgres: {
      activeConnections: null,
      note: 'Conexiones/locks requieren privilegios pg_stat; N/D en service role típico',
    },
  };
}

export async function buildIntegrations(
  supabase: SupabaseClient,
  dbOk: boolean,
  dbLatency: number
): Promise<IntegrationHealth[]> {
  const sapConfigured = Boolean(
    process.env.SAP_API_URL || process.env.NEXT_PUBLIC_SAP_API_URL
  );
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.EMAIL_FROM
  );

  let sapLast: string | null = null;
  let sapError: string | null = null;
  let sapStatus: ExternalServiceStatus = sapConfigured ? 'ok' : 'not_configured';

  try {
    const { data } = await supabase
      .from('sync_run_log')
      .select('started_at, finished_at, status, error_message, process_id')
      .ilike('process_id', '%sap%')
      .order('started_at', { ascending: false })
      .limit(1);
    const row = data?.[0];
    if (row) {
      sapLast = row.finished_at || row.started_at;
      if (row.status === 'error') {
        sapStatus = 'error';
        sapError = row.error_message || 'Error SAP sync';
      } else if (sapConfigured) {
        sapStatus = 'ok';
      }
    }
  } catch {
    /* ignore */
  }

  if (!sapConfigured && !sapLast) {
    sapStatus = 'not_configured';
  } else if (sapConfigured && !sapLast) {
    sapStatus = 'degraded';
  }

  return [
    {
      id: 'supabase',
      label: 'Supabase',
      status: dbOk ? 'ok' : 'error',
      lastPingAt: new Date().toISOString(),
      latencyMs: dbLatency,
      lastError: dbOk ? null : 'DB probe failed',
      note: 'Postgres + Auth + Storage',
    },
    {
      id: 'sap',
      label: 'SAP',
      status: sapStatus,
      lastPingAt: sapLast,
      latencyMs: null,
      lastError: sapError,
      note: sapConfigured ? 'Integración SAP configurada' : 'Sin variables SAP en entorno',
    },
    {
      id: 'smtp',
      label: 'SMTP / Email',
      status: smtpConfigured ? 'ok' : 'not_configured',
      lastPingAt: null,
      latencyMs: null,
      lastError: null,
      note: smtpConfigured ? 'Credenciales presentes' : 'Sin SMTP/Resend configurado',
    },
    {
      id: 'redis',
      label: 'Redis / Cache',
      status: 'not_configured',
      lastPingAt: null,
      latencyMs: null,
      lastError: null,
      note: 'No forma parte del stack TC-ERP',
    },
  ];
}
