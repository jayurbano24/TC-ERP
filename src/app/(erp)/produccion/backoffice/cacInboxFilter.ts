import type { BackofficeReception } from './types';
import { getInboxClassificationStats } from './operation/classificationGuideUtils';

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

/**
 * True cuando el lote aún debe aparecer en Bandeja de Entrada (CAC).
 * `allReceptions` alinea el conteo con ClassificationStep (guías ya en
 * RECIBIDO_BACKOFFICE aunque falten en processed_guides).
 */
export function shouldShowInCacInbox(
  r: BackofficeReception,
  allReceptions: BackofficeReception[] = []
): boolean {
  const source = (r as BackofficeReception & { source?: string }).source;
  if (source === 'px' && r.status !== 'PENDIENTE_BACKOFFICE') return false;

  // Eliminadas: nunca en bandeja activa (aunque queden guías 0/N en el lote).
  if (r.status === 'ELIMINADO' || r.status === 'ELIMINADO POR BODEGA') {
    return false;
  }

  const progress = getInboxClassificationStats(r, allReceptions);

  // Todas las cajas ya procesadas → no deben quedar en bandeja.
  if (progress.total > 0 && progress.remaining <= 0) {
    return false;
  }

  const hasPendingGuides = progress.remaining > 0;

  if (EXCLUDED_INBOX_STATUSES.has(r.status)) {
    // Lote multi-guía: no ocultar si aún faltan guías por clasificar (p. ej. 28/37).
    if (hasPendingGuides) return true;
    return false;
  }

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
