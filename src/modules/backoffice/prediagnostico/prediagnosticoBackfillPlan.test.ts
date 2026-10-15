import { describe, expect, it } from 'vitest';
import {
  buildSyntheticPrediagnostico,
  expectedPrediagTimingCounts,
  expectedShellCounts,
  repairVerdictForSlot,
  shellClassForSlot,
  SHELL_CLASS_WEIGHTS,
} from './prediagnosticoBackfillPlan';

const ingressAt = new Date('2025-06-01T10:00:00-06:00');
const asOf = new Date('2025-08-01T18:00:00-06:00');

describe('prediagnosticoBackfillPlan', () => {
  it('pesos de carcasa suman ~100%', () => {
    const sum = SHELL_CLASS_WEIGHTS.reduce((a, r) => a + r.weight, 0);
    expect(sum).toBe(995);
  });

  it('reparte carcasas cerca del mix 11.5/45/25/18 en muestra grande', () => {
    const n = 10_000;
    const counts = expectedShellCounts(n);
    expect(counts.A / n).toBeCloseTo(0.115, 1);
    expect(counts.B / n).toBeCloseTo(0.45, 1);
    expect(counts.C / n).toBeCloseTo(0.25, 1);
    expect(counts.D / n).toBeCloseTo(0.18, 1);
  });

  it('dictamen reparación ~65/35', () => {
    let reac = 0;
    for (let i = 0; i < 1000; i += 1) {
      if (repairVerdictForSlot(i) === 'reacondicionado') reac += 1;
    }
    expect(reac).toBe(650);
  });

  it('fechas: ~80% entre 3-5 días post-ingreso y ~20% después de 5 días', () => {
    const n = 5000;
    const counts = expectedPrediagTimingCounts(n, ingressAt, asOf);
    expect(counts.within_3_5_days / n).toBeCloseTo(0.8, 1);
    expect(counts.after_5_days / n).toBeCloseTo(0.2, 1);
  });

  it('reparado marca solo ítems del catálogo del modelo', () => {
    const catalogItems = [
      { id: 'c1', name: 'Puertos Ethernet', kind: 'cosmetico' as const },
      { id: 'c2', name: 'Antena rota', kind: 'cosmetico' as const },
      { id: 'f1', name: 'Botón reset', kind: 'funcionamiento' as const },
    ];
    const payload = buildSyntheticPrediagnostico({
      serialOrOrderKey: 'SN-TEST-001',
      ingressAt,
      asOf,
      isScrap: false,
      catalogItems,
    });
    if (payload.verdict === 'reparado') {
      expect(Object.keys(payload.cosmetics).every((id) => catalogItems.some((c) => c.id === id))).toBe(true);
      const damaged = Object.entries(payload.cosmetics).filter(([, v]) => v === 'danado');
      expect(damaged.length).toBeGreaterThan(0);
    }
  });

  it('scrap fuerza irreparable clase D y notas', () => {
    const payload = buildSyntheticPrediagnostico({
      serialOrOrderKey: 'SN-SCRAP',
      ingressAt,
      asOf,
      isScrap: true,
      scrapReason: 'Placa quemada',
      catalogItems: [{ id: 'c1', name: 'Etiqueta', kind: 'cosmetico' }],
    });
    expect(payload.verdict).toBe('irreparable');
    expect(payload.shellClass).toBe('D');
    expect(payload.notes).toContain('Placa quemada');
  });

  it('shellClassForSlot es estable', () => {
    expect(shellClassForSlot(0)).toBe(shellClassForSlot(1000));
  });
});
