import { describe, expect, it } from 'vitest';
import {
  mergeSeriesTreatmentEvidence,
  opsMonthlyCategoryFromEvidence,
} from './ops-monthly-tech-treatment';

describe('ops-monthly-tech treatment — evidencia por series.id', () => {
  it('ready_to_dispatch + reparación agregada → RP (reparado), no RC', () => {
    // El fallo histórico clasificaba ready_to_dispatch como reacondicionado.
    const evidence = mergeSeriesTreatmentEvidence(
      { current_repairs: ['rep-1'], current_reacondicionado: ['rc-1'] },
      { hasAddedRepair: true, passedReacondicionado: true },
    );
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBe('reparado');
  });

  it('RC → reparación agregada → RP', () => {
    const evidence = mergeSeriesTreatmentEvidence(
      {},
      { hasAddedRepair: true, passedReacondicionado: true },
    );
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBe('reparado');
  });

  it('reparación agregada → RC (limpieza) → sigue RP', () => {
    const evidence = mergeSeriesTreatmentEvidence(
      { current_repairs: ['rep-1'], current_reacondicionado: ['clean-1'] },
      { hasAddedRepair: true, passedReacondicionado: true },
    );
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBe('reparado');
  });

  it('solo paso por RC sin reparación agregada → RC', () => {
    const evidence = mergeSeriesTreatmentEvidence(
      { current_reacondicionado: ['rc-1'] },
      { hasAddedRepair: false, passedReacondicionado: true },
    );
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBe('reacondicionado');
  });

  it('visita a Reparación sin reparación agregada + RC → RC', () => {
    const evidence = mergeSeriesTreatmentEvidence(
      { current_repairs: [], current_reacondicionado: [] },
      { hasAddedRepair: false, passedReacondicionado: true },
    );
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBe('reacondicionado');
  });

  it('sin evidencia → no clasifica (ni RP ni RC)', () => {
    const evidence = mergeSeriesTreatmentEvidence({}, undefined);
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBeNull();
  });

  it('exclusión: un mismo equipo no puede ser RP y RC a la vez', () => {
    const evidence = mergeSeriesTreatmentEvidence(
      { current_repairs: ['r1'], current_reacondicionado: ['c1'] },
      { hasAddedRepair: true, passedReacondicionado: true },
    );
    const category = opsMonthlyCategoryFromEvidence(evidence);
    expect(category).toBe('reparado');
    expect(category).not.toBe('reacondicionado');
  });

  it('catálogo local de reparación basta aunque el audit solo tenga RC', () => {
    const evidence = mergeSeriesTreatmentEvidence(
      { current_repairs: ['rep-local'] },
      { hasAddedRepair: false, passedReacondicionado: true },
    );
    expect(opsMonthlyCategoryFromEvidence(evidence)).toBe('reparado');
  });
});
