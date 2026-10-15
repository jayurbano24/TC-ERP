/** Estatus de serie tratados como scrap / irreparable en backfill (Fase 1). */
export const PREDIAG_BACKFILL_SCRAP_STATUSES = new Set([
  'irreparable',
  'scrapped',
  'in_scraps',
]);

export const PREDIAG_BACKFILL_ACTOR_NAME = 'Sistema · backfill CHG-015';

export const PREDIAG_BACKFILL_MAX_BATCH = 500;

/** Resuelve fecha corte T0: env server o override ISO (API dry-run). */
/** T0 configurado en servidor (null si no hay env). */
export function tryResolvePrediagnosticoBackfillCutoff(): Date | null {
  const env = process.env.PREDIAG_BACKFILL_CUTOFF?.trim();
  if (!env) return null;
  const d = new Date(env);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolvePrediagnosticoBackfillCutoff(cutoffIso?: string): Date {
  if (cutoffIso) {
    const d = new Date(cutoffIso);
    if (Number.isNaN(d.getTime())) {
      throw new Error('Fecha de corte (cutoff) no válida');
    }
    return d;
  }
  const env = process.env.PREDIAG_BACKFILL_CUTOFF?.trim();
  if (!env) {
    throw new Error(
      'Configure PREDIAG_BACKFILL_CUTOFF (ISO) en el servidor o envíe cutoff en el body del backfill.'
    );
  }
  const d = new Date(env);
  if (Number.isNaN(d.getTime())) {
    throw new Error('PREDIAG_BACKFILL_CUTOFF no es una fecha ISO válida');
  }
  return d;
}

export function isScrapStatusForBackfill(currentStatus: string | null | undefined): boolean {
  const s = (currentStatus || '').trim().toLowerCase();
  if (!s) return false;
  return PREDIAG_BACKFILL_SCRAP_STATUSES.has(s);
}
