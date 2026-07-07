import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveProfileDisplayNames } from '@/shared/infrastructure/profiles/resolveProfileDisplayNames';

export type SeriesHistoryEntry = {
  id: string;
  action: string;
  changed_at: string;
  payload: unknown;
  changed_by: string | null;
  profiles: { full_name: string } | null;
};

/** Acciones de taller que se registran una vez por serie en operaciones masivas. */
const WORKSHOP_BATCH_ACTIONS = new Set([
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'REACONDICIONADO COMPLETADO',
  'CONTROL DE CALIDAD COMPLETADO',
]);

/** Ventana para colapsar lotes masivos (varios POST o series con timestamps distintos). */
const BATCH_DEDUPE_WINDOW_MS = 45 * 60 * 1000;

function stableItemsKey(payload: Record<string, unknown>): string {
  const raw = payload.diagnostics ?? payload.items ?? payload.repairs ?? [];
  if (!Array.isArray(raw)) return '';
  return [...raw].map(String).sort().join(',');
}

function operatorKey(entry: SeriesHistoryEntry): string {
  const p = (entry.payload || {}) as Record<string, unknown>;
  const fromPayload =
    typeof p.operator_name === 'string' ? p.operator_name.trim().toLowerCase() : '';
  return (entry.changed_by || fromPayload || 'sistema').toLowerCase();
}

/** Firma de operación sin notas (pueden variar entre series del mismo lote). */
function workshopCoreKey(entry: SeriesHistoryEntry): string {
  const p = (entry.payload || {}) as Record<string, unknown>;
  return [
    entry.action,
    operatorKey(entry),
    String(p.result ?? '').toLowerCase(),
    String(p.nextStatus ?? '').toLowerCase(),
    stableItemsKey(p),
  ].join('|');
}

/**
 * Colapsa entradas duplicadas de operaciones masivas (una fila de auditoría por serie).
 * Asume `entries` ordenadas por fecha descendente.
 */
export function deduplicateSeriesHistory(
  entries: SeriesHistoryEntry[],
  options?: { multiSeries?: boolean }
): SeriesHistoryEntry[] {
  const out: SeriesHistoryEntry[] = [];

  for (const entry of entries) {
    if (!WORKSHOP_BATCH_ACTIONS.has(entry.action)) {
      out.push(entry);
      continue;
    }

    const ts = new Date(entry.changed_at).getTime();
    const core = workshopCoreKey(entry);

    const isBatchDuplicate = out.some((kept) => {
      if (!WORKSHOP_BATCH_ACTIONS.has(kept.action)) return false;
      if (workshopCoreKey(kept) !== core) return false;
      const keptTs = new Date(kept.changed_at).getTime();
      return Math.abs(keptTs - ts) <= BATCH_DEDUPE_WINDOW_MS;
    });

    if (!isBatchDuplicate) out.push(entry);
  }

  if (!options?.multiSeries) return out;

  // Vista de equipo (varias series): una sola entrada por tipo de etapa de taller.
  const seenStage = new Set<string>();
  return out.filter((entry) => {
    if (!WORKSHOP_BATCH_ACTIONS.has(entry.action)) return true;
    if (seenStage.has(entry.action)) return false;
    seenStage.add(entry.action);
    return true;
  });
}

/** Historial de auditoría para una o varias series (record_id = series.id como texto). */
export async function querySeriesHistory(
  supabase: SupabaseClient,
  recordIds: string[]
): Promise<SeriesHistoryEntry[]> {
  const ids = [...new Set(recordIds.map((id) => String(id).trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('erp_audit_logs')
    .select('id, action, created_at, new_values, user_id')
    .in('record_id', ids)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data?.length) return [];

  const userIds = Array.from(new Set(data.map((d) => d.user_id).filter(Boolean))) as string[];
  const profiles = await resolveProfileDisplayNames(userIds);

  const entries = data.map((d) => {
    const payload = (d.new_values || {}) as Record<string, unknown>;
    const payloadName =
      typeof payload.operator_name === 'string' ? payload.operator_name.trim() : '';
    const userId = d.user_id as string | null;
    const resolvedName = (userId && profiles[userId]) || payloadName || '';

    return {
      id: d.id as string,
      action: d.action as string,
      changed_at: d.created_at as string,
      payload: d.new_values,
      changed_by: userId,
      profiles: resolvedName ? { full_name: resolvedName } : userId ? { full_name: 'SISTEMA' } : null,
    };
  });

  return deduplicateSeriesHistory(entries, { multiSeries: ids.length > 1 });
}
