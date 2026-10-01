import { describe, expect, it } from 'vitest';
import {
  itemAppliesToEquipment,
  validatePrediagnostico,
} from './validatePrediagnostico';

describe('validatePrediagnostico', () => {
  it('exige clase de carcasa y dictamen', () => {
    const errors = validatePrediagnostico({
      serviceOrderId: 'os-1',
      shellClass: null,
      cosmetics: {},
      functionChecks: {},
      verdict: null,
      notes: '',
    });
    expect(errors).toContain('Selecciona la clase de la carcasa');
    expect(errors).toContain('Selecciona el dictamen final');
  });

  it('rechaza enums fuera de catálogo', () => {
    const errors = validatePrediagnostico({
      serviceOrderId: 'os-1',
      shellClass: 'Z',
      cosmetics: { puertos: 'roto' },
      functionChecks: { enciende: 'quizas' },
      verdict: 'pendiente',
      notes: '',
    });
    expect(errors).toContain('Selecciona la clase de la carcasa');
    expect(errors).toContain('Selecciona el dictamen final');
    expect(errors.some((e) => e.includes('puertos'))).toBe(true);
    expect(errors.some((e) => e.includes('enciende'))).toBe(true);
  });

  it('acepta un prediagnóstico completo', () => {
    expect(
      validatePrediagnostico({
        serviceOrderId: 'os-1',
        shellClass: 'B',
        cosmetics: { puertos: 'bien' },
        functionChecks: { wifi: 'na' },
        verdict: 'reacondicionado',
        notes: 'rayón leve',
      })
    ).toEqual([]);
  });
});

describe('itemAppliesToEquipment', () => {
  it('un ítem sin marca aplica a todas las marcas de su tecnología', () => {
    expect(
      itemAppliesToEquipment(
        { technologyIds: ['iptv'], brandIds: [] },
        'iptv',
        'zte'
      )
    ).toBe(true);
    expect(
      itemAppliesToEquipment(
        { technologyIds: ['ont'], brandIds: [] },
        'iptv',
        'zte'
      )
    ).toBe(false);
  });

  it('respeta la marca cuando el catálogo la define', () => {
    expect(
      itemAppliesToEquipment(
        { technologyIds: ['ont'], brandIds: ['huawei'] },
        'ont',
        'zte'
      )
    ).toBe(false);
  });
});
