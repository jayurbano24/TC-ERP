const TZ = 'America/Guatemala';

export type ReturnsReportPeriod =
  | 'todo'
  | 'week_current'
  | 'week_previous'
  | 'month_current'
  | 'month_previous'
  | `month:${string}`;

export type ReturnsReportPeriodOption = {
  value: ReturnsReportPeriod;
  label: string;
};

function todayGt(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(fecha: string, days: number): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function mondayOfWeek(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(fecha, diff);
}

/** GT UTC-6: día D = [D 06:00Z, (D+1) 05:59:59.999Z]. */
function guatemalaDayStartUtc(fecha: string): string {
  return `${fecha}T06:00:00.000Z`;
}

function guatemalaDayEndUtc(fecha: string): string {
  return `${addDays(fecha, 1)}T05:59:59.999Z`;
}

function firstDayOfMonth(yearMonth: string): string {
  return `${yearMonth}-01`;
}

function lastDayOfMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function formatMonthLabel(yearMonth: string): string {
  const label = new Intl.DateTimeFormat('es-GT', {
    timeZone: TZ,
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${yearMonth}-15T12:00:00.000Z`));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function normalizeReturnsReportPeriod(period: unknown): ReturnsReportPeriod {
  if (typeof period === 'string' && period.length > 0) return period as ReturnsReportPeriod;
  return 'todo';
}

export function resolveReturnsReportBounds(period: ReturnsReportPeriod | unknown): {
  startIso: string | null;
  endIso: string | null;
  label: string;
} {
  const resolved = normalizeReturnsReportPeriod(period);
  const today = todayGt();
  const yearMonth = today.slice(0, 7);

  if (resolved === 'todo') {
    return { startIso: null, endIso: null, label: 'Todo el histórico' };
  }

  if (resolved === 'week_current') {
    const start = mondayOfWeek(today);
    return {
      startIso: guatemalaDayStartUtc(start),
      endIso: guatemalaDayEndUtc(today),
      label: 'Esta semana',
    };
  }

  if (resolved === 'week_previous') {
    const thisMon = mondayOfWeek(today);
    const start = addDays(thisMon, -7);
    const end = addDays(thisMon, -1);
    return {
      startIso: guatemalaDayStartUtc(start),
      endIso: guatemalaDayEndUtc(end),
      label: 'Semana pasada',
    };
  }

  if (resolved === 'month_current') {
    const start = firstDayOfMonth(yearMonth);
    return {
      startIso: guatemalaDayStartUtc(start),
      endIso: guatemalaDayEndUtc(today),
      label: 'Este mes',
    };
  }

  if (resolved === 'month_previous') {
    const [y, m] = yearMonth.split('-').map(Number);
    const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    const start = firstDayOfMonth(prevMonth);
    const end = lastDayOfMonth(prevMonth);
    return {
      startIso: guatemalaDayStartUtc(start),
      endIso: guatemalaDayEndUtc(end),
      label: 'Mes pasado',
    };
  }

  if (resolved.startsWith('month:')) {
    const ym = resolved.slice(6);
    const start = firstDayOfMonth(ym);
    const end = lastDayOfMonth(ym);
    return {
      startIso: guatemalaDayStartUtc(start),
      endIso: guatemalaDayEndUtc(end),
      label: formatMonthLabel(ym),
    };
  }

  return { startIso: null, endIso: null, label: 'Todo el histórico' };
}

/** Opciones para el selector: semanas, mes actual/anterior + últimos 10 meses. */
export function buildReturnsReportPeriodOptions(): ReturnsReportPeriodOption[] {
  const options: ReturnsReportPeriodOption[] = [
    { value: 'todo', label: 'Todo el histórico' },
    { value: 'week_current', label: 'Esta semana' },
    { value: 'week_previous', label: 'Semana pasada' },
    { value: 'month_current', label: 'Este mes' },
    { value: 'month_previous', label: 'Mes pasado' },
  ];

  const today = todayGt();
  const [y, m] = today.slice(0, 7).split('-').map(Number);
  for (let i = 2; i < 12; i++) {
    let mm = m - i;
    let yy = y;
    while (mm <= 0) {
      mm += 12;
      yy -= 1;
    }
    const ym = `${yy}-${String(mm).padStart(2, '0')}`;
    options.push({ value: `month:${ym}`, label: formatMonthLabel(ym) });
  }

  return options;
}
