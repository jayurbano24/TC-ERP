import { describe, expect, it } from 'vitest';
import { validatePxIncrementalFinalizeReadiness } from './pxBoxUtils';

describe('validatePxIncrementalFinalizeReadiness', () => {
  it('bloquea una caja con todas las unidades rechazadas por OS abierta', () => {
    const result = validatePxIncrementalFinalizeReadiness(
      {
        'PX-01': {
          captured_count: 0,
          rejected_count: 20,
          status: 'abierta',
        },
      },
      [],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('0 unidades aceptadas');
      expect(result.reason).toContain('20 rechazadas');
    }
  });

  it('permite aplicar la política parcial existente cuando hay aceptadas', () => {
    const result = validatePxIncrementalFinalizeReadiness(
      {
        'PX-01': {
          captured_count: 15,
          rejected_count: 5,
          status: 'cerrada',
        },
      },
      ['PX-01'],
    );

    expect(result).toEqual({
      ok: true,
      boxCodes: ['PX-01'],
      totalCaptured: 15,
    });
  });

  it('no contabiliza rechazadas como unidades recibidas', () => {
    const result = validatePxIncrementalFinalizeReadiness(
      {
        'PX-01': {
          captured_count: 1,
          rejected_count: 19,
          status: 'cerrada',
        },
      },
      ['PX-01'],
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.totalCaptured).toBe(1);
  });
});
