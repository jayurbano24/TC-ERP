import { describe, it, expect } from 'vitest';
import { DefaultTransitionPolicy } from './default-transition-policy';
import { OPERATIONAL_STATE_CODE } from '../enums/operational-state-code.enum';

describe('DefaultTransitionPolicy', () => {
  const policy = new DefaultTransitionPolicy();

  it('permite la primera asignación (from null)', () => {
    const result = policy.validate(null, OPERATIONAL_STATE_CODE.BODEGA, {});
    expect(result.allowed).toBe(true);
  });

  it('permite re-afirmar el mismo estado (idempotente), incluso terminal', () => {
    expect(
      policy.validate(
        OPERATIONAL_STATE_CODE.DESPACHADO,
        OPERATIONAL_STATE_CODE.DESPACHADO,
        {}
      ).allowed
    ).toBe(true);
  });

  it('permite transiciones entre estados operativos no terminales', () => {
    expect(
      policy.validate(OPERATIONAL_STATE_CODE.BODEGA, OPERATIONAL_STATE_CODE.TALLER, {})
        .allowed
    ).toBe(true);
  });

  it('bloquea salir de un estado terminal hacia otro estado', () => {
    for (const terminal of [
      OPERATIONAL_STATE_CODE.DESPACHADO,
      OPERATIONAL_STATE_CODE.SCRAP,
      OPERATIONAL_STATE_CODE.DEVUELTO,
    ]) {
      const result = policy.validate(terminal, OPERATIONAL_STATE_CODE.TALLER, {});
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain('terminal');
      }
    }
  });
});
