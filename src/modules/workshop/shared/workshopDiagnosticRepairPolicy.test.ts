import { describe, expect, it } from 'vitest';
import {
  diagnosticAppliesToTechnology,
  filterDiagnosticsForTechnology,
  intersectAllowedRepairIdsAcrossEquipments,
  resolveAllowedOutcomesForDiagnostics,
  resolveAllowedRepairIdsForDiagnostics,
  validateDiagnosticOutcome,
  validateRepairsAgainstDiagnostics,
  type WorkshopDiagnosticCatalogEntry,
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

  it('bloquea avance a QC si el diagnóstico no tiene reparaciones en catálogo (availableRepairs vacío)', () => {
    const orphanDiag = [
      { id: 'd-orphan', nombre: 'FALLA SIN MAPEO', reparacionesIds: [] as string[] },
    ];
    const allowed = resolveAllowedRepairIdsForDiagnostics(['d-orphan'], orphanDiag);
    expect(allowed.size).toBe(0);

    const result = validateRepairsAgainstDiagnostics(
      ['d-orphan'],
      ['r-hdmi'],
      orphanDiag,
      repairs,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/No hay reparaciones configuradas/i);
      expect(result.message).toMatch(/FALLA SIN MAPEO/i);
    }
  });

  it('sin reparación seleccionada el gate de política falla (UI: repairOutcomeBlocked)', () => {
    const result = validateRepairsAgainstDiagnostics(['d-hdmi'], [], catalog, repairs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Seleccione al menos una reparación/i);
    }
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

  it('solo diagnósticos de reacondicionado habilitan ese destino', () => {
    const withOutcomes: WorkshopDiagnosticCatalogEntry[] = [
      {
        id: 'd-frisa',
        nombre: 'SE FRIZA',
        allowedOutcomes: ['reacondicionado'],
      },
      {
        id: 'd-hdmi',
        nombre: 'PUERTO HDMI DAÑADO',
        allowedOutcomes: ['reparacion', 'l3'],
      },
      {
        id: 'd-sin-config',
        nombre: 'FALLA SIN DESTINOS',
      },
    ];

    const onlyFrisa = resolveAllowedOutcomesForDiagnostics(['d-frisa'], withOutcomes);
    expect(onlyFrisa.has('reacondicionado')).toBe(true);
    expect(onlyFrisa.has('reparacion')).toBe(false);
    expect(onlyFrisa.has('l3')).toBe(false);

    // Mezcla con falla de reparación: prevalecen L1/L2 + L3 (no Reacondicionado, no vacío)
    const mixed = resolveAllowedOutcomesForDiagnostics(['d-frisa', 'd-hdmi'], withOutcomes);
    expect(mixed.has('reacondicionado')).toBe(false);
    expect(mixed.has('reparacion')).toBe(true);
    expect(mixed.has('l3')).toBe(true);
    expect(validateDiagnosticOutcome(['d-frisa', 'd-hdmi'], 'reparacion', withOutcomes).ok).toBe(
      true,
    );
    expect(
      validateDiagnosticOutcome(['d-frisa', 'd-hdmi'], 'reacondicionado', withOutcomes).ok,
    ).toBe(false);

    expect(
      validateDiagnosticOutcome(['d-hdmi'], 'reacondicionado', withOutcomes).ok,
    ).toBe(false);
    expect(validateDiagnosticOutcome(['d-frisa'], 'reacondicionado', withOutcomes).ok).toBe(
      true,
    );
    expect(validateDiagnosticOutcome(['d-frisa'], 'reparacion', withOutcomes).ok).toBe(false);

    // Sin allowedOutcomes → no habilita Reacondicionado
    const sinConfig = resolveAllowedOutcomesForDiagnostics(['d-sin-config'], withOutcomes);
    expect(sinConfig.has('reacondicionado')).toBe(false);
    expect(sinConfig.has('reparacion')).toBe(true);
    expect(sinConfig.has('l3')).toBe(true);

    // Acepta snake_case por si el payload llega sin mapear
    const snake = resolveAllowedOutcomesForDiagnostics(
      ['d-frizado'],
      [
        {
          id: 'd-frizado',
          nombre: 'FRIZADO',
          allowed_outcomes: ['reacondicionado'],
        } as never,
      ],
    );
    expect(snake.has('reacondicionado')).toBe(true);
    expect(snake.has('reparacion')).toBe(false);
  });
});
