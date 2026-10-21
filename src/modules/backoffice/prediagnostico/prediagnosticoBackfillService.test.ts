import { describe, expect, it } from 'vitest';
import {
  buildSyntheticPrediagnostico,
  classifyPrediagBackfillTiming,
} from './prediagnosticoBackfillPlan';
import { catalogItemsForEquipment } from './prediagnosticoBackfillCatalog';
import type { PrediagnosticoBackfillCatalogContext } from './prediagnosticoBackfillCatalog';
import { backfillAggregatesToRates } from './prediagnosticoBackfillService';
import { insertPrediagnosticoBackfill } from './prediagnosticoService';
import type { PrediagnosticoStore } from './prediagnosticoService';

describe('prediagnosticoBackfillService helpers', () => {
  it('backfillAggregatesToRates calcula proporciones', () => {
    const rates = backfillAggregatesToRates({
      processed: 100,
      inserted: 90,
      skippedExisting: 0,
      skippedNoCatalog: 0,
      errors: 0,
      verdict: { reacondicionado: 60, reparado: 40 },
      shell: { B: 45, A: 12 },
      timing: { within_3_5_days: 80, after_5_days: 20 },
    });
    expect(rates.verdict.reacondicionado).toBeCloseTo(0.6, 2);
    expect(rates.timing.within_3_5_days).toBeCloseTo(0.8, 2);
  });

  it('simula lote: catálogo + payload + timing', () => {
    const catalogCtx: PrediagnosticoBackfillCatalogContext = {
      catalog: [
        {
          id: 'c1',
          name: 'Puertos Ethernet',
          kind: 'cosmetico',
          technologyIds: ['tech-1'],
          brandIds: [],
          sortOrder: 1,
        },
        {
          id: 'f1',
          name: 'Botón reset',
          kind: 'funcionamiento',
          technologyIds: ['tech-1'],
          brandIds: [],
          sortOrder: 2,
        },
      ],
      modelProfileItemIds: new Map([['model-1', new Set(['c1', 'f1'])]]),
    };

    const items = catalogItemsForEquipment(catalogCtx, 'tech-1', 'brand-1', 'model-1');
    expect(items.length).toBe(2);

    const ingressAt = new Date('2024-01-01T12:00:00Z');
    const asOf = new Date('2024-06-01T12:00:00Z');
    let within = 0;
    let after = 0;
    for (let i = 0; i < 200; i += 1) {
      const payload = buildSyntheticPrediagnostico({
        serialOrOrderKey: `SN-${i}`,
        ingressAt,
        asOf,
        isScrap: false,
        catalogItems: items,
      });
      const bucket = classifyPrediagBackfillTiming(ingressAt, payload.recordedAt);
      if (bucket === 'within_3_5_days') within += 1;
      else after += 1;
    }
    expect(within / 200).toBeCloseTo(0.8, 1);
  });
});

describe('insertPrediagnosticoBackfill', () => {
  it('no inserta si ya existe prediagnóstico', async () => {
    const store: PrediagnosticoStore = {
      async findByServiceOrder() {
        return {
          id: 'p1',
          serviceOrderId: 'os-1',
          shellClass: 'A',
          cosmetics: {},
          functionChecks: {},
          verdict: 'reacondicionado',
          notes: '',
          createdBy: null,
          createdByName: 'x',
          createdAt: new Date().toISOString(),
          updatedBy: null,
          updatedByName: 'x',
          updatedAt: new Date().toISOString(),
        };
      },
      async insert() {
        throw new Error('should not insert');
      },
      async update() {
        throw new Error('should not update');
      },
      async insertRevision() {},
    };

    const result = await insertPrediagnosticoBackfill(
      store,
      { userId: null, userName: 'Sistema' },
      {
        serviceOrderId: 'os-1',
        shellClass: 'B',
        cosmetics: {},
        functionChecks: {},
        verdict: 'reparado',
        notes: 'test',
      },
      new Date('2024-02-01T10:00:00Z')
    );
    expect(result).toBeNull();
  });
});
