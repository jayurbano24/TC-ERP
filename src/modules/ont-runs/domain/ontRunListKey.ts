import type { OntRun } from './types';
import { normalizeOntRunSerial, truncateToMinute } from './groupOntRunsBySerial';
import { pickPreferredOntRun } from './ontRunVerdict';

/**
 * Misma ONT RUN + serie + minuto = duplicado de sync (PASS/FAIL repetidos).
 * No usar solo PK Supabase: el lab puede insertar varias filas idénticas.
 */
export function ontRunCanonicalSyncKey(run: OntRun): string {
  const runId = run.runId.trim().toUpperCase() || '_';
  const serial = normalizeOntRunSerial(run.serial).toUpperCase() || '_';
  const minute = truncateToMinute(run.recordedAt);
  return `${runId}|${serial}|${minute}`;
}

/** Clave estable para listas React. */
export function ontRunListKey(run: OntRun, index: number): string {
  const id = run.id?.trim();
  if (id) return `${ontRunCanonicalSyncKey(run)}::${id}`;
  return `${ontRunCanonicalSyncKey(run)}::${index}`;
}

export function ontRunDedupeKey(run: OntRun): string {
  return ontRunCanonicalSyncKey(run);
}

export type OntRunDedupeResult = {
  rows: OntRun[];
  /** Filas colapsadas (mismo JOB/serie/minuto). */
  suppressed: number;
};

export function dedupeOntRunsWithStats(rows: OntRun[]): OntRunDedupeResult {
  const byKey = new Map<string, OntRun>();
  let suppressed = 0;

  for (const run of rows) {
    const key = ontRunCanonicalSyncKey(run);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, run);
      continue;
    }
    suppressed += 1;
    byKey.set(key, pickPreferredOntRun(existing, run));
  }

  const deduped = [...byKey.values()];
  deduped.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  return { rows: deduped, suppressed };
}

export function dedupeOntRuns(rows: OntRun[]): OntRun[] {
  return dedupeOntRunsWithStats(rows).rows;
}
