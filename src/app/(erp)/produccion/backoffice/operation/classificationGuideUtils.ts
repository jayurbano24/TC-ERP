import { parseReceptionGuideList } from './parseReceptionGuideList';

export function normalizeGuideKey(guide: string): string {
  return guide.trim().toUpperCase();
}

type ReceptionLike = {
  status?: string;
  guide_number?: string;
  notes?: string;
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
