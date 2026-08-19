import { describe, expect, it } from 'vitest';
import {
  filterCacAgenciesOnly,
  isCourierLabel,
  sanitizeCacAgencyRaw,
} from './cacAgencyUtils';

describe('cacAgencyUtils — Cargo Express no es agencia', () => {
  it('detecta variantes de Cargo Express como courier', () => {
    expect(isCourierLabel('Cargo Express')).toBe(true);
    expect(isCourierLabel('CARGO EXPRESS')).toBe(true);
    expect(isCourierLabel('CargoExpress')).toBe(true);
    expect(isCourierLabel('cargo-express')).toBe(true);
    expect(isCourierLabel('Cargo Expreso')).toBe(true);
  });

  it('sanitizeCacAgencyRaw rechaza Cargo Express', () => {
    expect(sanitizeCacAgencyRaw('Cargo Express')).toBe('');
    expect(sanitizeCacAgencyRaw('Cargo Express', 'Guatex')).toBe('');
    expect(sanitizeCacAgencyRaw('G245-TECÚN UMÁN', 'Cargo Express', [
      { id: 'G245', name: 'G245-TECÚN UMÁN' },
    ])).toBe('G245-TECÚN UMÁN');
  });

  it('filterCacAgenciesOnly excluye couriers del catálogo', () => {
    const rows = filterCacAgenciesOnly([
      { id: 'G245', name: 'TECÚN UMÁN' },
      { id: 'CX', name: 'Cargo Express' },
      { id: 'GX', name: 'Guatex' },
    ]);
    expect(rows.map((r) => r.id)).toEqual(['G245']);
  });
});
