import type { SupabaseClient } from '@supabase/supabase-js';
import type { OntRun, OntRunsListFilters } from '../domain/types';
import { dedupeOntRunsWithStats } from '../domain/ontRunListKey';
import { applyOntRunFilters } from './applyOntRunFilters';
import { mapOntRunRow } from './mapOntRunRow';

const PAGE_SIZE = 1000;
const MAX_ROWS = 10000;

export async function listOntRunsAll(
  supabase: SupabaseClient,
  filters: Omit<OntRunsListFilters, 'page' | 'limit'>,
  maxRows = MAX_ROWS
): Promise<{ rows: OntRun[]; truncated: boolean }> {
  const all: OntRun[] = [];

  for (let offset = 0; offset < maxRows; offset += PAGE_SIZE) {
    const end = Math.min(offset + PAGE_SIZE - 1, maxRows - 1);
    let query = supabase
      .from('ont_runs')
      .select('*')
      .order('recorded_at', { ascending: false })
      .range(offset, end);

    query = applyOntRunFilters(query, filters, { listView: true });

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const chunk = (data || []).map((row) => mapOntRunRow(row as Parameters<typeof mapOntRunRow>[0]));
    all.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      return { rows: dedupeOntRunsWithStats(all).rows, truncated: false };
    }
  }

  return { rows: dedupeOntRunsWithStats(all).rows, truncated: true };
}
