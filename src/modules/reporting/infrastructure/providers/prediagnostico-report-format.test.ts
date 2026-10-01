import { describe, expect, it } from 'vitest';
import {
  formatPrediagnosticoAccion,
  formatPrediagnosticoDiagnostico,
} from './prediagnostico-report-format';

const items = [
  { id: 'enciende', name: 'Enciende', kind: 'funcionamiento' as const },
  { id: 'leds', name: 'LEDs', kind: 'funcionamiento' as const },
  { id: 'cobertura', name: 'Cambio de cobertura', kind: 'cosmetico' as const },
  { id: 'resistencia', name: 'Ajuste de IR / resistencia', kind: 'cosmetico' as const },
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
