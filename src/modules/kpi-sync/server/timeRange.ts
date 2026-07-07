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

export function resolveTimeRangeBounds(timeRange: string): { startIso: string; endIso: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (timeRange === 'Ayer') {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (timeRange === 'Esta Semana') {
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (timeRange === 'Este Mes') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function fechasEnRango(timeRange: string): string[] {
  const { startIso, endIso } = resolveTimeRangeBounds(timeRange);
  const fechas: string[] = [];
  const cur = new Date(startIso);
  const end = new Date(endIso);
  cur.setHours(12, 0, 0, 0);
  while (cur <= end) {
    fechas.push(fechaEnGuatemala(cur.toISOString()));
    cur.setDate(cur.getDate() + 1);
  }
  return fechas;
}
