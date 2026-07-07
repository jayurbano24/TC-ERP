import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { runKpiSyncOrchestrator } from '@/modules/kpi-sync/server/orchestrator';
import type { SyncTier } from '@/modules/kpi-sync/server/types';

function parseTier(url: URL): SyncTier {
  const tier = url.searchParams.get('tier');
  if (tier === 'standard' || tier === 'all') return tier;
  return 'critical';
}

/**
 * Cron/worker: motor de sincronización incremental KPI.
 * Protegido por CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tier = parseTier(new URL(req.url));
  const supabase = getSupabaseServerClient();

  try {
    const { results } = await runKpiSyncOrchestrator(supabase, tier);

    const hasSchemaError = results.some(
      (r) =>
        r.error?.includes('does not exist') ||
        r.error?.includes('relation') ||
        r.error?.includes('PGRST205')
    );

    if (hasSchemaError) {
      return NextResponse.json(
        { error: 'SCHEMA_NOT_DEPLOYED', detail: 'Aplicar migración 094_kpi_sync_engine.sql' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      tier,
      results,
      refreshed_at: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
