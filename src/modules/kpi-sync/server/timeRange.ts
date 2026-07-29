import { KPI_TZ } from './types';

/** Fecha calendario en Guatemala a partir de un instante UTC. */
export function fechaEnGuatemala(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KPI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Fecha calendario Guatemala “hoy”. */
export function hoyEnGuatemala(): string {
  return fechaEnGuatemala(new Date().toISOString());
}

function addCalendarDays(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Lunes de la semana (inicio laboral) para una fecha YYYY-MM-DD. */
function mondayOfWeek(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Dom … 6=Sáb
  const diff = dow === 0 ? -6 : 1 - dow;
  return addCalendarDays(fecha, diff);
}

/**
 * Bounds UTC del día calendario Guatemala.
 * GT = UTC-6 sin DST → día D = [D 06:00Z, (D+1) 05:59:59.999Z].
 */
function guatemalaDayStartUtc(fecha: string): string {
  return `${fecha}T06:00:00.000Z`;
}

function guatemalaDayEndUtc(fecha: string): string {
  const next = addCalendarDays(fecha, 1);
  return `${next}T05:59:59.999Z`;
}

export function resolveTimeRangeBounds(timeRange: string): { startIso: string; endIso: string } {
  const today = hoyEnGuatemala();
  let startFecha = today;
  let endFecha = today;

  if (timeRange === 'Ayer') {
    startFecha = addCalendarDays(today, -1);
    endFecha = startFecha;
  } else if (timeRange === 'Esta Semana') {
    startFecha = mondayOfWeek(today);
    endFecha = today;
  } else if (timeRange === 'Este Mes') {
    startFecha = `${today.slice(0, 8)}01`;
    endFecha = today;
  }

  return {
    startIso: guatemalaDayStartUtc(startFecha),
    endIso: guatemalaDayEndUtc(endFecha),
  };
}

export function fechasEnRango(timeRange: string): string[] {
  const today = hoyEnGuatemala();
  let startFecha = today;
  let endFecha = today;

  if (timeRange === 'Ayer') {
    startFecha = addCalendarDays(today, -1);
    endFecha = startFecha;
  } else if (timeRange === 'Esta Semana') {
    startFecha = mondayOfWeek(today);
    endFecha = today;
  } else if (timeRange === 'Este Mes') {
    startFecha = `${today.slice(0, 8)}01`;
    endFecha = today;
  }

  const fechas: string[] = [];
  let cur = startFecha;
  while (cur <= endFecha) {
    fechas.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return fechas;
}
