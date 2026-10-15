import { describe, expect, it } from 'vitest';
import {
  filterHistoryEntriesExcludingBackfill,
  isOperatorPrediagnosticoPending,
  isPrediagnosticoBackfillNotes,
} from './prediagnosticoBackfillMarkers';

describe('prediagnosticoBackfillMarkers', () => {
  it('detecta notas backfill', () => {
    expect(isPrediagnosticoBackfillNotes('[BACKFILL] test')).toBe(true);
    expect(isPrediagnosticoBackfillNotes('manual')).toBe(false);
  });

  it('pendiente operador respeta T0', () => {
    const cutoff = new Date('2026-03-14T00:00:00-06:00');
    expect(
      isOperatorPrediagnosticoPending({ prediagnostico: null, classifiedAtIso: '2026-03-13T12:00:00-06:00' }, cutoff)
    ).toBe(false);
    expect(
      isOperatorPrediagnosticoPending({ prediagnostico: null, classifiedAtIso: '2026-03-15T12:00:00-06:00' }, cutoff)
    ).toBe(true);
    expect(
      isOperatorPrediagnosticoPending({ prediagnostico: { notes: 'x' }, classifiedAtIso: '2026-03-15T12:00:00-06:00' }, cutoff)
    ).toBe(false);
  });

  it('excluye backfill del export', () => {
    const rows = filterHistoryEntriesExcludingBackfill([
      { prediagnostico: { notes: '[BACKFILL] x' } },
      { prediagnostico: { notes: 'Operador' } },
      { prediagnostico: null },
    ]);
    expect(rows).toHaveLength(2);
  });
});
