import { describe, expect, it } from 'vitest';
import { calculatePunchMetrics } from './AttendanceCalculator';
import { evaluatePunch } from './evaluatePunch';
import { deriveStateFromLogs } from './StateEngine';
import type { PoliciesLike, ShiftLike, TimeLogLike } from './types';

const policies: PoliciesLike = {
  horario_desayuno_inicio: '09:00',
  horario_desayuno_fin: '10:50',
  horario_almuerzo_inicio: '12:00',
  horario_almuerzo_fin: '15:30',
  tolerancia_ingreso_min: 10,
  tolerancia_salida_min: 5,
  gracia_recesos_min: 5,
  duracion_desayuno_min: 15,
  duracion_almuerzo_min: 60,
  regla_solicitar_justificacion_receso: true,
  regla_doble_marcaje: false,
  permitir_marcaje_especial: true,
  regla_calcular_horas_extra: false,
};

const shiftWeekday: ShiftLike = {
  weekly_schedule: {
    '6': { entrada: '08:00', salida: '18:00' }, // sábado si getDay=6 — tests pasan `now` fijo
    '1': { entrada: '08:00', salida: '18:00' },
    '2': { entrada: '08:00', salida: '18:00' },
    '3': { entrada: '08:00', salida: '18:00' },
    '4': { entrada: '08:00', salida: '18:00' },
    '5': { entrada: '08:00', salida: '18:00' },
    '7': { entrada: '08:00', salida: '18:00' },
  },
};

function at(isoLocal: string): Date {
  // isoLocal: '2026-07-18T07:55:00'
  return new Date(isoLocal);
}

describe('deriveStateFromLogs', () => {
  it('sin logs → FUERA', () => {
    expect(deriveStateFromLogs([]).currentState).toBe('FUERA');
  });

  it('INGRESO → LABORANDO', () => {
    const logs: TimeLogLike[] = [
      { timestamp: '2026-07-18T08:00:00', evento_detectado: 'INGRESO' },
    ];
    expect(deriveStateFromLogs(logs).currentState).toBe('LABORANDO');
  });
});

describe('evaluatePunch', () => {
  it('07:55 FUERA → INGRESO NORMAL sin justificación', () => {
    const now = at('2026-07-18T07:55:00');
    const r = evaluatePunch({ shift: shiftWeekday, logs: [], policies, now });
    expect(r.evento).toBe('INGRESO');
    expect(r.needsIntent).toBe(false);
    expect(r.requiereJustificacion).toBe(false);
    expect(r.metrics.estado_marcacion).toBe('NORMAL');
  });

  it('08:17 FUERA → INGRESO TARDÍO con justificación', () => {
    const now = at('2026-07-18T08:17:00');
    const r = evaluatePunch({ shift: shiftWeekday, logs: [], policies, now });
    expect(r.evento).toBe('INGRESO');
    expect(r.requiereJustificacion).toBe(true);
    expect(r.justificacionTipo).toBe('LLEGADA_TARDE');
    expect(r.metrics.estado_marcacion).toBe('TARDE');
  });

  it('día extra sin schedule → INGRESO con justificación especial', () => {
    const now = at('2026-07-18T16:27:00');
    const r = evaluatePunch({ shift: { weekly_schedule: {} }, logs: [], policies, now });
    expect(r.evento).toBe('INGRESO');
    expect(r.metrics.esDiaExtra).toBe(true);
    expect(r.requiereJustificacion).toBe(true);
    expect(r.justificacionTipo).toBe('MARCAJE_ESPECIAL');
  });

  it('LABORANDO 11:15 fuera de ventanas → pide intención (no segundo INGRESO)', () => {
    const now = at('2026-07-18T11:15:00');
    const logs: TimeLogLike[] = [
      { timestamp: '2026-07-18T08:00:00', evento_detectado: 'INGRESO' },
    ];
    const r = evaluatePunch({ shift: shiftWeekday, logs, policies, now });
    expect(r.needsIntent).toBe(true);
    expect(r.evento).toBeNull();
    expect(r.intentOptions.some((o) => o.evento === 'DESAYUNO_INICIO')).toBe(true);
    expect(r.intentOptions.some((o) => o.evento === 'INGRESO')).toBe(false);
  });

  it('LABORANDO en ventana desayuno → DESAYUNO_INICIO auto', () => {
    const now = at('2026-07-18T09:35:00');
    const logs: TimeLogLike[] = [
      { timestamp: '2026-07-18T08:00:00', evento_detectado: 'INGRESO' },
    ];
    const r = evaluatePunch({ shift: shiftWeekday, logs, policies, now });
    expect(r.evento).toBe('DESAYUNO_INICIO');
    expect(r.needsIntent).toBe(false);
  });

  it('DESAYUNO → DESAYUNO_FIN', () => {
    const now = at('2026-07-18T09:52:00');
    const logs: TimeLogLike[] = [
      { timestamp: '2026-07-18T08:00:00', evento_detectado: 'INGRESO' },
      { timestamp: '2026-07-18T09:35:00', evento_detectado: 'DESAYUNO_INICIO' },
    ];
    const r = evaluatePunch({ shift: shiftWeekday, logs, policies, now });
    expect(r.evento).toBe('DESAYUNO_FIN');
  });
});

describe('AttendanceCalculator exceso', () => {
  it('desayuno 17 min (15+5 gracia) → OK', () => {
    const now = at('2026-07-18T09:52:00');
    const logs: TimeLogLike[] = [
      { timestamp: '2026-07-18T09:35:00', evento_detectado: 'DESAYUNO_INICIO' },
    ];
    const m = calculatePunchMetrics({
      evento: 'DESAYUNO_FIN',
      shift: shiftWeekday,
      logs,
      policies,
      now,
    });
    expect(m.estado_marcacion).toBe('NORMAL');
    expect(m.exceso_desayuno_segundos).toBe(0);
  });

  it('desayuno 22 min → exceso', () => {
    const now = at('2026-07-18T09:57:00');
    const logs: TimeLogLike[] = [
      { timestamp: '2026-07-18T09:35:00', evento_detectado: 'DESAYUNO_INICIO' },
    ];
    const m = calculatePunchMetrics({
      evento: 'DESAYUNO_FIN',
      shift: shiftWeekday,
      logs,
      policies,
      now,
    });
    expect(m.estado_marcacion).toBe('EXCESO_DESAYUNO');
    expect(m.exceso_desayuno_segundos).toBeGreaterThan(0);
  });

  it('almuerzo 65 min → OK; 100 min → exceso', () => {
    const ok = calculatePunchMetrics({
      evento: 'ALMUERZO_FIN',
      shift: shiftWeekday,
      logs: [{ timestamp: '2026-07-18T13:20:00', evento_detectado: 'ALMUERZO_INICIO' }],
      policies,
      now: at('2026-07-18T14:25:00'),
    });
    expect(ok.estado_marcacion).toBe('NORMAL');

    const bad = calculatePunchMetrics({
      evento: 'ALMUERZO_FIN',
      shift: shiftWeekday,
      logs: [{ timestamp: '2026-07-18T13:20:00', evento_detectado: 'ALMUERZO_INICIO' }],
      policies,
      now: at('2026-07-18T15:00:00'),
    });
    expect(bad.estado_marcacion).toBe('EXCESO_ALMUERZO');
  });
});
