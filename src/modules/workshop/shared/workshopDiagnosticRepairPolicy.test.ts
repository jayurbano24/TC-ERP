import { describe, expect, it } from 'vitest';
import {
  diagnosticAppliesToTechnology,
  filterDiagnosticsForTechnology,
  intersectAllowedRepairIdsAcrossEquipments,
  resolveAllowedRepairIdsForDiagnostics,
  validateRepairsAgainstDiagnostics,
} from './workshopDiagnosticRepairPolicy';

const catalog = [
  {
    id: 'd-hdmi',
    nombre: 'PUERTO HDMI DAÑADO',
    reparacionesIds: ['r-hdmi', 'r-cos'],
  },
  {
    id: 'd-fuente',
    nombre: 'NO ENCIENDE',
    reparacionesIds: ['r-fuente'],
  },
];

const repairs = [
  { id: 'r-hdmi', nombre: 'Cambio de puerto HDMI' },
  { id: 'r-fuente', nombre: 'CAMBIO DE FUENTE' },
  { id: 'r-cos', nombre: 'Cambio de cosmética' },
];

describe('workshopDiagnosticRepairPolicy', () => {
  it('permite reparaciones mapeadas al diagnóstico', () => {
    const allowed = resolveAllowedRepairIdsForDiagnostics(['d-hdmi'], catalog);
    expect(allowed.has('r-hdmi')).toBe(true);
    expect(allowed.has('r-fuente')).toBe(false);

    expect(
      validateRepairsAgainstDiagnostics(['d-hdmi'], ['r-hdmi'], catalog, repairs).ok,
    ).toBe(true);
  });

  it('bloquea reparación incompatible con el diagnóstico', () => {
    const result = validateRepairsAgainstDiagnostics(
      ['d-hdmi'],
      ['r-fuente'],
      catalog,
      repairs,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/CAMBIO DE FUENTE/i);
      expect(result.message).toMatch(/PUERTO HDMI/i);
    }
  });

  it('exige diagnóstico previo', () => {
    const result = validateRepairsAgainstDiagnostics([], ['r-hdmi'], catalog, repairs);
    expect(result.ok).toBe(false);
  });

  it('filtra diagnósticos por tecnología del equipo', () => {
    const withTech = [
      { id: 'd-emta', nombre: 'FALLA EMTA', technologyIds: ['tech-emta'] },
      { id: 'd-all', nombre: 'FALLA GENERAL', technologyIds: [] },
    ];
    expect(diagnosticAppliesToTechnology(withTech[0], 'tech-emta')).toBe(true);
    expect(diagnosticAppliesToTechnology(withTech[0], 'tech-gpon')).toBe(false);
    expect(diagnosticAppliesToTechnology(withTech[1], 'tech-gpon')).toBe(true);

    const filtered = filterDiagnosticsForTechnology(withTech, 'tech-emta');
    expect(filtered.map((d) => d.id)).toEqual(['d-emta', 'd-all']);
  });

  it('intersecta reparaciones permitidas en selección masiva', () => {
    const intersection = intersectAllowedRepairIdsAcrossEquipments(
      [['d-hdmi'], ['d-fuente']],
      catalog,
    );
    expect(intersection.size).toBe(0);

    const shared = intersectAllowedRepairIdsAcrossEquipments(
      [['d-hdmi'], ['d-hdmi']],
      catalog,
    );
    expect(shared.has('r-hdmi')).toBe(true);
  });
});
