import { describe, expect, it } from 'vitest';
import { validateHarvestCaseInput } from './harvestCase';

const line = { catalogId: 'part-1', qty: 1, notes: null };

describe('validateHarvestCaseInput', () => {
  it('acepta varias series cuando cada una tiene piezas', () => {
    expect(validateHarvestCaseInput([
      { seriesId: 'series-1', lines: [line] },
      { seriesId: 'series-2', lines: [{ ...line, catalogId: 'part-2' }] },
    ])).toEqual({ ok: true });
  });

  it('rechaza una serie repetida', () => {
    expect(validateHarvestCaseInput([
      { seriesId: 'series-1', lines: [line] },
      { seriesId: 'series-1', lines: [line] },
    ])).toEqual({ ok: false, error: 'DUPLICATE_DONOR' });
  });

  it('rechaza un donante sin piezas', () => {
    expect(validateHarvestCaseInput([{ seriesId: 'series-1', lines: [] }])).toEqual({
      ok: false,
      error: 'DONOR_WITHOUT_LINES',
    });
  });

  it('rechaza cantidades mayores a una unidad del mismo SKU por serie', () => {
    expect(validateHarvestCaseInput([
      { seriesId: 'series-1', lines: [{ catalogId: 'part-1', qty: 2 }] },
    ])).toEqual({ ok: false, error: 'PART_QUANTITY_EXCEEDED' });
  });

  it('rechaza la misma pieza duplicada dentro de una serie', () => {
    expect(validateHarvestCaseInput([
      { seriesId: 'series-1', lines: [line, { ...line, notes: 'duplicada' }] },
    ])).toEqual({ ok: false, error: 'DUPLICATE_PART' });
  });

  it('permite la misma pieza en series donantes diferentes', () => {
    expect(validateHarvestCaseInput([
      { seriesId: 'series-1', lines: [line] },
      { seriesId: 'series-2', lines: [line] },
    ])).toEqual({ ok: true });
  });
});
