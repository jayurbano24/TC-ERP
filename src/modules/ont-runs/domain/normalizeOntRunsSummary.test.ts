import { describe, expect, it } from 'vitest';
import { normalizeOntRunsVerdictSummary } from './normalizeOntRunsSummary';

describe('normalizeOntRunsVerdictSummary', () => {
  it('convierte undefined en 0 para KPIs', () => {
    const s = normalizeOntRunsVerdictSummary(
      { pass: undefined, fail: undefined, total: undefined, daily: [{ date: '2026-01-01', pass: undefined, fail: 2 }] },
      12
    );
    expect(s.total).toBe(12);
    expect(s.pass).toBe(0);
    expect(s.fail).toBe(0);
    expect(s.todayCertified).toBe(0);
    expect(s.daily[0]?.certified).toBe(2);
  });
});
