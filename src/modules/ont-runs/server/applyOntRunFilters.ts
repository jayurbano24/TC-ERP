import type { SupabaseClient } from '@supabase/supabase-js';
import type { OntRunsListFilters, OntRunsDailyCertifiedPoint, OntRunsVerdictSummary } from '../domain/types';

type FilterScope = {
  listView?: boolean;
  verdictOverride?: 'PASS' | 'FAIL' | 'NOT_RUN';
  /** Conteo solo para un día YYYY-MM-DD (ignora from/to del filtro). */
  dayOverride?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOntRunFilters(query: any, filters: OntRunsListFilters, scope: FilterScope = {}) {
  let q = query;

  const token = filters.q?.trim().replace(/[%_]/g, '');
  if (token) {
    q = q.or(
      `run_id.ilike.%${token}%,serial.ilike.%${token}%,mac.ilike.%${token}%,model.ilike.%${token}%`
    );
  }

  if (scope.dayOverride) {
    q = q.gte('recorded_at', `${scope.dayOverride}T00:00:00`);
    q = q.lte('recorded_at', `${scope.dayOverride}T23:59:59.999`);
  } else if (!filters.allData) {
    if (filters.from) {
      q = q.gte('recorded_at', `${filters.from}T00:00:00`);
    }
    if (filters.to) {
      q = q.lte('recorded_at', `${filters.to}T23:59:59.999`);
    }
  }

  if (scope.verdictOverride) {
    q = q.eq('verdict', scope.verdictOverride);
  } else if (scope.listView) {
    if (filters.verdict?.trim()) {
      q = q.eq('verdict', filters.verdict.trim().toUpperCase());
    } else if (filters.hideNotRun) {
      q = q.neq('verdict', 'NOT_RUN');
    }
  }

  if (filters.deviceType?.trim()) {
    q = q.ilike('device_type', `%${filters.deviceType.trim()}%`);
  }
  if (filters.station?.trim()) {
    q = q.ilike('station', `%${filters.station.trim()}%`);
  }

  return q;
}

function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function countWith(
  supabase: SupabaseClient,
  filters: Omit<OntRunsListFilters, 'page' | 'limit'>,
  scope: FilterScope
): Promise<number> {
  let query = supabase.from('ont_runs').select('*', { count: 'exact', head: true });
  query = applyOntRunFilters(query, filters, scope);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function fetchOntRunsVerdictSummary(
  supabase: SupabaseClient,
  filters: Omit<OntRunsListFilters, 'page' | 'limit'>
): Promise<OntRunsVerdictSummary> {
  const base = { ...filters };

  const [total, pass, fail, notRun, todayPass, todayFail] = await Promise.all([
    countWith(supabase, base, { listView: true }),
    countWith(supabase, base, { verdictOverride: 'PASS' }),
    countWith(supabase, base, { verdictOverride: 'FAIL' }),
    countWith(supabase, base, { verdictOverride: 'NOT_RUN' }),
    countWith(supabase, base, { verdictOverride: 'PASS', dayOverride: localDateIso() }),
    countWith(supabase, base, { verdictOverride: 'FAIL', dayOverride: localDateIso() }),
  ]);

  const dayOffsets = [6, 5, 4, 3, 2, 1, 0];
  const dailyChunks = await Promise.all(
    dayOffsets.map(async (offset) => {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const day = localDateIso(d);
      const [dayPass, dayFail] = await Promise.all([
        countWith(supabase, base, { verdictOverride: 'PASS', dayOverride: day }),
        countWith(supabase, base, { verdictOverride: 'FAIL', dayOverride: day }),
      ]);
      return { date: day, pass: dayPass, fail: dayFail, certified: dayPass + dayFail };
    })
  );
  const daily: OntRunsDailyCertifiedPoint[] = dailyChunks;

  return {
    total,
    pass,
    fail,
    notRun,
    todayPass,
    todayFail,
    todayCertified: todayPass + todayFail,
    daily,
  };
}
