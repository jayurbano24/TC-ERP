import { describe, expect, it } from 'vitest';
import { validateReturnMotivoAgainstCatalog } from './returnMotivo';

describe('validateReturnMotivoAgainstCatalog', () => {
  it('coincide ignorando espacios y mayúsculas', () => {
    expect(
      validateReturnMotivoAgainstCatalog('  equipo defectuoso  ', ['Equipo Defectuoso', 'Otro']),
    ).toBe(true);
  });

  it('rechaza un motivo que no pertenece al catálogo', () => {
    expect(
      validateReturnMotivoAgainstCatalog('motivo inventado', ['Equipo Defectuoso', 'Garantía']),
    ).toBe(false);
  });

  it('sin catálogo exige mínimo tres caracteres', () => {
    expect(validateReturnMotivoAgainstCatalog('ab', null)).toBe(false);
    expect(validateReturnMotivoAgainstCatalog('abc', [])).toBe(true);
    expect(validateReturnMotivoAgainstCatalog('  ab  ', undefined)).toBe(false);
  });

  it('motivo vacío es false', () => {
    expect(validateReturnMotivoAgainstCatalog('', ['Equipo Defectuoso'])).toBe(false);
    expect(validateReturnMotivoAgainstCatalog('   ', null)).toBe(false);
  });
});
