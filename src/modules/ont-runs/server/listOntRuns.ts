import type { SupabaseClient } from '@supabase/supabase-js';
import type { OntRunsListFilters, OntRunsListResponse } from '../domain/types';
import { dedupeOntRunsWithStats } from '../domain/ontRunListKey';
import { applyOntRunFilters, fetchOntRunsVerdictSummary } from './applyOntRunFilters';
import { mapOntRunRow } from './mapOntRunRow';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function listOntRuns(
  supabase: SupabaseClient,
  filters: OntRunsListFilters
): Promise<OntRunsListResponse> {
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(filters.page ?? 1, 1);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('ont_runs')
    .select('*', { count: 'exact' })
    .order('recorded_at', { ascending: false })
    .range(offset, offset + limit - 1);

  query = applyOntRunFilters(query, filters, { listView: true });

  const summaryPromise = fetchOntRunsVerdictSummary(supabase, filters);

  const { data, error, count } = await query;
  if (error) {
    if (error.message.includes('ont_runs') && error.message.includes('does not exist')) {
      throw new Error('La tabla ont_runs no existe en Supabase.');
    }
    throw new Error(error.message);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const summary = await summaryPromise;
  const mapped = (data || []).map((row) => mapOntRunRow(row as Parameters<typeof mapOntRunRow>[0]));
  const { rows, suppressed } = dedupeOntRunsWithStats(mapped);

  return {
    rows,
    totalCount,
    page,
    limit,
    totalPages,
    summary,
    duplicateSuppressed: suppressed,
  };
}
