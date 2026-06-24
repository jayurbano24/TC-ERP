import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

type DayCount = { day: string; count: number };

async function safeCount(
  label: string,
  run: () => Promise<{ count: number | null; error: string | null }>
): Promise<{ label: string; count: number | null; error?: string }> {
  try {
    const { count, error } = await run();
    return { label, count, error: error ?? undefined };
  } catch (e) {
    return { label, count: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export const GET = withErrorHandler(async () => {
  const since = new Date();
  since.setDate(since.getDate() - 7);

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return NextResponse.json({
      success: true,
      warning: 'Supabase no configurado — métricas no disponibles',
      baseline: { generatedAt: new Date().toISOString(), windowDays: 7 },
    });
  }

  const sinceIso = since.toISOString();

  const [receptions, auditLogs, domainStats, outboxPending] = await Promise.all([
    safeCount('receptions_7d', async () => {
      const { count, error } = await supabase
        .from('receptions')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso);
      return { count, error: error?.message ?? null };
    }),
    safeCount('audit_logs_7d', async () => {
      const { count, error } = await supabase
        .from('erp_audit_logs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', sinceIso);
      return { count, error: error?.message ?? null };
    }),
    safeCount('domain_events_stats', async () => {
      const { data, error } = await supabase.rpc('audit_domain_events_stats', { p_days: 7 });
      if (error) return { count: null, error: error.message };
      const total = (data as { total?: number })?.total;
      return { count: typeof total === 'number' ? total : null, error: null };
    }),
    safeCount('outbox_pending', async () => {
      const { count, error } = await supabase
        .from('outbox_event')
        .select('id', { count: 'exact', head: true })
        .in('status', ['PENDING', 'FAILED']);
      return { count, error: error?.message ?? null };
    }),
  ]);

  return NextResponse.json({
    success: true,
    baseline: {
      generatedAt: new Date().toISOString(),
      windowDays: 7,
      metrics: {
        receptions7d: receptions,
        auditLogs7d: auditLogs,
        domainEvents7d: domainStats,
        outboxPending,
      },
      sqlReference: 'scripts/metrics_baseline_phase_a.sql',
    },
  });
});
