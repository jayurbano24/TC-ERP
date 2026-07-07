import type { SupabaseClient } from '@supabase/supabase-js';
import { runKpiAuditFeedSync } from './syncAuditFeed';
import { runKpiPipelineWipSync } from './syncPipelineWip';
import type { SyncProcessConfig, SyncRunResult, SyncTier } from './types';

const PROCESS_RUNNERS: Record<string, (db: SupabaseClient) => Promise<SyncRunResult>> = {
  kpi_audit_feed: runKpiAuditFeedSync,
  kpi_pipeline_wip: runKpiPipelineWipSync,
};

function tierMatches(priority: number, tier: SyncTier): boolean {
  if (tier === 'all') return true;
  if (tier === 'critical') return priority === 1;
  return priority >= 2;
}

function isDue(config: SyncProcessConfig, now: Date): boolean {
  if (!config.enabled) return false;
  if (!config.last_run_at) return true;
  const last = new Date(config.last_run_at).getTime();
  const elapsedMin = (now.getTime() - last) / 60_000;
  return elapsedMin >= config.interval_minutes;
}

async function logRunStart(supabase: SupabaseClient, processId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('sync_run_log')
    .insert({ process_id: processId, status: 'running' })
    .select('id')
    .single();
  if (error) return null;
  return data?.id ?? null;
}

async function logRunFinish(
  supabase: SupabaseClient,
  logId: number | null,
  result: SyncRunResult
) {
  if (!logId) return;
  await supabase
    .from('sync_run_log')
    .update({
      finished_at: new Date().toISOString(),
      status: result.status === 'error' ? 'error' : 'success',
      rows_read: result.rowsRead,
      rows_affected: result.rowsAffected,
      error_message: result.error ?? null,
      metadata: result.metadata ?? {},
    })
    .eq('id', logId);
}

export async function runKpiSyncOrchestrator(
  supabase: SupabaseClient,
  tier: SyncTier = 'critical'
): Promise<{ results: SyncRunResult[]; tier: SyncTier }> {
  const now = new Date();

  const { data: configs, error } = await supabase
    .from('sync_process_config')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    return {
      tier,
      results: [
        {
          processId: 'orchestrator',
          status: 'error',
          rowsRead: 0,
          rowsAffected: 0,
          error: error.message,
        },
      ],
    };
  }

  const results: SyncRunResult[] = [];

  for (const raw of configs ?? []) {
    const config = raw as SyncProcessConfig;
    if (!tierMatches(config.priority, tier)) continue;
    if (!isDue(config, now)) {
      results.push({
        processId: config.process_id,
        status: 'skipped',
        rowsRead: 0,
        rowsAffected: 0,
        metadata: { reason: 'not_due', interval_minutes: config.interval_minutes },
      });
      continue;
    }

    const runner = PROCESS_RUNNERS[config.process_id];
    if (!runner) {
      results.push({
        processId: config.process_id,
        status: 'skipped',
        rowsRead: 0,
        rowsAffected: 0,
        metadata: { reason: 'no_runner' },
      });
      continue;
    }

    await supabase
      .from('sync_process_config')
      .update({ last_run_at: now.toISOString() })
      .eq('process_id', config.process_id);

    const logId = await logRunStart(supabase, config.process_id);
    const result = await runner(supabase);
    await logRunFinish(supabase, logId, result);

    if (result.status === 'success') {
      await supabase
        .from('sync_process_config')
        .update({ last_success_at: new Date().toISOString() })
        .eq('process_id', config.process_id);
    }

    results.push(result);
  }

  return { tier, results };
}
