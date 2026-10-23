import { describe, expect, it } from 'vitest';
import { parseHarvestBulkSerials } from './harvestBulkSerials';

describe('parseHarvestBulkSerials', () => {
  it('acepta series separadas por salto, coma, punto y coma o espacio', () => {
    expect(parseHarvestBulkSerials('SN-1\nSN-2, SN-3;SN-4')).toEqual([
      'SN-1', 'SN-2', 'SN-3', 'SN-4',
    ]);
  });

  it('normaliza y elimina duplicados conservando el orden', () => {
    expect(parseHarvestBulkSerials(' sn-1 SN-2 SN-1 ')).toEqual(['SN-1', 'SN-2']);
  });

  it('limita el lote a 100 series', () => {
    const text = Array.from({ length: 101 }, (_, index) => `SN-${index}`).join('\n');
    expect(() => parseHarvestBulkSerials(text)).toThrow('MÃ¡ximo 100 series');
  });
});
