import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isScrapStatusForBackfill,
  PREDIAG_BACKFILL_MAX_BATCH,
} from './prediagnosticoBackfillConfig';
import { loadPrediagnosticoBackfillCatalog } from './prediagnosticoBackfillCatalog';
import { listPrediagnosticoBackfillCandidates } from './prediagnosticoBackfillEligibleQuery';
import { prediagnosticoBackfillCandidateHasCatalog } from './prediagnosticoBackfillService';

export type PrediagnosticoFaltanteRow = {
  serviceOrderId: string;
  serial: string;
  modelId: string;
  brandId: string;
  techId: string;
  ingressAt: string;
  currentStatus: string;
  motivo: 'generable' | 'sin_catalogo';
};

export type AuditPrediagnosticoFaltantesResult = {
  cutoff: string;
  totalSinPrediag: number;
  generable: number;
  sinCatalogo: number;
  /** Hasta maxExport filas sin catálogo (para CSV ops). */
  sinCatalogoRows: PrediagnosticoFaltanteRow[];
};

/**
 * Escanea todas las OS candidatas CHG-015 (sin fila en prediagnosticos, pre-T0).
 */
export async function auditPrediagnosticoFaltantes(
  supabase: SupabaseClient,
  cutoff: Date,
  options?: { maxExportSinCatalogo?: number },
): Promise<AuditPrediagnosticoFaltantesResult> {
  const maxExport = options?.maxExportSinCatalogo ?? 5_000;
  const catalogCtx = await loadPrediagnosticoBackfillCatalog(supabase);

  let offset = 0;
  let totalSinPrediag = 0;
  let generable = 0;
  let sinCatalogo = 0;
  const sinCatalogoRows: PrediagnosticoFaltanteRow[] = [];

  for (;;) {
    const batch = await listPrediagnosticoBackfillCandidates(
      supabase,
      cutoff,
      PREDIAG_BACKFILL_MAX_BATCH,
      offset,
      isScrapStatusForBackfill,
    );
    if (batch.length === 0) break;

    for (const c of batch) {
      totalSinPrediag += 1;
      const ok = prediagnosticoBackfillCandidateHasCatalog(c, catalogCtx);
      if (ok) {
        generable += 1;
      } else {
        sinCatalogo += 1;
        if (sinCatalogoRows.length < maxExport) {
          sinCatalogoRows.push({
            serviceOrderId: c.serviceOrderId,
            serial: c.serial,
            modelId: c.modelId,
            brandId: c.brandId,
            techId: c.techId,
            ingressAt: c.ingressAt.toISOString(),
            currentStatus: c.currentStatus,
            motivo: 'sin_catalogo',
          });
        }
      }
    }

    if (batch.length < PREDIAG_BACKFILL_MAX_BATCH) break;
    offset += PREDIAG_BACKFILL_MAX_BATCH;
  }

  return {
    cutoff: cutoff.toISOString(),
    totalSinPrediag,
    generable,
    sinCatalogo,
    sinCatalogoRows,
  };
}
