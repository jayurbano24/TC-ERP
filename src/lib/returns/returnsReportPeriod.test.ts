import { describe, expect, it } from 'vitest';
import {
  buildReturnsReportPeriodOptions,
  resolveReturnsReportBounds,
  type ReturnsReportPeriod,
} from './returnsReportPeriod';

describe('returnsReportPeriod', () => {
  it('todo no aplica límites', () => {
    const b = resolveReturnsReportBounds('todo');
    expect(b.startIso).toBeNull();
    expect(b.endIso).toBeNull();
    expect(b.label).toBe('Todo el histórico');
  });

  it('esta semana inicia en lunes GT', () => {
    const b = resolveReturnsReportBounds('week_current');
    expect(b.startIso).toMatch(/T06:00:00\.000Z$/);
    expect(b.endIso).toMatch(/T05:59:59\.999Z$/);
    expect(b.label).toBe('Esta semana');
  });

  it('mes pasado tiene inicio y fin del mes calendario', () => {
    const b = resolveReturnsReportBounds('month_previous');
    expect(b.startIso).toBeTruthy();
    expect(b.endIso).toBeTruthy();
    expect(b.label).toBe('Mes pasado');
  });

  it('month:YYYY-MM resuelve mes específico', () => {
    const b = resolveReturnsReportBounds('month:2026-01' as ReturnsReportPeriod);
    expect(b.startIso).toBe('2026-01-01T06:00:00.000Z');
    expect(b.endIso).toBe('2026-02-01T05:59:59.999Z');
    expect(b.label).toContain('2026');
  });

  it('opciones incluyen semanas, meses y histórico', () => {
    const opts = buildReturnsReportPeriodOptions();
    const values = opts.map((o) => o.value);
    expect(values).toContain('todo');
    expect(values).toContain('week_current');
    expect(values).toContain('week_previous');
    expect(values).toContain('month_current');
    expect(values).toContain('month_previous');
    expect(values.some((v) => String(v).startsWith('month:'))).toBe(true);
  });
});
