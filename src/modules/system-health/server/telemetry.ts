import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityStats, LatencyStats, SparkPoint } from '../types';

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? null;
}

export async function recordHealthSample(
  supabase: SupabaseClient,
  metric: string,
  value: number,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.from('health_metric_samples').insert({
      metric,
      value,
      meta,
    });
  } catch {
    // tabla puede no existir aún
  }
}

export async function loadLatencyStats(
  supabase: SupabaseClient,
  sinceIso: string
): Promise<LatencyStats> {
  try {
    const { data, error } = await supabase
      .from('health_metric_samples')
      .select('value')
      .eq('metric', 'api_latency_ms')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error || !data?.length) {
      return {
        avgMs: null,
        p95Ms: null,
        p99Ms: null,
        maxMs: null,
        sampleCount: 0,
        note: 'Sin muestras aún (se acumulan en cada chequeo de Salud).',
      };
    }
    const values = data.map((r) => Number(r.value)).filter((n) => Number.isFinite(n));
    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((s, n) => s + n, 0) / values.length;
    return {
      avgMs: Math.round(avg),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      maxMs: sorted[sorted.length - 1] ?? null,
      sampleCount: values.length,
      note: 'Desde health_metric_samples (probe API).',
    };
  } catch {
    return {
      avgMs: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
      sampleCount: 0,
      note: 'Aplicar migración 164_health_metric_samples.sql',
    };
  }
}

export async function loadAvailability(
  supabase: SupabaseClient
): Promise<AvailabilityStats> {
  async function pctSince(hours: number): Promise<number | null> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    try {
      const { data, error } = await supabase
        .from('health_metric_samples')
        .select('value')
        .eq('metric', 'api_up')
        .gte('created_at', since)
        .limit(5000);
      if (error || !data?.length) return null;
      const ups = data.filter((r) => Number(r.value) >= 1).length;
      return Math.round((ups / data.length) * 10000) / 100;
    } catch {
      return null;
    }
  }

  const [todayPct, d7Pct, d30Pct] = await Promise.all([
    pctSince(24),
    pctSince(24 * 7),
    pctSince(24 * 30),
  ]);

  return {
    todayPct,
    d7Pct,
    d30Pct,
    note:
      todayPct == null
        ? 'Disponibilidad se calculará tras acumular samples (migración 164).'
        : 'Proxy: ratio de probes API OK en health_metric_samples.',
  };
}

export async function loadSparks(
  supabase: SupabaseClient,
  metric: string,
  limit = 24
): Promise<SparkPoint[]> {
  try {
    const { data, error } = await supabase
      .from('health_metric_samples')
      .select('value, created_at')
      .eq('metric', metric)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data
      .slice()
      .reverse()
      .map((r) => ({ t: String(r.created_at), v: Number(r.value) }));
  } catch {
    return [];
  }
}

export async function loadPeakRpm(
  supabase: SupabaseClient,
  sinceIso: string
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from('health_metric_samples')
      .select('value')
      .eq('metric', 'rpm')
      .gte('created_at', sinceIso)
      .order('value', { ascending: false })
      .limit(1);
    if (error || !data?.[0]) return null;
    return Number(data[0].value);
  } catch {
    return null;
  }
}
