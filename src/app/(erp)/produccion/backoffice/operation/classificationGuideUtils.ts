import { parseReceptionGuideList } from './parseReceptionGuideList';

export function normalizeGuideKey(guide: string): string {
  return guide.trim().toUpperCase();
}

type ReceptionLike = {
  status?: string;
  guide_number?: string;
  notes?: string;
  processed_guides?: string[];
};

export function isGuideProcessed(
  guia: string,
  processedGuides: string[],
  allReceptions: ReceptionLike[] = []
): boolean {
  const key = normalizeGuideKey(guia);
  if (processedGuides.some((g) => normalizeGuideKey(g) === key)) return true;

  return allReceptions.some(
    (r) =>
      r.status === 'RECIBIDO_BACKOFFICE' &&
      (normalizeGuideKey(r.guide_number || '') === key ||
        (r.notes || '').toUpperCase().includes(key))
  );
}

export function getPendingGuides(
  activeReception: { notes?: string; guide_number?: string },
  processedGuides: string[],
  allReceptions: ReceptionLike[] = []
): string[] {
  return parseReceptionGuideList(activeReception).filter(
    (g) => !isGuideProcessed(g, processedGuides, allReceptions)
  );
}

export function countClassificationProgress(
  activeReception: { notes?: string; guide_number?: string },
  processedGuides: string[],
  allReceptions: ReceptionLike[] = []
): { pending: number; total: number } {
  const total = parseReceptionGuideList(activeReception).length;
  const pending = getPendingGuides(activeReception, processedGuides, allReceptions).length;
  return { pending, total };
}

/** Progreso de clasificación para tarjetas de bandeja CAC (misma lógica que ClassificationStep). */
export function getInboxClassificationStats(
  rec: {
    notes?: string;
    guide_number?: string;
    received_units?: number;
    processed_guides?: string[];
  },
  allReceptions: ReceptionLike[] = []
): { classified: number; total: number; remaining: number } {
  const guideList = parseReceptionGuideList(rec);
  const units = rec.received_units ?? 1;
  let total = guideList.length > 0 ? guideList.length : units;
  if (guideList.length <= 1 && units > 1) {
    total = units;
  }

  if (guideList.length > 0) {
    const remaining = getPendingGuides(rec, rec.processed_guides || [], allReceptions).length;
    const classified = Math.max(0, total - remaining);
    return { classified, total, remaining };
  }

  const classified = new Set(
    (rec.processed_guides || []).map(normalizeGuideKey).filter(Boolean)
  ).size;
  const remaining = Math.max(0, total - classified);

  return { classified, total, remaining };
}

/**
 * Documento SAP no puede ser un No. de guía del lote ni una guía pendiente en Backoffice.
 * Devuelve mensaje de error o null si es válido.
 */
export function getSapDocumentGuideConflict(
  sapDocument: string,
  activeReception: { notes?: string; guide_number?: string; processed_guides?: string[] } | null,
  processedGuides: string[] = [],
  allReceptions: ReceptionLike[] = [],
  scannedGuides: string[] = []
): string | null {
  const sap = normalizeGuideKey(sapDocument);
  if (!sap) return null;

  if (scannedGuides.some((g) => normalizeGuideKey(g) === sap)) {
    return `«${sapDocument.trim()}» es la guía en proceso. Use el Documento SAP, no el No. de guía.`;
  }

  if (activeReception) {
    const pending = getPendingGuides(activeReception, processedGuides, allReceptions);
    if (pending.some((g) => normalizeGuideKey(g) === sap)) {
      return `«${sapDocument.trim()}» es una guía pendiente de clasificar en Backoffice. No puede usarse como Documento SAP.`;
    }
    const lotGuides = parseReceptionGuideList(activeReception);
    if (lotGuides.some((g) => normalizeGuideKey(g) === sap)) {
      return `«${sapDocument.trim()}» es un No. de guía del lote. El Documento SAP debe ser distinto.`;
    }
  }

  for (const rec of allReceptions) {
    const recPending = getPendingGuides(rec, rec.processed_guides || [], allReceptions);
    if (recPending.some((g) => normalizeGuideKey(g) === sap)) {
      return `«${sapDocument.trim()}» es una guía pendiente en Backoffice. No puede usarse como Documento SAP.`;
    }
  }

  return null;
}
