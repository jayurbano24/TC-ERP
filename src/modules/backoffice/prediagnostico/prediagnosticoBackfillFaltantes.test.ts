import { describe, expect, it } from 'vitest';
import { prediagnosticoBackfillCandidateHasCatalog } from './prediagnosticoBackfillService';
import type { PrediagnosticoBackfillCatalogContext } from './prediagnosticoBackfillCatalog';

describe('prediagnosticoBackfillFaltantes', () => {
  it('sin ítems de catálogo → no generable', () => {
    const ctx: PrediagnosticoBackfillCatalogContext = {
      catalog: [],
      modelProfileItemIds: new Map(),
    };
    const ok = prediagnosticoBackfillCandidateHasCatalog(
      {
        serviceOrderId: 'os-1',
        serial: 'SN1',
        modelId: 'm1',
        brandId: 'b1',
        techId: 't1',
        ingressAt: new Date('2025-01-01'),
        currentStatus: 'in_central_warehouse',
        isScrap: false,
      },
      ctx,
    );
    expect(ok).toBe(false);
  });
});
