import type { BackofficeTab } from '../types';

export type SubBodegaRow = {
  id: string;
  reception: {
    id: string;
    notes?: string;
    created_at: string;
    received_by?: string;
    processed_guides?: string[];
    guide_number: string;
    reception_guides?: Array<{
      guide_number: string;
      category?: string;
      classified_at?: string;
      classified_by?: string;
    }>;
    status?: string;
  };
  guide: string;
  processDate: string;
  processUser: string;
};

function guideCategoryFlags(
  reception: SubBodegaRow['reception'],
  guide: string
): { isAccesorio: boolean; isTelefono: boolean } {
  const guideRg = (reception.reception_guides || []).find((rg) => rg.guide_number === guide);
  const rgCategory = (guideRg?.category || '').toLowerCase();

  if (rgCategory) {
    return {
      isAccesorio: rgCategory === 'accesorio',
      isTelefono: rgCategory === 'telefono',
    };
  }

  const notes = (reception.notes || '').toLowerCase();
  const gEscaped = guide.replace(/[-]/g, '\\-');
  const guideBlockRegex = new RegExp(`\\[Guía.*?(?:${gEscaped}).*?\\][\\s\\S]*?(?=\\[Guía|---|$)`, 'i');
  const guideBlockMatch = notes.match(guideBlockRegex);

  if (guideBlockMatch) {
    const block = guideBlockMatch[0].toLowerCase();
    return {
      isAccesorio: block.includes('backoffice_category: accesorio'),
      isTelefono:
        block.includes('backoffice_category: teléfono') || block.includes('backoffice_category: movil'),
    };
  }

  return {
    isAccesorio: notes.includes('backoffice_category: accesorio'),
    isTelefono:
      notes.includes('backoffice_category: teléfono') || notes.includes('backoffice_category: movil'),
  };
}

function matchesDateRange(
  createdAt: string,
  dateFilterFrom: string,
  dateFilterTo: string
): boolean {
  const d = new Date(createdAt);
  const from = dateFilterFrom ? new Date(dateFilterFrom) : null;
  const to = dateFilterTo ? new Date(dateFilterTo) : null;
  if (to) to.setHours(23, 59, 59);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function buildSubBodegaRows(
  allReceptions: SubBodegaRow['reception'][],
  activeTab: BackofficeTab,
  dateFilterFrom: string,
  dateFilterTo: string
): SubBodegaRow[] {
  const targetTab = activeTab === 'sub_accesorios' ? 'accesorio' : 'telefono';

  return allReceptions.flatMap((r) => {
    if (r.status === 'ARCHIVADO') return [];
    if (!matchesDateRange(r.created_at, dateFilterFrom, dateFilterTo)) return [];

    const guides = r.processed_guides?.length ? r.processed_guides : [r.guide_number];
    const rows: SubBodegaRow[] = [];

    for (const g of guides) {
      const { isAccesorio, isTelefono } = guideCategoryFlags(r, g);
      const match =
        activeTab === 'sub_accesorios' ? isAccesorio : activeTab === 'sub_telefonos' ? isTelefono : false;
      if (!match) continue;

      const notes = r.notes || '';
      const guideRg = (r.reception_guides || []).find((rg) => rg.guide_number === g);
      const gEscaped = g.replace(/[-]/g, '\\-');
      const tlRegex = new RegExp(`\\[(.*?)\\].*?CLASIFICACIÓN.*?(?:${gEscaped}).*?- Por: (.*)`, 'i');
      const tlMatch = notes.match(tlRegex);
      const processDate = guideRg?.classified_at
        ? new Date(guideRg.classified_at).toLocaleString()
        : tlMatch
          ? tlMatch[1]
          : new Date(r.created_at).toLocaleString();
      const processUser = guideRg?.classified_by || (tlMatch ? tlMatch[2].trim() : r.received_by || 'SISTEMA');

      rows.push({
        id: `${r.id}-${g}`,
        reception: r,
        guide: g,
        processDate,
        processUser,
      });
    }

    return rows;
  });
}

export function countSubBodegaBoxes(
  allReceptions: SubBodegaRow['reception'][],
  activeTab: BackofficeTab,
  dateFilterFrom: string,
  dateFilterTo: string
): number {
  return buildSubBodegaRows(allReceptions, activeTab, dateFilterFrom, dateFilterTo).length;
}

export function hasSubBodegaInventory(
  allReceptions: SubBodegaRow['reception'][],
  activeTab: BackofficeTab
): boolean {
  return allReceptions.some((r) => {
    if (r.status === 'ARCHIVADO') return false;
    const guideCategories = (r.reception_guides || []).map((rg) => (rg.category || '').toLowerCase());
    const notes = (r.notes || '').toLowerCase();

    if (activeTab === 'sub_accesorios') {
      if (guideCategories.length > 0) return guideCategories.some((c) => c === 'accesorio');
      return notes.includes('backoffice_category: accesorio') || notes.includes('accesorio');
    }
    if (activeTab === 'sub_telefonos') {
      if (guideCategories.length > 0) return guideCategories.some((c) => c === 'telefono');
      return (
        notes.includes('backoffice_category: teléfono') ||
        notes.includes('backoffice_category: movil') ||
        notes.includes('teléfono') ||
        notes.includes('movil')
      );
    }
    return false;
  });
}
