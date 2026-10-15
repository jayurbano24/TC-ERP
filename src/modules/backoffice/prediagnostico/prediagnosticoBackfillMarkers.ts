/** Prefijo en `observaciones` para filas sintéticas CHG-015. */
export const PREDIAG_BACKFILL_NOTES_PREFIX = '[BACKFILL]';

export function isPrediagnosticoBackfillNotes(notes: string | null | undefined): boolean {
  return (notes ?? '').trimStart().startsWith(PREDIAG_BACKFILL_NOTES_PREFIX);
}

/** Bandeja operador: pendiente manual solo si no hay prediag y la OS es post-corte T0. */
export function isOperatorPrediagnosticoPending(
  entry: { prediagnostico?: unknown | null; classifiedAtIso: string },
  cutoff: Date | null
): boolean {
  if (entry.prediagnostico) return false;
  if (!cutoff) return true;
  const ingress = new Date(entry.classifiedAtIso);
  if (Number.isNaN(ingress.getTime())) return true;
  return ingress.getTime() >= cutoff.getTime();
}

export function filterHistoryEntriesExcludingBackfill<T extends { prediagnostico?: { notes?: string } | null }>(
  entries: T[]
): T[] {
  return entries.filter((entry) => !isPrediagnosticoBackfillNotes(entry.prediagnostico?.notes));
}
