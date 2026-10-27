import {
  resolveWorkshopTreatment,
  type WorkshopTreatmentEvidence,
} from '@/modules/workshop/domain/workshopTreatment';
import { hasNonEmptyCatalogIdList } from '@/modules/workshop/shared/workshopSeriesDisplay';

export type OpsMonthlyTreatmentCategory = 'reparado' | 'reacondicionado';

export type SeriesTreatmentCatalog = {
  current_repairs?: unknown;
  current_reacondicionado?: unknown;
};

/**
 * Une catálogo en `series` + auditoría histórica.
 * Visitar Reparación sin IDs no aporta hasAddedRepair.
 */
export function mergeSeriesTreatmentEvidence(
  catalog: SeriesTreatmentCatalog,
  audit: WorkshopTreatmentEvidence | undefined,
): WorkshopTreatmentEvidence {
  return {
    hasAddedRepair:
      hasNonEmptyCatalogIdList(catalog.current_repairs) || Boolean(audit?.hasAddedRepair),
    passedReacondicionado:
      hasNonEmptyCatalogIdList(catalog.current_reacondicionado) ||
      Boolean(audit?.passedReacondicionado),
  };
}

/**
 * Categoría del Motor de Reportes a partir de evidencia (no de current_status).
 * RP y RC son mutuamente excluyentes por unidad (equipo).
 */
export function opsMonthlyCategoryFromEvidence(
  evidence: WorkshopTreatmentEvidence,
): OpsMonthlyTreatmentCategory | null {
  const treatment = resolveWorkshopTreatment(evidence);
  if (treatment === 'RP') return 'reparado';
  if (treatment === 'RC') return 'reacondicionado';
  return null;
}
