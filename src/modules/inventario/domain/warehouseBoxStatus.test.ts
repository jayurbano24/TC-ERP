import { describe, expect, it } from 'vitest';
import { resolveWarehouseBoxOperationalStatus } from './warehouseBoxStatus';

describe('estado operativo de cajas de Bodega', () => {
  it('distingue una parcial cerrada de una captura en proceso', () => {
    expect(
      resolveWarehouseBoxOperationalStatus({
        units: 63,
        capacity: 75,
        boxStatus: 'closed',
        isPartialBox: true,
        partialReason: 'Caja cerrada por operador',
      }),
    ).toEqual({
      status: 'Cerrada parcial',
      difference: 12,
      reason: 'Caja cerrada por operador',
    });

    expect(
      resolveWarehouseBoxOperationalStatus({
        units: 6,
        capacity: 18,
        boxStatus: 'en_captura',
      }).status,
    ).toBe('En proceso');
  });

  it('identifica diferencias posteriores en cajas que originalmente cerraron completas', () => {
    expect(
      resolveWarehouseBoxOperationalStatus({
        units: 19,
        capacity: 20,
        boxStatus: 'closed',
        isPartialBox: false,
      }),
    ).toMatchObject({
      status: 'Cerrada con diferencia',
      difference: 1,
    });
  });

  it('mantiene Full cuando la capacidad está alcanzada', () => {
    expect(
      resolveWarehouseBoxOperationalStatus({
        units: 20,
        capacity: 20,
        boxStatus: 'closed',
      }).status,
    ).toBe('Full');
  });
});
