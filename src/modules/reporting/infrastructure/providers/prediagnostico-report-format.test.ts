import { describe, expect, it } from 'vitest';
import {
  formatPrediagnosticoAccion,
  formatPrediagnosticoDiagnostico,
} from './prediagnostico-report-format';

const items = [
  { id: 'enciende', name: 'Enciende', kind: 'funcionamiento' as const, sortOrder: 10 },
  { id: 'leds', name: 'LEDs', kind: 'funcionamiento' as const, sortOrder: 20 },
  { id: 'cobertura', name: 'Cambio de cobertura', kind: 'cosmetico' as const, sortOrder: 30 },
  { id: 'resistencia', name: 'Ajuste de IR / resistencia', kind: 'cosmetico' as const, sortOrder: 40 },
];

describe('detalle de prediagnóstico para el reporte', () => {
  it('arma diagnóstico y acción como la planilla', () => {
    expect(
      formatPrediagnosticoDiagnostico({ enciende: 'si', leds: 'na' }, items)
    ).toBe('SI SE ENCIENDE');
    expect(
      formatPrediagnosticoAccion({ cobertura: 'danado', resistencia: 'bien' }, items)
    ).toBe('CAMBIO DE COBERTURA');
  });
});
