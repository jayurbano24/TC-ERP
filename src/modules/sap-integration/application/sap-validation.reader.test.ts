import { describe, expect, it } from 'vitest';
import { DefaultSapValidationReader } from './sap-validation.reader';

describe('DefaultSapValidationReader (gate de validación SAP)', () => {
  const reader = new DefaultSapValidationReader();

  it('resuelve "Validado SAP" cuando el equipo está validado', () => {
    expect(reader.resolveStatus({ integrationStatus: 'Validado SAP' })).toBe('Validado SAP');
  });

  it('resuelve "Pendiente Validación" ante estado vacío o desconocido', () => {
    expect(reader.resolveStatus({ integrationStatus: '' })).toBe('Pendiente Validación');
    expect(reader.resolveStatus({ integrationStatus: 'algo-raro' })).toBe('Pendiente Validación');
  });

  it('autoriza el despacho solo cuando el estado es "Validado SAP"', () => {
    const ok = reader.authorize({ integrationStatus: 'Validado SAP' }, 'dispatch');
    expect(ok.allowed).toBe(true);
    expect(ok.status).toBe('Validado SAP');

    const blocked = reader.authorize({ integrationStatus: 'Pendiente Validación' }, 'dispatch');
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.reason).toContain('no se puede despachar');
    }
  });

  it('permite traslado en "Pendiente Validación" pero lo bloquea en "Sin Coincidencia"', () => {
    const pending = reader.authorize({ integrationStatus: 'Pendiente Validación' }, 'transfer');
    expect(pending.allowed).toBe(true);

    const noMatch = reader.authorize({ integrationStatus: 'Sin Coincidencia' }, 'transfer');
    expect(noMatch.allowed).toBe(false);
  });

  it('bloquea despacho y traslado en estados "Sin Coincidencia" y "Obsoleto"', () => {
    for (const status of ['Sin Coincidencia', 'Obsoleto']) {
      expect(reader.authorize({ integrationStatus: status }, 'dispatch').allowed).toBe(false);
      expect(reader.authorize({ integrationStatus: status }, 'transfer').allowed).toBe(false);
    }
  });

  it('exige todas las series validadas para considerar la unidad "Validado SAP"', () => {
    const allValid = reader.resolveStatus({
      integrationStatus: 'Validado SAP',
      seriesStatuses: ['validado', 'validado'],
    });
    expect(allValid).toBe('Validado SAP');

    const mixed = reader.resolveStatus({
      integrationStatus: 'Pendiente Validación',
      seriesStatuses: ['validado', 'pendiente'],
    });
    expect(mixed).toBe('Pendiente Revisión');

    const noMatch = reader.resolveStatus({
      integrationStatus: 'Pendiente Validación',
      seriesStatuses: ['sin coincidencia'],
    });
    expect(noMatch).toBe('Sin Coincidencia');
  });
});
