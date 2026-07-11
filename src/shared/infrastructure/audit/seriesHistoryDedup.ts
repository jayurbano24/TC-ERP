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
 * Seguro para Client Components (sin imports server).
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

  const seenStage = new Set<string>();
  return out.filter((entry) => {
    if (!WORKSHOP_BATCH_ACTIONS.has(entry.action)) return true;
    if (seenStage.has(entry.action)) return false;
    seenStage.add(entry.action);
    return true;
  });
}
