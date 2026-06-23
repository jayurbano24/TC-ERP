/** Duración transcurrida desde una fecha ISO hasta `now` (locale-neutral). */
export function formatElapsedSince(
  from?: string | Date | null,
  now: Date = new Date()
): string {
  if (!from) return '---';
  const start = typeof from === 'string' ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return '---';

  const totalSec = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const minutes = Math.floor((totalSec % 3_600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Horas transcurridas — útil para umbrales de urgencia visual. */
export function elapsedHoursSince(from?: string | Date | null, now: Date = new Date()): number {
  if (!from) return 0;
  const start = typeof from === 'string' ? new Date(from) : from;
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, (now.getTime() - start.getTime()) / 3_600_000);
}
