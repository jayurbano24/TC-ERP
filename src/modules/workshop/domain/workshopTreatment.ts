/**
 * Política canónica Historial / TRATAMIENTO RP|RC (SSOT).
 * Unidad de conteo: equipo (`series.id`). Ver report-catalog.md.
 */
export type WorkshopTreatment = 'RP' | 'RC';

export type WorkshopTreatmentEvidence = {
  /** Reparación realmente agregada (IDs de catálogo), no solo visita al área. */
  hasAddedRepair: boolean;
  /** Evidencia de paso por Reacondicionado. */
  passedReacondicionado: boolean;
};

/**
 * RP si hay reparación agregada; RC solo si pasó por Reacondicionado sin reparación agregada.
 * El orden del recorrido no importa; un retorno a RC no reemplaza RP.
 */
export function resolveWorkshopTreatment(
  evidence: WorkshopTreatmentEvidence,
): WorkshopTreatment | null {
  if (evidence.hasAddedRepair) return 'RP';
  if (evidence.passedReacondicionado) return 'RC';
  return null;
}
