import { describe, expect, it } from 'vitest';
import {
  assertAllowedWorkshopResult,
  resolveWorkshopNextStatus,
} from './workshopOperateService';
import { BusinessException } from '@/shared/errors/Exceptions';

describe('resolveWorkshopNextStatus', () => {
  it('envía control_calidad a in_validation (cola QC)', () => {
    expect(resolveWorkshopNextStatus('control_calidad')).toBe('in_validation');
  });

  it('envía listo a in_central_warehouse (Equipo Listo)', () => {
    expect(resolveWorkshopNextStatus('listo')).toBe('in_central_warehouse');
  });
});

describe('assertAllowedWorkshopResult', () => {
  it('permite control_calidad desde Reacondicionado', () => {
    expect(() =>
      assertAllowedWorkshopResult('REACONDICIONADO COMPLETADO', 'control_calidad')
    ).not.toThrow();
  });

  it('bloquea Equipo Listo (listo) desde Reacondicionado', () => {
    expect(() =>
      assertAllowedWorkshopResult('REACONDICIONADO COMPLETADO', 'listo')
    ).toThrow(BusinessException);
  });

  it('permite reparacion y scraps desde L3', () => {
    expect(() =>
      assertAllowedWorkshopResult('REPARACIÓN L3 COMPLETADA', 'reparacion')
    ).not.toThrow();
    expect(() =>
      assertAllowedWorkshopResult('REPARACIÓN L3 COMPLETADA', 'scraps')
    ).not.toThrow();
  });

  it('bloquea reacondicionado desde L3', () => {
    expect(() =>
      assertAllowedWorkshopResult('REPARACIÓN L3 COMPLETADA', 'reacondicionado')
    ).toThrow(BusinessException);
  });
});
