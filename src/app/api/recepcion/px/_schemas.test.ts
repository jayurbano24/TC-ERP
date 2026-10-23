import { describe, expect, it } from 'vitest';
import { guideDataSchema } from './_schemas';

const base = {
  sap: '450001',
  proveedorPx: 'Proveedor PX',
  totalCajasEsperadas: 1,
};

describe('guideDataSchema destination', () => {
  it.each(['CENTRAL', 'OBSOLETE'] as const)('acepta el destino %s', (inventoryDestination) => {
    expect(guideDataSchema.safeParse({ ...base, inventoryDestination }).success).toBe(true);
  });

  it('rechaza una recepciÃ³n sin clasificaciÃ³n', () => {
    expect(guideDataSchema.safeParse(base).success).toBe(false);
  });
});
