import type { SupabaseClient } from '@supabase/supabase-js';
import type { OntRun } from '../domain/types';
import { dedupeOntRuns } from '../domain/ontRunListKey';
import { pickPreferredOntRun } from '../domain/ontRunVerdict';
import { mapOntRunRow } from './mapOntRunRow';

/**
 * Varias filas pueden compartir run_id (2 PCs / re-sync). PostgREST maybeSingle() falla o devuelve fila al azar.
 * Preferimos la fila con report_json más rico (certificate_sheet, flows).
 */
export async function fetchOntRunByRunId(
  supabase: SupabaseClient,
  runId: string
): Promise<{ row: OntRun | null; duplicateCount: number }> {
  const { data, error } = await supabase
    .from('ont_runs')
    .select('*')
    .eq('run_id', runId)
    .order('recorded_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  if (!data?.length) return { row: null, duplicateCount: 0 };

  const mapped = data.map((row) => mapOntRunRow(row as Parameters<typeof mapOntRunRow>[0]));
  if (mapped.length === 1) return { row: mapped[0], duplicateCount: 0 };

  const deduped = dedupeOntRuns(mapped);
  let best = deduped[0];
  for (let i = 1; i < deduped.length; i += 1) {
    best = pickPreferredOntRun(best, deduped[i]);
  }

  return { row: best, duplicateCount: mapped.length - 1 };
}
