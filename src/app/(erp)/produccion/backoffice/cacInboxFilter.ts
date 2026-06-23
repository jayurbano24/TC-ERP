import type { BackofficeReception } from './types';

const EXCLUDED_INBOX_STATUSES = new Set([
  'RECIBIDO_BACKOFFICE',
  'PROCESADO',
  'CLASIFICADA',
  'DEVUELTO_A_AGENCIA',
  'BODEGA_DEVOLUCION',
  'FINALIZADO',
  'ELIMINADO',
  'ELIMINADO POR BODEGA',
]);

/** Devolución de caja única ya no debe aparecer en Bandeja de Entrada (CAC). */
export function shouldShowInCacInbox(r: BackofficeReception): boolean {
  const source = (r as BackofficeReception & { source?: string }).source;
  if (source === 'px' && r.status !== 'PENDIENTE_BACKOFFICE') return false;
  if (EXCLUDED_INBOX_STATUSES.has(r.status)) return false;

  const units = r.received_units ?? 1;
  const isSingleBox = units <= 1;
  if (!isSingleBox) return true;

  const notes = r.notes || '';
  if (/movido a bodega:\s*devoluci/i.test(notes)) return false;
  if (/BOD-DEV\s*\|/i.test(notes) && /Motivo Devolución:/i.test(notes)) return false;

  const hasDevolucionGuide = (r.reception_guides || []).some(
    (g) => (g.category || '').toLowerCase() === 'devolucion'
  );
  if (hasDevolucionGuide) return false;

  return true;
}
