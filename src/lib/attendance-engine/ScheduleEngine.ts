import type { DaySchedule, PoliciesLike, ShiftLike } from './types';

/** Parsea "HH:MM" o "HH:MM:SS" a minutos del día. */
export function parsePolicyTimeToMins(timeStr: string | undefined | null, defaultMins: number): number {
  if (!timeStr) return defaultMins;
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return defaultMins;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return defaultMins;
  return h * 60 + m;
}

/** Clave de weekly_schedule: 1=Lun … 7=Dom (como el kiosco actual). */
export function scheduleDayKey(now: Date): string {
  return (now.getDay() || 7).toString();
}

export function getDaySchedule(shift: ShiftLike | null | undefined, now: Date): DaySchedule | null {
  if (!shift?.weekly_schedule) return null;
  const day = shift.weekly_schedule[scheduleDayKey(now)];
  if (!day || !day.entrada) return null;
  return day;
}

export function isDiaExtra(shift: ShiftLike | null | undefined, now: Date): boolean {
  return !getDaySchedule(shift, now);
}

export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function timeWindow(
  shift: ShiftLike | null | undefined,
  policies: PoliciesLike | null | undefined,
  kind: 'desayuno' | 'almuerzo',
) {
  if (kind === 'desayuno') {
    const start = shift?.ventana_desayuno_inicio
      ? parsePolicyTimeToMins(shift.ventana_desayuno_inicio, 9 * 60)
      : parsePolicyTimeToMins(policies?.horario_desayuno_inicio, 9 * 60);
    const end = shift?.ventana_desayuno_fin
      ? parsePolicyTimeToMins(shift.ventana_desayuno_fin, 10 * 60 + 50)
      : parsePolicyTimeToMins(policies?.horario_desayuno_fin, 10 * 60 + 50);
    return { start, end };
  }
  const start = shift?.ventana_almuerzo_inicio
    ? parsePolicyTimeToMins(shift.ventana_almuerzo_inicio, 12 * 60)
    : parsePolicyTimeToMins(policies?.horario_almuerzo_inicio, 12 * 60);
  const end = shift?.ventana_almuerzo_fin
    ? parsePolicyTimeToMins(shift.ventana_almuerzo_fin, 15 * 60 + 30)
    : parsePolicyTimeToMins(policies?.horario_almuerzo_fin, 15 * 60 + 30);
  return { start, end };
}

export function isInWindow(now: Date, start: number, end: number): boolean {
  const cur = minutesOfDay(now);
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;
}

/** Ventana de permisos especiales (marcaje especial) según políticas. */
export function isWithinPermissionWindow(
  policies: PoliciesLike | null | undefined,
  now: Date = new Date(),
): boolean {
  const currentMins = minutesOfDay(now);
  const start = parsePolicyTimeToMins(policies?.horario_permiso_inicio, 0);
  const end = parsePolicyTimeToMins(policies?.horario_permiso_fin, 23 * 60 + 59);
  if (start <= end) return currentMins >= start && currentMins <= end;
  return currentMins >= start || currentMins <= end;
}

export function localDateTimeFromHm(now: Date, hm: string): Date {
  const [h, m, s] = (hm + ':00').split(':').map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m || 0, s || 0);
}

/** Cerca de salida: desde (salida - gracia) en adelante. */
export function isNearOrPastShiftEnd(
  daySchedule: DaySchedule,
  now: Date,
  graciaSalidaMin: number,
): boolean {
  if (!daySchedule.salida) return false;
  const scheduled = localDateTimeFromHm(now, daySchedule.salida).getTime();
  const earliest = scheduled - graciaSalidaMin * 60 * 1000;
  return now.getTime() >= earliest;
}
