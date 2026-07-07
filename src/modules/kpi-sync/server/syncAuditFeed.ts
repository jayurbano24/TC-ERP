import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyAuditMetrics, KPI_AUDIT_ACTIONS } from './auditClassifier';
import { fechaEnGuatemala } from './timeRange';
import type { SyncRunResult } from './types';

const BATCH_SIZE = 500;
const PROCESS_ID = 'kpi_audit_feed';

type AuditLogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  branch_id: string | null;
  action: string;
  record_id: string;
  new_values?: { result?: string } | null;
};

function diarioKey(fecha: string, proceso: string, metrica: string, dimensionKey = 'ALL') {
  return `${fecha}|${proceso}|${metrica}|${dimensionKey}`;
}

function usuarioKey(fecha: string, userId: string, proceso: string, metrica: string) {
  return `${fecha}|${userId}|${proceso}|${metrica}`;
}

async function applyDiarioDeltas(
  supabase: SupabaseClient,
  deltas: Map<string, number>
) {
  for (const [key, delta] of deltas) {
    if (delta === 0) continue;
    const [fecha, proceso, metrica, dimensionKey] = key.split('|');
    const { data: existing } = await supabase
      .from('kpi_diario')
      .select('valor')
      .eq('fecha', fecha)
      .eq('proceso', proceso)
      .eq('metrica', metrica)
      .eq('dimension_key', dimensionKey)
      .maybeSingle();

    await supabase.from('kpi_diario').upsert(
      {
        fecha,
        proceso,
        metrica,
        dimension_key: dimensionKey,
        valor: Number(existing?.valor ?? 0) + delta,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'fecha,proceso,metrica,dimension_key' }
    );
  }
}

async function applyUsuarioDeltas(
  supabase: SupabaseClient,
  deltas: Map<string, number>
) {
  for (const [key, delta] of deltas) {
    if (delta === 0) continue;
    const [fecha, userId, proceso, metrica] = key.split('|');
    const { data: existing } = await supabase
      .from('kpi_usuario')
      .select('valor')
      .eq('fecha', fecha)
      .eq('user_id', userId)
      .eq('proceso', proceso)
      .eq('metrica', metrica)
      .maybeSingle();

    await supabase.from('kpi_usuario').upsert(
      {
        fecha,
        user_id: userId,
        proceso,
        metrica,
        valor: Number(existing?.valor ?? 0) + delta,
        refreshed_at: new Date().toISOString(),
      },
      { onConflict: 'fecha,user_id,proceso,metrica' }
    );
  }
}

export async function runKpiAuditFeedSync(supabase: SupabaseClient): Promise<SyncRunResult> {
  const { data: watermark, error: wmError } = await supabase
    .from('sync_watermarks')
    .select('cursor_ts, cursor_id')
    .eq('process_id', PROCESS_ID)
    .single();

  if (wmError) {
    return { processId: PROCESS_ID, status: 'error', rowsRead: 0, rowsAffected: 0, error: wmError.message };
  }

  const cursorTs = watermark?.cursor_ts ?? '1970-01-01T00:00:00.000Z';
  const cursorId = watermark?.cursor_id ?? null;

  const { data: rawLogs, error: readError } = await supabase
    .from('erp_audit_logs')
    .select('id, created_at, user_id, branch_id, action, record_id, new_values')
    .in('action', [...KPI_AUDIT_ACTIONS])
    .gte('created_at', cursorTs)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(BATCH_SIZE + 50);

  if (readError) {
    return { processId: PROCESS_ID, status: 'error', rowsRead: 0, rowsAffected: 0, error: readError.message };
  }

  const batch = ((rawLogs ?? []) as AuditLogRow[]).filter((log) => {
    if (log.created_at > cursorTs) return true;
    if (log.created_at < cursorTs) return false;
    if (!cursorId) return true;
    return log.id > cursorId;
  }).slice(0, BATCH_SIZE);

  if (batch.length === 0) {
    return { processId: PROCESS_ID, status: 'success', rowsRead: 0, rowsAffected: 0 };
  }

  const ledgerRows: Array<Record<string, unknown>> = [];
  const diarioDeltas = new Map<string, number>();
  const usuarioDeltas = new Map<string, number>();

  for (const log of batch) {
    const metrics = classifyAuditMetrics(log);
    if (metrics.length === 0) continue;
    const fecha = fechaEnGuatemala(log.created_at);

    for (const m of metrics) {
      const dim = m.dimensionKey ?? 'ALL';
      ledgerRows.push({
        audit_id: log.id,
        fecha,
        proceso: m.proceso,
        metrica: m.metrica,
        user_id: log.user_id,
        record_id: log.record_id || null,
        dimension_key: dim,
        branch_id: log.branch_id,
        valor: 1,
      });
      const dk = diarioKey(fecha, m.proceso, m.metrica, dim);
      diarioDeltas.set(dk, (diarioDeltas.get(dk) ?? 0) + 1);
      if (log.user_id) {
        const uk = usuarioKey(fecha, log.user_id, m.proceso, m.metrica);
        usuarioDeltas.set(uk, (usuarioDeltas.get(uk) ?? 0) + 1);
      }
    }
  }

  if (ledgerRows.length > 0) {
    const { error: ledgerError } = await supabase
      .from('kpi_event_ledger')
      .upsert(ledgerRows, { onConflict: 'audit_id', ignoreDuplicates: true });

    if (ledgerError && ledgerError.code !== '23505') {
      return {
        processId: PROCESS_ID,
        status: 'error',
        rowsRead: batch.length,
        rowsAffected: 0,
        error: ledgerError.message,
      };
    }
  }

  await applyDiarioDeltas(supabase, diarioDeltas);
  await applyUsuarioDeltas(supabase, usuarioDeltas);

  const last = batch[batch.length - 1]!;
  const { error: wmUpdateError } = await supabase.from('sync_watermarks').upsert({
    process_id: PROCESS_ID,
    cursor_ts: last.created_at,
    cursor_id: last.id,
    rows_processed: batch.length,
    updated_at: new Date().toISOString(),
  });

  if (wmUpdateError) {
    return {
      processId: PROCESS_ID,
      status: 'error',
      rowsRead: batch.length,
      rowsAffected: ledgerRows.length,
      error: wmUpdateError.message,
    };
  }

  return {
    processId: PROCESS_ID,
    status: 'success',
    rowsRead: batch.length,
    rowsAffected: ledgerRows.length,
    metadata: {
      cursor_ts: last.created_at,
      cursor_id: last.id,
      hasMore: batch.length >= BATCH_SIZE,
    },
  };
}
