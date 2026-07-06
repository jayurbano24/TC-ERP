import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

const DIAG_ACTION = 'DIAGNÓSTICO INICIAL COMPLETADO';

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export type ReturnCandidatesResult = {
  seriesIds: string[];
  equipmentCount: number;
};

/**
 * Series en `sourceStatus` cuyo equipo (OS) no tiene ningún diagnóstico registrado.
 */
export async function findReturnCandidatesWithoutDiagnosis(
  supabase: SupabaseClient,
  sourceStatus: string
): Promise<ReturnCandidatesResult> {
  const rows: { id: string; service_order_id: string | null }[] = [];
  const pageSize = 1000;
  const maxRows = 25_000;

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .eq('current_status', sourceStatus)
      .order('updated_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as { id: string; service_order_id: string | null }[]));
    if (data.length < pageSize) break;
  }

  if (rows.length === 0) {
    return { seriesIds: [], equipmentCount: 0 };
  }

  const byOs = new Map<string, string[]>();
  const orphanIds: string[] = [];

  for (const row of rows) {
    if (row.service_order_id) {
      const list = byOs.get(row.service_order_id) ?? [];
      list.push(row.id);
      byOs.set(row.service_order_id, list);
    } else {
      orphanIds.push(row.id);
    }
  }

  const allSeriesIds = rows.map((r) => r.id);
  const diagSeriesIds = new Set<string>();

  for (const chunk of chunkIds(allSeriesIds)) {
    const { data: auditRows } = await supabase
      .from('erp_audit_logs')
      .select('record_id')
      .eq('action', DIAG_ACTION)
      .in('record_id', chunk);
    for (const log of auditRows || []) {
      diagSeriesIds.add(String(log.record_id));
    }
  }

  const returnIds: string[] = [];

  for (const [, seriesIds] of byOs) {
    const hasDiag = seriesIds.some((id) => diagSeriesIds.has(id));
    if (!hasDiag) returnIds.push(...seriesIds);
  }

  for (const id of orphanIds) {
    if (!diagSeriesIds.has(id)) returnIds.push(id);
  }

  const equipmentOs = new Set<string>();
  for (const row of rows) {
    if (row.service_order_id && returnIds.includes(row.id)) {
      equipmentOs.add(row.service_order_id);
    }
  }
  const orphanReturnCount = orphanIds.filter((id) => returnIds.includes(id)).length;

  return {
    seriesIds: returnIds,
    equipmentCount: equipmentOs.size + orphanReturnCount,
  };
}

export async function returnWorkshopSeriesBatch(
  supabase: SupabaseClient,
  params: {
    seriesIds: string[];
    targetStatus: string;
    userId: string;
    userRole?: string;
    operatorName?: string;
    reason?: string;
    actionLabel?: string;
  }
): Promise<{ processed: number }> {
  const {
    seriesIds,
    targetStatus,
    userId,
    userRole,
    operatorName,
    reason = 'Regreso manual desde Taller',
    actionLabel = 'TRASLADO A DIAGNÓSTICO',
  } = params;

  if (seriesIds.length === 0) return { processed: 0 };

  const admin = getSupabaseServerClient();
  let processed = 0;

  for (const chunk of chunkIds(seriesIds, BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH)) {
    const { error: updateError } = await supabase
      .from('series')
      .update({ current_status: targetStatus })
      .in('id', chunk);

    if (updateError) throw new Error(updateError.message);

    const auditRows = chunk.map((recordId) => ({
      user_id: userId,
      user_role: userRole || 'Desconocido',
      module: 'Taller',
      table_name: 'series',
      record_id: recordId,
      action: actionLabel,
      severity: 'INFO',
      new_values: {
        status: targetStatus,
        reason,
        operator_name: operatorName,
      },
      user_agent: 'api/v1/workshop/return-batch',
    }));

    const { error: auditError } = await admin.from('erp_audit_logs').insert(auditRows);
    if (auditError) throw new Error(`Auditoría: ${auditError.message}`);

    processed += chunk.length;
  }

  return { processed };
}
