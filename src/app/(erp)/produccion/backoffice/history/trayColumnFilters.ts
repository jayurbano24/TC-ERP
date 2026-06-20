import { getBackofficeClassifierName } from './classifierUtils';
import type { HistoryTrayFilters, HistoryUnitEntry } from './types';

function includesFilterText(haystack: string | undefined | null, needle: string): boolean {
  if (!needle.trim()) return true;
  return (haystack || '').toLowerCase().includes(needle.trim().toLowerCase());
}

export function hasActiveHistoryTrayFilters(filters: HistoryTrayFilters): boolean {
  return Object.values(filters).some((v) => String(v || '').trim() !== '');
}

export function filterUnitEntriesByTrayFilters(
  entries: HistoryUnitEntry[],
  filters: HistoryTrayFilters,
  ctx: {
    techIdFromModel: (modelId: string) => string | undefined;
    agencyLabelFromId?: (agencyId: string) => string;
  }
): HistoryUnitEntry[] {
  if (!hasActiveHistoryTrayFilters(filters)) return entries;

  return entries.filter((entry) => {
    const rec = entry.rec;
    const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '';
    const classifier = getBackofficeClassifierName(rec, entry.unitGuide);

    if (!includesFilterText(entry.unitGuide, filters.guide)) return false;
    if (!includesFilterText(piloto, filters.pilot)) return false;
    if (!includesFilterText(rec.carrier, filters.courier)) return false;
    if (!includesFilterText(classifier, filters.receivedBy)) return false;
    if (!includesFilterText(entry.unitStatusLabel, filters.status)) return false;
    if (!includesFilterText(entry.osLabel, filters.osLabel)) return false;
    if (!includesFilterText(entry.unitSap, filters.sapDocument)) return false;

    if (filters.techId && ctx.techIdFromModel(entry.grp.modelId) !== filters.techId) return false;
    if (filters.brandId && entry.grp.brandId !== filters.brandId) return false;
    if (filters.modelId && entry.grp.modelId !== filters.modelId) return false;

    if (filters.agencyId) {
      const raw = (entry.unitAgencyRaw || '').toLowerCase().trim();
      const code = filters.agencyId.toLowerCase();
      const name = (ctx.agencyLabelFromId?.(filters.agencyId) || '').toLowerCase().trim();
      const matches =
        raw === code ||
        raw.includes(code) ||
        (name && (raw === name || raw.includes(name)));
      if (!matches) return false;
    }

    return true;
  });
}
export function filterUnitEntriesBySerial(entries: HistoryUnitEntry[], search: string): HistoryUnitEntry[] {
  return filterUnitEntriesBySearch(entries, search);
}

