import type { HistoryUnitEntry } from './types';

/** Busca en S1–S4, guía courier, guía recepción o documento SAP */
export function unitEntryMatchesSearch(entry: HistoryUnitEntry, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (entry.unit.some((s) => (s?.serial_number || '').toLowerCase().includes(q))) return true;
  if ((entry.unitGuide || '').toLowerCase().includes(q)) return true;
  if ((entry.unitSap || '').toLowerCase().includes(q)) return true;
  if ((entry.rec?.guide_number || '').toLowerCase().includes(q)) return true;
  if ((entry.osLabel || '').toLowerCase().includes(q)) return true;
  return false;
}

/** @deprecated use unitEntryMatchesSearch */
export function unitEntryMatchesSerialSearch(entry: HistoryUnitEntry, search: string): boolean {
  return unitEntryMatchesSearch(entry, search);
}

export function filterUnitEntriesBySearch(entries: HistoryUnitEntry[], search: string): HistoryUnitEntry[] {
  const q = search.trim();
  if (!q) return entries;
  return entries.filter((e) => unitEntryMatchesSearch(e, q));
}
