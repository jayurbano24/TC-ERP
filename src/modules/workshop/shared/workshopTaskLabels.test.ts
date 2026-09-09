import { describe, expect, it } from 'vitest';
import {
  enrichWorkshopTaskDisplayLabels,
  resolveWorkshopDiagnosticLabel,
  resolveWorkshopRepairLabel,
  resolveWorkshopReacondicionadoLabel,
} from './workshopTaskLabels';

describe('workshopTaskLabels', () => {
  const sources = {
    diagnostics: [{ id: 'd1', nombre: 'PUERTO USB' }],
    repairs: [{ id: 'r1', nombre: 'CAMBIO DE PUERTO USB' }],
    reacondicionadoTests: [{ id: 't1', name: 'RESET DE FÁBRICA' }],
    catalogNamesById: { d2: 'Falla óptica' },
  };

  it('resuelve diagnóstico desde catálogo o motivo L3', () => {
    expect(
      resolveWorkshopDiagnosticLabel({ current_diagnostics: ['d1'] }, sources),
    ).toBe('PUERTO USB');
    expect(
      resolveWorkshopDiagnosticLabel({ l3_reason_text: 'Sin señal GPON' }, sources),
    ).toBe('Sin señal GPON');
    expect(resolveWorkshopDiagnosticLabel({}, sources)).toBe('Sin diagnóstico registrado');
  });

  it('resuelve reparación y reacondicionado', () => {
    expect(resolveWorkshopRepairLabel({ current_repairs: ['r1'] }, sources)).toBe(
      'CAMBIO DE PUERTO USB',
    );
    expect(
      resolveWorkshopReacondicionadoLabel({ current_reacondicionado: ['t1'] }, sources),
    ).toBe('RESET DE FÁBRICA');
  });

  it('enriquece las tres etiquetas para fila de cola', () => {
    expect(
      enrichWorkshopTaskDisplayLabels(
        {
          current_diagnostics: ['d2'],
          current_repairs: ['r1'],
          current_reacondicionado: ['t1'],
        },
        sources,
      ),
    ).toEqual({
      diagnosticoLabel: 'Falla óptica',
      reparacionLabel: 'CAMBIO DE PUERTO USB',
      reacondicionadoLabel: 'RESET DE FÁBRICA',
    });
  });
});
