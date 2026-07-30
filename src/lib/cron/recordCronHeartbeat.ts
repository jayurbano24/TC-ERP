import type { SupabaseClient } from '@supabase/supabase-js';

export type CronHeartbeatProcessId =
  | 'cron_outbox_publish'
  | 'cron_kpi_sync_critical'
  | 'cron_kpi_sync_standard'
  | 'cron_refresh_summary_views'
  | 'cron_attendance_close_open'
  | 'cron_session_idle_cleanup';

const CRON_META: Record<
  CronHeartbeatProcessId,
  { intervalMinutes: number; description: string }
> = {
  cron_outbox_publish: {
    intervalMinutes: 1,
    description: 'Heartbeat: Vercel cron outbox-publish',
  },
  cron_kpi_sync_critical: {
    intervalMinutes: 5,
    description: 'Heartbeat: Vercel cron kpi-sync tier=critical',
  },
  cron_kpi_sync_standard: {
    intervalMinutes: 7,
    description: 'Heartbeat: Vercel cron kpi-sync tier=standard',
  },
  cron_refresh_summary_views: {
    intervalMinutes: 10,
    description: 'Heartbeat: Vercel cron refresh-summary-views',
  },
  cron_attendance_close_open: {
    intervalMinutes: 15,
    description: 'Heartbeat: Vercel cron attendance-close-open',
  },
  cron_session_idle_cleanup: {
    intervalMinutes: 5,
    description: 'Heartbeat: limpia sesiones ERP idle (idlePolicy)',
  },
}

/**
 * Registra corrida de cron interno en sync_process_config + sync_run_log
 * para que Salud muestre estado real por job (no Desconocido).
 */
export async function recordCronHeartbeat(
  supabase: SupabaseClient,
  processId: CronHeartbeatProcessId,
  result: {
    ok: boolean;
    error?: string;
    metadata?: Record<string, unknown>;
    rowsRead?: number;
    rowsAffected?: number;
  }
): Promise<void> {
  const meta = CRON_META[processId];
  const now = new Date().toISOString();

  try {
    await supabase.from('sync_process_config').upsert(
      {
        process_id: processId,
        priority: 3,
        interval_minutes: meta.intervalMinutes,
        source_table: 'cron',
        cursor_type: 'created_at',
        enabled: false, // no lo ejecuta el orchestrator KPI
        description: meta.description,
        last_run_at: now,
        ...(result.ok ? { last_success_at: now } : {}),
      },
      { onConflict: 'process_id' }
    );

    // upsert puede no tocar last_success_at en conflicto según cliente; forzar update
    await supabase
      .from('sync_process_config')
      .update({
        last_run_at: now,
        ...(result.ok ? { last_success_at: now } : {}),
      })
      .eq('process_id', processId);

    const { data: logRow } = await supabase
      .from('sync_run_log')
      .insert({
        process_id: processId,
        status: 'running',
        metadata: result.metadata ?? {},
      })
      .select('id')
      .single();

    if (logRow?.id != null) {
      await supabase
        .from('sync_run_log')
        .update({
          finished_at: now,
          status: result.ok ? 'success' : 'error',
          rows_read: result.rowsRead ?? 0,
          rows_affected: result.rowsAffected ?? 0,
          error_message: result.error?.slice(0, 1000) ?? null,
          metadata: result.metadata ?? {},
        })
        .eq('id', logRow.id);
    }
  } catch (err) {
    console.error('[cron_heartbeat]', processId, err);
  }
}
