import type { SupabaseClient } from '@supabase/supabase-js';
import type { HttpStatusBucket } from '../types';

/** Siempre registra 4xx/5xx; muestreo ~15% de 2xx/3xx para no saturar. */
export function shouldSampleHttpStatus(status: number): boolean {
  if (status >= 400) return true;
  return Math.random() < 0.15;
}

/**
 * Insert fire-and-forget vía REST (usable desde Edge middleware y Node).
 */
export function fireHttpStatusSample(
  status: number,
  meta: Record<string, unknown> = {}
): void {
  if (!shouldSampleHttpStatus(status)) return;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  void fetch(`${url}/rest/v1/health_metric_samples`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      metric: 'http_status',
      value: status,
      meta,
    }),
  }).catch(() => {
    /* best effort */
  });
}

export async function recordHttpStatusSample(
  supabase: SupabaseClient,
  status: number,
  meta: Record<string, unknown> = {}
): Promise<void> {
  if (!shouldSampleHttpStatus(status)) return;
  try {
    await supabase.from('health_metric_samples').insert({
      metric: 'http_status',
      value: status,
      meta,
    });
  } catch {
    /* ignore */
  }
}

export async function loadHttpStatusBuckets(
  supabase: SupabaseClient,
  sinceIso: string
): Promise<{ buckets: HttpStatusBucket[]; note: string; unauthorized: number; rateLimited: number }> {
  try {
    const { data, error } = await supabase
      .from('health_metric_samples')
      .select('value')
      .eq('metric', 'http_status')
      .gte('created_at', sinceIso)
      .limit(8000);

    if (error || !data?.length) {
      return {
        buckets: [],
        note: 'Sin muestras HTTP aún (se registran desde API routes + middleware).',
        unauthorized: 0,
        rateLimited: 0,
      };
    }

    const counts = new Map<string, number>();
    let unauthorized = 0;
    let rateLimited = 0;

    for (const row of data) {
      const code = Math.trunc(Number(row.value));
      if (!Number.isFinite(code)) continue;
      if (code === 401) unauthorized += 1;
      if (code === 429) rateLimited += 1;
      const bucket =
        code < 200
          ? '1xx'
          : code < 300
            ? '2xx'
            : code < 400
              ? '3xx'
              : code < 500
                ? '4xx'
                : '5xx';
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);

      const exact = String(code);
      if ([200, 400, 401, 403, 404, 429, 500, 502, 504].includes(code)) {
        counts.set(exact, (counts.get(exact) ?? 0) + 1);
      }
    }

    const total = data.length;
    const order = ['200', '2xx', '400', '401', '403', '404', '429', '4xx', '500', '502', '504', '5xx'];
    const buckets: HttpStatusBucket[] = order
      .filter((code) => (counts.get(code) ?? 0) > 0)
      .map((code) => {
        const count = counts.get(code) ?? 0;
        return {
          code,
          count,
          pct: Math.round((count / total) * 1000) / 10,
        };
      });

    return {
      buckets,
      note: `Muestras HTTP ${total} (24h, con muestreo de 2xx).`,
      unauthorized,
      rateLimited,
    };
  } catch {
    return {
      buckets: [],
      note: 'No se pudieron leer muestras HTTP.',
      unauthorized: 0,
      rateLimited: 0,
    };
  }
}
