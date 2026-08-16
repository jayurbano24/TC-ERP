import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { BusinessException } from '@/shared/errors/Exceptions';
import {
  loadCompletedWorkshopActionsBySeries,
  validateEquipmentPrerequisites,
} from '@/modules/workshop/server/workshopStagePrerequisites';

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

/** Resultados válidos por acción de etapa (evita saltos de flujo desde el cliente). */
const ALLOWED_RESULTS_BY_ACTION: Record<string, readonly string[]> = {
  'DIAGNÓSTICO INICIAL COMPLETADO': ['reacondicionado', 'reparacion', 'l3', 'scraps'],
  'REPARACIÓN COMPLETADA': ['control_calidad', 'reacondicionado', 'l3', 'scraps'],
  'REACONDICIONADO COMPLETADO': ['control_calidad', 'reparacion', 'l3', 'scraps'],
  'CONTROL DE CALIDAD COMPLETADO': ['listo', 'rechazado_qc'],
  'REPARACIÓN L3 COMPLETADA': ['reparacion', 'scraps'],
};

export function assertAllowedWorkshopResult(actionName: string, result: string): void {
  const allowed = ALLOWED_RESULTS_BY_ACTION[actionName];
  if (!allowed) return;
  if (!allowed.includes(result)) {
    throw new BusinessException(
      `Resultado "${result}" no permitido en ${actionName}. Opciones: ${allowed.join(', ')}.`
    );
  }
}

/** Estados de pipeline de taller: un equipo (OS) no se parte entre etapas. */
const WORKSHOP_PIPELINE_STATUSES = [
  'in_workshop',
  'in_qc',
  'in_validation',
  'ready_to_dispatch',
  'in_control_warehouse',
  'irreparable',
  'in_central_warehouse',
] as const;

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * Expande series sueltas a TODAS las series del mismo service_order
 * que siguen en pipeline de taller (unidad indivisible).
 */
export async function expandSeriesIdsToEquipmentSiblings(
  supabase: SupabaseClient,
  seriesIds: string[]
): Promise<string[]> {
  const unique = [...new Set(seriesIds.filter(Boolean))];
  if (unique.length === 0) return [];

  const osIds = new Set<string>();
  const orphanIds: string[] = [];

  for (const chunk of chunkIds(unique)) {
    const { data, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (row.service_order_id) osIds.add(String(row.service_order_id));
      else orphanIds.push(String(row.id));
    }
  }

  const expanded = new Set<string>(orphanIds);
  const osList = [...osIds];
  for (let i = 0; i < osList.length; i += BATCH_LIMITS.UUID_IN_CLAUSE) {
    const chunk = osList.slice(i, i + BATCH_LIMITS.UUID_IN_CLAUSE);
    const { data, error } = await supabase
      .from('series')
      .select('id')
      .in('service_order_id', chunk)
      .in('current_status', [...WORKSHOP_PIPELINE_STATUSES]);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      expanded.add(String(row.id));
    }
  }

  return [...expanded];
}

export type WorkshopOperateParams = {
  seriesIds: string[];
  result: string;
  notes: string;
  selectedDiagnostics?: string[];
  actionName: string;
  userId: string;
  userRole?: string;
  operatorName?: string;
};

/** Actualiza series + auditoría en lotes (servidor, sin N round-trips al browser). */
export async function operateWorkshopSeriesBatch(
  _userClient: SupabaseClient,
  params: WorkshopOperateParams
): Promise<{ processed: number }> {
  const { seriesIds, result, notes, selectedDiagnostics = [], actionName, userId, userRole, operatorName } =
    params;

  if (seriesIds.length === 0) return { processed: 0 };

  const admin = getSupabaseServerClient();

  // Unidad completa: todas las series hermanas de la(s) OS en pipeline
  const targetSeriesIds = await expandSeriesIdsToEquipmentSiblings(admin, seriesIds);

  const seriesToOs = new Map<string, string | null>();
  const seriesStatus = new Map<string, string>();
  for (const chunk of chunkIds(targetSeriesIds)) {
    const { data, error } = await admin
      .from('series')
      .select('id, service_order_id, current_status')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const id = String(row.id);
      seriesToOs.set(id, row.service_order_id ? String(row.service_order_id) : null);
      seriesStatus.set(id, String(row.current_status || ''));
    }
  }

  const completedBySeries = await loadCompletedWorkshopActionsBySeries(admin, targetSeriesIds);
  const prerequisiteCheck = validateEquipmentPrerequisites(
    targetSeriesIds,
    seriesToOs,
    completedBySeries,
    actionName,
    seriesStatus
  );
  if (!prerequisiteCheck.ok) {
    throw new BusinessException(prerequisiteCheck.message);
  }

  assertAllowedWorkshopResult(actionName, result);

  const nextStatus = resolveWorkshopNextStatus(result);
  const updateData: Record<string, unknown> = { current_status: nextStatus };
  if (actionName === 'DIAGNÓSTICO INICIAL COMPLETADO') {
    updateData.current_diagnostics = selectedDiagnostics;
  }

  const auditPayload = {
    result,
    notes,
    nextStatus,
    operator_name: operatorName,
    diagnostics: actionName === 'DIAGNÓSTICO INICIAL COMPLETADO' ? selectedDiagnostics : undefined,
    repairs:
      actionName === 'REPARACIÓN COMPLETADA' || actionName === 'REPARACIÓN L3 COMPLETADA'
        ? selectedDiagnostics
        : undefined,
    items: selectedDiagnostics,
    equipment_complete: true,
    requested_series: seriesIds.length,
    expanded_series: targetSeriesIds.length,
  };

  let processed = 0;

  // Update con service role: el endpoint ya autenticó al operador. El client RLS
  // del usuario puede devolver success con 0 filas (p.ej. puesto "TECNICO JUNIOR"
  // sin enum operacional `tecnico`) → toast verde y la serie se queda en etapa.

  for (const chunk of chunkIds(targetSeriesIds)) {
    const { data: updatedRows, error: updateError } = await admin
      .from('series')
      .update(updateData)
      .in('id', chunk)
      .select('id');

    if (updateError) {
      throw new Error(updateError.message);
    }

    const updatedCount = updatedRows?.length ?? 0;
    if (updatedCount !== chunk.length) {
      throw new Error(
        `No se actualizaron todas las series (${updatedCount}/${chunk.length}). Reintente o revise permisos.`
      );
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
