import { describe, expect, it } from 'vitest';
import { resolveWorkshopTreatment } from './workshopTreatment';

describe('resolveWorkshopTreatment — matriz RP/RC', () => {
  it.each([
    {
      name: 'Reparación agregada, con o sin RC → RP',
      hasAddedRepair: true,
      passedReacondicionado: true,
      expected: 'RP' as const,
    },
    {
      name: 'Reparación agregada sin RC → RP',
      hasAddedRepair: true,
      passedReacondicionado: false,
      expected: 'RP' as const,
    },
    {
      name: 'Sin reparación agregada, con paso por RC → RC',
      hasAddedRepair: false,
      passedReacondicionado: true,
      expected: 'RC' as const,
    },
    {
      name: 'Sin reparación agregada y sin RC → vacío',
      hasAddedRepair: false,
      passedReacondicionado: false,
      expected: null,
    },
    {
      name: 'Solo visita Reparación (sin reparación agregada), luego RC → RC',
      hasAddedRepair: false,
      passedReacondicionado: true,
      expected: 'RC' as const,
    },
  ])('$name', ({ hasAddedRepair, passedReacondicionado, expected }) => {
    expect(
      resolveWorkshopTreatment({ hasAddedRepair, passedReacondicionado }),
    ).toBe(expected);
  });

  it('trata booleanos falsy / truthy de forma estricta (no truthy strings)', () => {
    expect(
      resolveWorkshopTreatment({
        hasAddedRepair: false,
        passedReacondicionado: false,
      }),
    ).toBeNull();
    expect(
      resolveWorkshopTreatment({
        hasAddedRepair: true,
        passedReacondicionado: true,
      }),
    ).toBe('RP');
  });
});
