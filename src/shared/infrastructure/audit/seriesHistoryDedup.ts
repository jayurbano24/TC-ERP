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

/**
 * Acciones de recepción/bodega escritas por cada serie del equipo (s1–s4).
 * En historial de equipo deben verse una sola vez (momento del pistoleo / ingreso).
 */
const WAREHOUSE_COLLAPSE_ACTIONS = new Set([
  'INGRESO BODEGA',
  'RECEPCIÓN CAC',
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

function warehouseCoreKey(entry: SeriesHistoryEntry): string {
  const p = (entry.payload || {}) as Record<string, unknown>;
  return [
    entry.action,
    String(p.box ?? '').toLowerCase(),
    String(p.source ?? '').toLowerCase(),
    String(p.status ?? '').toLowerCase(),
    operatorKey(entry),
  ].join('|');
}

function collapseCoreKey(entry: SeriesHistoryEntry): string | null {
  if (WORKSHOP_BATCH_ACTIONS.has(entry.action)) return workshopCoreKey(entry);
  if (WAREHOUSE_COLLAPSE_ACTIONS.has(entry.action)) return warehouseCoreKey(entry);
  return null;
}

/**
 * Colapsa entradas duplicadas de operaciones masivas / multi-serie.
 * Asume `entries` ordenadas por fecha descendente.
 * Seguro para Client Components (sin imports server).
 */
export function deduplicateSeriesHistory(
  entries: SeriesHistoryEntry[],
  options?: { multiSeries?: boolean }
): SeriesHistoryEntry[] {
  const out: SeriesHistoryEntry[] = [];

  for (const entry of entries) {
    const core = collapseCoreKey(entry);
    if (!core) {
      out.push(entry);
      continue;
    }

    const ts = new Date(entry.changed_at).getTime();
    const isBatchDuplicate = out.some((kept) => {
      const keptCore = collapseCoreKey(kept);
      if (!keptCore || keptCore !== core) return false;
      const keptTs = new Date(kept.changed_at).getTime();
      return Math.abs(keptTs - ts) <= BATCH_DEDUPE_WINDOW_MS;
    });

    if (!isBatchDuplicate) out.push(entry);
  }

  if (!options?.multiSeries) return out;

  // Vista equipo (varias series): una entrada por etapa de taller / ingreso bodega.
  const seenStage = new Set<string>();
  return out.filter((entry) => {
    const collapse =
      WORKSHOP_BATCH_ACTIONS.has(entry.action) || WAREHOUSE_COLLAPSE_ACTIONS.has(entry.action);
    if (!collapse) return true;
    // INGRESO BODEGA: una por caja; taller: una por action
    const p = (entry.payload || {}) as Record<string, unknown>;
    const stageKey = WAREHOUSE_COLLAPSE_ACTIONS.has(entry.action)
      ? `${entry.action}|${String(p.box ?? '').toLowerCase()}|${String(p.source ?? '').toLowerCase()}`
      : entry.action;
    if (seenStage.has(stageKey)) return false;
    seenStage.add(stageKey);
    return true;
  });
}
