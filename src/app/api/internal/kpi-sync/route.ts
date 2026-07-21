import { NextResponse } from 'next/server';
import { recordCronHeartbeat } from '@/lib/cron/recordCronHeartbeat';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { runKpiSyncOrchestrator } from '@/modules/kpi-sync/server/orchestrator';
import type { SyncTier } from '@/modules/kpi-sync/server/types';

function parseTier(url: URL): SyncTier {
  const tier = url.searchParams.get('tier');
  if (tier === 'standard' || tier === 'all') return tier;
  return 'critical';
}

function heartbeatId(tier: SyncTier) {
  return tier === 'standard' ? 'cron_kpi_sync_standard' : 'cron_kpi_sync_critical';
}

/**
 * Cron/worker: motor de sincronización incremental KPI.
 * Protegido por CRON_SECRET. Vercel Cron invoca GET.
 */
async function handle(req: Request) {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tier = parseTier(new URL(req.url));
  const supabase = getSupabaseServerClient();
  const processId = heartbeatId(tier);

  try {
    const { results } = await runKpiSyncOrchestrator(supabase, tier);

    const hasSchemaError = results.some(
      (r) =>
        r.error?.includes('does not exist') ||
        r.error?.includes('relation') ||
        r.error?.includes('PGRST205')
    );

    if (hasSchemaError) {
      await recordCronHeartbeat(supabase, processId, {
        ok: false,
        error: 'SCHEMA_NOT_DEPLOYED',
        metadata: { tier, results },
      });
      return NextResponse.json(
        { error: 'SCHEMA_NOT_DEPLOYED', detail: 'Aplicar migración 094_kpi_sync_engine.sql' },
        { status: 503 }
      );
    }

    const hardErrors = results.filter((r) => r.status === 'error');
    await recordCronHeartbeat(supabase, processId, {
      ok: hardErrors.length === 0,
      error: hardErrors[0]?.error,
      metadata: {
        tier,
        ran: results.filter((r) => r.status !== 'skipped').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        errors: hardErrors.length,
      },
      rowsAffected: results.reduce((n, r) => n + (r.rowsAffected ?? 0), 0),
      rowsRead: results.reduce((n, r) => n + (r.rowsRead ?? 0), 0),
    });

    return NextResponse.json({
      success: true,
      tier,
      results,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    await recordCronHeartbeat(supabase, processId, {
      ok: false,
      error: message,
      metadata: { tier },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
