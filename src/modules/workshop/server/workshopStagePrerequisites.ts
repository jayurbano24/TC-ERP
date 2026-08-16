import type { SupabaseClient } from '@supabase/supabase-js';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

export const WORKSHOP_STAGE_ACTIONS = {
  DIAG: 'DIAGNÓSTICO INICIAL COMPLETADO',
  REP: 'REPARACIÓN COMPLETADA',
  REAC: 'REACONDICIONADO COMPLETADO',
  QC: 'CONTROL DE CALIDAD COMPLETADO',
} as const;

export type WorkshopPrerequisiteResult = {
  ok: boolean;
  message: string;
  seriesId?: string;
  missingLabel?: string;
};

const ACTION_LABELS: Record<string, string> = {
  [WORKSHOP_STAGE_ACTIONS.DIAG]: 'Diagnóstico Inicial',
  [WORKSHOP_STAGE_ACTIONS.REP]: 'Reparación',
  [WORKSHOP_STAGE_ACTIONS.REAC]: 'Reacondicionado',
  [WORKSHOP_STAGE_ACTIONS.QC]: 'Control de Calidad',
};

/** Solo exige Diagnóstico Inicial antes de cualquier otra operación de taller. */
export function getPrerequisitesForAction(actionName: string): {
  requireAll: string[];
  requireAny: string[];
} {
  if (actionName === WORKSHOP_STAGE_ACTIONS.DIAG) {
    return { requireAll: [], requireAny: [] };
  }
  return { requireAll: [WORKSHOP_STAGE_ACTIONS.DIAG], requireAny: [] };
}

export function actionNameForWorkshopTab(
  tab: string
): string {
  switch (tab) {
    case 'diagnostico':
      return WORKSHOP_STAGE_ACTIONS.DIAG;
    case 'reparacion':
      return WORKSHOP_STAGE_ACTIONS.REP;
    case 'reacondicionado':
      return WORKSHOP_STAGE_ACTIONS.REAC;
    case 'qc':
      return WORKSHOP_STAGE_ACTIONS.QC;
    case 'l3':
      return 'REPARACIÓN L3 COMPLETADA';
    default:
      return 'OPERACIÓN COMPLETADA';
  }
}

function labelForAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function validateSeriesPrerequisites(
  seriesIds: string[],
  completedBySeries: Map<string, Set<string>>,
  actionName: string
): WorkshopPrerequisiteResult {
  const { requireAll, requireAny } = getPrerequisitesForAction(actionName);
  if (requireAll.length === 0 && requireAny.length === 0) {
    return { ok: true, message: '' };
  }

  for (const seriesId of seriesIds) {
    const done = completedBySeries.get(seriesId) ?? new Set<string>();

    for (const required of requireAll) {
      if (!done.has(required)) {
        return {
          ok: false,
          message: `El equipo no tiene ${labelForAction(required)} completado. No puede avanzar a la siguiente etapa.`,
          seriesId,
          missingLabel: labelForAction(required),
        };
      }
    }

    if (requireAny.length > 0 && !requireAny.some((a) => done.has(a))) {
      const labels = requireAny.map(labelForAction).join(' o ');
      return {
        ok: false,
        message: `El equipo debe tener ${labels} completado antes de continuar.`,
        seriesId,
        missingLabel: labels,
      };
    }
  }

  return { ok: true, message: '' };
}

/**
 * Prerrequisitos a nivel equipo (OS): basta que UNA serie hermana tenga la
 * etapa previa auditada (históricamente a veces solo se auditó S1).
 * Si el equipo ya está avanzado en pipeline sin bitácora DIAG (legado), se tolera.
 */
export function validateEquipmentPrerequisites(
  seriesIds: string[],
  seriesToOs: Map<string, string | null>,
  completedBySeries: Map<string, Set<string>>,
  actionName: string,
  seriesStatus?: Map<string, string>
): WorkshopPrerequisiteResult {
  const { requireAll, requireAny } = getPrerequisitesForAction(actionName);
  if (requireAll.length === 0 && requireAny.length === 0) {
    return { ok: true, message: '' };
  }

  const byOs = new Map<string, string[]>();
  const orphans: string[] = [];
  for (const id of seriesIds) {
    const osId = seriesToOs.get(id);
    if (osId) {
      const list = byOs.get(osId) ?? [];
      list.push(id);
      byOs.set(osId, list);
    } else {
      orphans.push(id);
    }
  }

  const pipelinePastDiag = new Set([
    'in_qc',
    'in_validation',
    'ready_to_dispatch',
    'in_control_warehouse',
    'irreparable',
    'in_central_warehouse',
  ]);

  const checkGroup = (groupIds: string[]): WorkshopPrerequisiteResult => {
    const union = new Set<string>();
    for (const id of groupIds) {
      for (const action of completedBySeries.get(id) ?? []) {
        union.add(action);
      }
    }
    const alreadyPastDiag = groupIds.some((id) =>
      pipelinePastDiag.has(String(seriesStatus?.get(id) || ''))
    );

    for (const required of requireAll) {
      if (union.has(required)) continue;
      if (required === WORKSHOP_STAGE_ACTIONS.DIAG && alreadyPastDiag) continue;
      return {
        ok: false,
        message: `El equipo no tiene ${labelForAction(required)} completado. No puede avanzar a la siguiente etapa.`,
        seriesId: groupIds[0],
        missingLabel: labelForAction(required),
      };
    }
    if (requireAny.length > 0 && !requireAny.some((a) => union.has(a))) {
      const labels = requireAny.map(labelForAction).join(' o ');
      return {
        ok: false,
        message: `El equipo debe tener ${labels} completado antes de continuar.`,
        seriesId: groupIds[0],
        missingLabel: labels,
      };
    }
    return { ok: true, message: '' };
  };

  for (const [, groupIds] of byOs) {
    const result = checkGroup(groupIds);
    if (!result.ok) return result;
  }
  for (const orphanId of orphans) {
    const result = checkGroup([orphanId]);
    if (!result.ok) return result;
  }

  return { ok: true, message: '' };
}

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function loadCompletedWorkshopActionsBySeries(
  db: SupabaseClient,
  seriesIds: string[]
): Promise<Map<string, Set<string>>> {
  const completedBySeries = new Map<string, Set<string>>();
  const uniqueIds = [...new Set(seriesIds)];
  if (uniqueIds.length === 0) return completedBySeries;

  for (const chunk of chunkIds(uniqueIds)) {
    const { data, error } = await db
      .from('erp_audit_logs')
      .select('record_id, action')
      .in('record_id', chunk)
      .in('action', [WORKSHOP_STAGE_ACTIONS.DIAG]);

    if (error) throw error;

    for (const row of data || []) {
      const id = String(row.record_id);
      const set = completedBySeries.get(id) ?? new Set<string>();
      set.add(String(row.action));
      completedBySeries.set(id, set);
    }
  }

  return completedBySeries;
}
