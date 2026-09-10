import { describe, expect, it } from 'vitest';
import {
  enrichWorkshopTaskDisplayLabels,
  formatWorkshopScrapOriginStage,
  resolveWorkshopDiagnosticDetailLabel,
  resolveWorkshopDiagnosticLabel,
  resolveWorkshopRepairLabel,
  resolveWorkshopReacondicionadoLabel,
  resolveWorkshopScrapReasonLabel,
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

  it('no muestra UUID crudo si el id no está en catálogo', () => {
    expect(
      resolveWorkshopDiagnosticLabel(
        { current_diagnostics: ['d8ad312a-a962-4fad-b05d-fc3c7b8cd969'] },
        sources,
      ),
    ).toBe('Diagnóstico no catalogado');
  });

  it('resuelve diagnóstico desde catálogo de reparaciones como fallback', () => {
    expect(
      resolveWorkshopDiagnosticLabel({ current_diagnostics: ['r1'] }, sources),
    ).toBe('CAMBIO DE PUERTO USB');
  });

  it('resuelve reparación y reacondicionado', () => {
    expect(resolveWorkshopRepairLabel({ current_repairs: ['r1'] }, sources)).toBe(
      'CAMBIO DE PUERTO USB',
    );
    expect(
      resolveWorkshopReacondicionadoLabel({ current_reacondicionado: ['t1'] }, sources),
    ).toBe('RESET DE FÁBRICA');
  });

  it('enriquece las etiquetas para fila de cola incluyendo SCRAPS', () => {
    expect(
      enrichWorkshopTaskDisplayLabels(
        {
          current_diagnostics: ['d2'],
          current_repairs: ['r1'],
          current_reacondicionado: ['t1'],
          diagnostic_detail_text: 'Clasificación Cosmética: B · LAN: Operativo',
          scrap_origin_stage: 'Reparación',
          scrap_reason_text: 'Placa quemada irreparable',
        },
        sources,
      ),
    ).toEqual({
      diagnosticoLabel: 'Falla óptica',
      diagnosticoDetalleLabel:
        'Falla óptica · Clasificación Cosmética: B · LAN: Operativo',
      reparacionLabel: 'CAMBIO DE PUERTO USB',
      reacondicionadoLabel: 'RESET DE FÁBRICA',
      scrapReasonLabel: 'Desde Reparación: Placa quemada irreparable',
    });
  });

  it('resuelve detalle de diagnóstico con catálogo y notas', () => {
    expect(
      resolveWorkshopDiagnosticDetailLabel(
        {
          current_diagnostics: ['d1'],
          diagnostic_detail_text: 'Clasificación Cosmética: C · WIFI: No Operativo',
        },
        sources,
      ),
    ).toBe('PUERTO USB · Clasificación Cosmética: C · WIFI: No Operativo');
    expect(resolveWorkshopDiagnosticDetailLabel({}, sources)).toBe('Sin detalle registrado');
  });

  it('resuelve razón SCRAPS y etapa de origen', () => {
    expect(formatWorkshopScrapOriginStage('REPARACIÓN COMPLETADA')).toBe('Reparación');
    expect(
      resolveWorkshopScrapReasonLabel({
        scrap_origin_stage: 'L3',
        scrap_reason_text: 'Sin señal óptica',
      }),
    ).toBe('Desde L3: Sin señal óptica');
    expect(resolveWorkshopScrapReasonLabel({})).toBe('Sin razón registrada');
  });
});
