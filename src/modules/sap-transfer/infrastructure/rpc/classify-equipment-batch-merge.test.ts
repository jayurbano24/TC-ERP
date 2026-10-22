import { describe, expect, it } from 'vitest';
import { formatSkippedClassifyError } from './classify-equipment-batch-merge';

describe('formatSkippedClassifyError', () => {
  it('no convierte EQUIPMENT_IDENTITY_MISMATCH en "Serie duplicada"', () => {
    const formatted = formatSkippedClassifyError({
      main_serial: 'M1934ER01847',
      code: 'EQUIPMENT_IDENTITY_MISMATCH',
      error: 'La identidad S1-S4 o el contexto recepción/SAP no coincide con la OS activa.',
    });

    expect(formatted).toMatch(/identidad S1-S4|contexto recepción\/SAP/i);
    expect(formatted).not.toMatch(/serie duplicada/i);
  });
});
