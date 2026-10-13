import type { OntRunsListFilters } from './types';

export type OntRunPeriodPreset = 'today' | '7d' | '30d' | 'all';

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function filtersForOntRunPeriod(preset: OntRunPeriodPreset): Pick<OntRunsListFilters, 'from' | 'to' | 'allData'> {
  const to = new Date();
  const from = new Date();
  if (preset === 'today') {
    const d = isoDateLocal(to);
    return { from: d, to: d, allData: false };
  }
  if (preset === '7d') {
    from.setDate(from.getDate() - 6);
    return { from: isoDateLocal(from), to: isoDateLocal(to), allData: false };
  }
  if (preset === '30d') {
    from.setDate(from.getDate() - 29);
    return { from: isoDateLocal(from), to: isoDateLocal(to), allData: false };
  }
  return { allData: true, from: undefined, to: undefined };
}

export function detectOntRunPeriod(filters: OntRunsListFilters): OntRunPeriodPreset {
  if (filters.allData) return 'all';
  if (!filters.from || !filters.to) return '30d';
  if (filters.from === filters.to) {
    const today = isoDateLocal(new Date());
    if (filters.from === today) return 'today';
  }
  const from = new Date(`${filters.from}T12:00:00`);
  const to = new Date(`${filters.to}T12:00:00`);
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  if (diffDays <= 6) return '7d';
  if (diffDays <= 31) return '30d';
  return 'all';
}
