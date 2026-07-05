import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

export function resolveWorkshopNextStatus(result: string): string {
  if (result === 'reacondicionado') return 'ready_to_dispatch';
  if (result === 'reparacion') return 'in_qc';
  if (result === 'control_calidad') return 'in_validation';
  if (result === 'l3') return 'in_control_warehouse';
  if (result === 'scraps') return 'irreparable';
  if (result === 'listo') return 'in_central_warehouse';
  if (result === 'rechazado_qc') return 'in_qc';
  return 'in_workshop';
}

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export type WorkshopOperateParams = {
  seriesIds: string[];
  result: string;
  notes: string;
  selectedDiagnostics?: string[];
  actionName: string;
  userId: string;
  userRole?: string;
};

/** Actualiza series + auditoría en lotes (servidor, sin N round-trips al browser). */
export async function operateWorkshopSeriesBatch(
  supabase: SupabaseClient,
  params: WorkshopOperateParams
): Promise<{ processed: number }> {
  const { seriesIds, result, notes, selectedDiagnostics = [], actionName, userId, userRole } =
    params;

  if (seriesIds.length === 0) return { processed: 0 };

  const nextStatus = resolveWorkshopNextStatus(result);
  const updateData: Record<string, unknown> = { current_status: nextStatus };
  if (actionName === 'DIAGNÓSTICO INICIAL COMPLETADO') {
    updateData.current_diagnostics = selectedDiagnostics;
  }

  const auditPayload = {
    result,
    notes,
    nextStatus,
    diagnostics: actionName === 'DIAGNÓSTICO INICIAL COMPLETADO' ? selectedDiagnostics : undefined,
    repairs: actionName === 'REPARACIÓN COMPLETADA' ? selectedDiagnostics : undefined,
    items: selectedDiagnostics,
  };

  const admin = getSupabaseServerClient();
  let processed = 0;

  for (const chunk of chunkIds(seriesIds)) {
    const { error: updateError } = await supabase
      .from('series')
      .update(updateData)
      .in('id', chunk);

    if (updateError) {
      throw new Error(updateError.message);
    }

    const auditRows = chunk.map((recordId) => ({
      user_id: userId,
      user_role: userRole || 'Desconocido',
      module: 'Taller',
      table_name: 'series',
      record_id: recordId,
      action: actionName,
      severity: 'INFO',
      new_values: auditPayload,
      user_agent: 'api/v1/workshop/operate-batch',
    }));

    const { error: auditError } = await admin.from('erp_audit_logs').insert(auditRows);
    if (auditError) {
      throw new Error(`Auditoría: ${auditError.message}`);
    }

    processed += chunk.length;
  }

  return { processed };
}
