import { describe, expect, it } from 'vitest';
import { workshopTabSearchQueryKey } from './useWorkshopTabDataset';

describe('workshopTabSearchQueryKey', () => {
  it('normaliza tokens para cache estable', () => {
    expect(workshopTabSearchQueryKey('diagnostico', '  zteatv41203876119  ')).toEqual([
      'workshop-tab-search',
      'diagnostico',
      'ZTEATV41203876119',
    ]);
  });

  it('ordena múltiples series en la clave', () => {
    const key = workshopTabSearchQueryKey('diagnostico', 'SN2\nSN1');
    expect(key[2]).toBe('SN2\nSN1');
  });
});
