import { describe, expect, it } from 'vitest';
import {
  evaluateIngressWarranty,
  isWithinWarrantyWindow,
  resolveWarrantyDispatchProfile,
  formatWarrantyProfileRequiredError,
  warrantyPackCounts,
  WARRANTY_PERIOD_DAYS,
} from './warrantyPolicy';

describe('resolveWarrantyDispatchProfile', () => {
  it('marca bueno con clase B', () => {
    expect(
      resolveWarrantyDispatchProfile({
        claseCarcasa: 'B',
        hadRepairCompleted: true,
        hadQcOrReacondCompleted: false,
      })
    ).toBe('bueno');
  });

  it('marca listo con dictamen reacondicionado sin reparación', () => {
    expect(
      resolveWarrantyDispatchProfile({
        claseCarcasa: 'A',
        hadRepairCompleted: false,
        hadQcOrReacondCompleted: false,
        dictamen: 'Reacondición',
      })
    ).toBe('listo');
  });

  it('marca listo sin reparación y con QC/reacond', () => {
    expect(
      resolveWarrantyDispatchProfile({
        claseCarcasa: 'A',
        hadRepairCompleted: false,
        hadQcOrReacondCompleted: true,
      })
    ).toBe('listo');
  });

  it('no elegible si hubo reparación y no es clase B', () => {
    expect(
      resolveWarrantyDispatchProfile({
        claseCarcasa: 'C',
        hadRepairCompleted: true,
        hadQcOrReacondCompleted: true,
      })
    ).toBeNull();
  });
});

describe('evaluateIngressWarranty', () => {
  const prior = {
    priorServiceOrderId: 'os-1',
    dispatchedAtIso: '2026-01-01T12:00:00.000Z',
    profile: 'listo' as const,
  };

  it('primer ingreso nunca es garantía', () => {
    expect(
      evaluateIngressWarranty({
        reentryCount: 1,
        ingressAt: new Date('2026-02-01T00:00:00Z'),
        priorDispatch: prior,
      }).isGarantia
    ).toBe(false);
  });

  it('reingreso dentro de 90 días es garantía', () => {
    expect(
      evaluateIngressWarranty({
        reentryCount: 2,
        ingressAt: new Date('2026-03-01T00:00:00Z'),
        priorDispatch: prior,
      }).isGarantia
    ).toBe(true);
  });

  it('reingreso después de 90 días no es garantía', () => {
    expect(
      evaluateIngressWarranty({
        reentryCount: 2,
        ingressAt: new Date('2026-05-01T00:00:00Z'),
        priorDispatch: prior,
      }).isGarantia
    ).toBe(false);
  });
});

describe('warrantyPackCounts', () => {
  it('cuenta vigentes y vencidas', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const counts = warrantyPackCounts(
      [
        { dispatchedAt: new Date('2026-04-01T00:00:00Z'), profile: 'listo', now },
        { dispatchedAt: new Date('2025-01-01T00:00:00Z'), profile: 'bueno', now },
        { dispatchedAt: new Date('2026-01-01T00:00:00Z'), profile: null, now },
      ],
      now
    );
    expect(counts.enGarantia).toBe(1);
    expect(counts.vencida).toBe(1);
    expect(counts.elegiblesDespachados).toBe(2);
  });
});

describe('isWithinWarrantyWindow', () => {
  it('respeta ventana de 90 días', () => {
    const dispatch = new Date('2026-01-01T00:00:00Z');
    const day89 = new Date('2026-03-31T00:00:00Z');
    const day91 = new Date('2026-04-02T00:00:00Z');
    expect(isWithinWarrantyWindow(dispatch, day89, WARRANTY_PERIOD_DAYS)).toBe(true);
    expect(isWithinWarrantyWindow(dispatch, day91, WARRANTY_PERIOD_DAYS)).toBe(false);
  });
});

describe('formatWarrantyProfileRequiredError', () => {
  it('traduce código WARRANTY_PROFILE_REQUIRED', () => {
    const msg = formatWarrantyProfileRequiredError(
      'WARRANTY_PROFILE_REQUIRED: Complete prediagnóstico. OS TC-GT-1'
    );
    expect(msg).toContain('perfil de garantía');
    expect(msg).toContain('Warranty Pack');
  });
});
