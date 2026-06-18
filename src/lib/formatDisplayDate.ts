/** Fechas con locale/zona fijos para evitar hydration mismatch SSR ↔ cliente. */

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  timeZone: 'America/Guatemala',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTS,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
};

export function formatDisplayDate(value?: string | Date | null): string {
  if (!value) return '---';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '---';
  return d.toLocaleDateString('es-GT', DATE_OPTS);
}

export function formatDisplayDateTime(value?: string | Date | null): string {
  if (!value) return '---';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '---';
  return d.toLocaleString('es-GT', DATETIME_OPTS);
}
