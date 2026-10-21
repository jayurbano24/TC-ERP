import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { normalizeSerial } from '@/lib/sap/normalizeSerial';

export const dynamic = 'force-dynamic';
/** Lotes grandes / DB lenta — Pro plan permite hasta 300s. */
export const maxDuration = 300;

/** Lote pequeño: bajo egress (solo coincidencias) y sin body gigante. */
const BatchSchema = z.object({
  serials: z.array(z.string()).min(1).max(3_000),
  materials: z.record(z.string(), z.string()).optional().default({}),
  valuations: z.record(z.string(), z.string()).optional().default({}),
});

const MAX_SERIAL_LEN = 80;
const IN_CHUNK = 200; // .in() de Supabase se comporta mejor en chunks chicos

type SeriesRow = {
  id: string;
  serial_number: string;
  service_order_id: string;
  s2: string | null;
  s3: string | null;
  s4: string | null;
};

type MatchRow = {
  id: string;
  serial_number: string;
  service_order_id: string;
  material: string | null;
  valuation: string | null;
  /** Norma SAP que produjo el match (puede ser S2/S3/S4, no solo serie principal). */
  matched_norm: string;
};

const SERIES_SELECT =
  'id, serial_number, service_order_id, s2, s3, s4';

function normsOnRow(row: SeriesRow, chunkSet: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of [row.serial_number, row.s2, row.s3, row.s4]) {
    const n = normalizeSerial(raw);
    if (n && chunkSet.has(n)) out.push(n);
  }
  return [...new Set(out)];
}

function pushRowMatches(
  row: SeriesRow,
  chunkSet: Set<string>,
  materialByNorm: Map<string, string>,
  valuationByNorm: Map<string, string>,
  seenPair: Set<string>,
  matches: MatchRow[]
) {
  for (const norm of normsOnRow(row, chunkSet)) {
    const pairKey = `${row.id}|${norm}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    matches.push({
      id: row.id,
      serial_number: row.serial_number,
      service_order_id: row.service_order_id,
      material: materialByNorm.get(norm) ?? null,
      valuation: valuationByNorm.get(norm) ?? null,
      matched_norm: norm,
    });
  }
}

/**
 * Cruce paulativo: recibe hasta 3000 series SAP y consulta TC con IN.
 * Solo devuelve coincidencias (egress mínimo).
 */
export const POST = withErrorHandler(async (request: Request) => {
  const started = Date.now();
  const body = await parseJsonBody(request, BatchSchema);
  const supabase = getSupabaseServerClient();

  const norms: string[] = [];
  const materialByNorm = new Map<string, string>();
  const valuationByNorm = new Map<string, string>();
  const seen = new Set<string>();

  for (const raw of body.serials) {
    const key = normalizeSerial(raw);
    if (!key || key.length > MAX_SERIAL_LEN || seen.has(key)) continue;
    seen.add(key);
    norms.push(key);
  }

  for (const [raw, mat] of Object.entries(body.materials || {})) {
    const key = normalizeSerial(raw);
    if (!key || key.length > MAX_SERIAL_LEN) continue;
    const material = String(mat || '').trim().slice(0, 120);
    if (material) materialByNorm.set(key, material);
  }

  for (const [raw, val] of Object.entries(body.valuations || {})) {
    const key = normalizeSerial(raw);
    if (!key || key.length > MAX_SERIAL_LEN) continue;
    const valuation = String(val || '').trim().slice(0, 120);
    if (valuation) valuationByNorm.set(key, valuation);
  }

  const matches: MatchRow[] = [];
  const seenPair = new Set<string>();
  let queries = 0;

  for (let i = 0; i < norms.length; i += IN_CHUNK) {
    const chunk = norms.slice(i, i + IN_CHUNK);
    const chunkSet = new Set(chunk);

    const mergeRows = (rows: SeriesRow[] | null) => {
      for (const row of rows || []) pushRowMatches(row, chunkSet, materialByNorm, valuationByNorm, seenPair, matches);
    };

    const byCol = await supabase
      .from('series')
      .select(SERIES_SELECT)
      .not('service_order_id', 'is', null)
      .in('serial_normalized', chunk);
    queries += 1;

    if (byCol.error && /serial_normalized|column/i.test(byCol.error.message || '')) {
      const byExact = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .not('service_order_id', 'is', null)
        .in('serial_number', chunk);
      queries += 1;
      if (byExact.error) throw byExact.error;
      mergeRows(byExact.data as SeriesRow[] | null);
    } else {
      if (byCol.error) throw byCol.error;
      mergeRows(byCol.data as SeriesRow[] | null);
    }

    for (const col of ['s2', 's3', 's4'] as const) {
      const bySlot = await supabase
        .from('series')
        .select(SERIES_SELECT)
        .not('service_order_id', 'is', null)
        .in(col, chunk);
      queries += 1;
      if (bySlot.error) throw bySlot.error;
      mergeRows(bySlot.data as SeriesRow[] | null);
    }
  }

  return NextResponse.json({
    success: true,
    stats: {
      batchSerials: norms.length,
      matches: matches.length,
      queries,
      elapsedMs: Date.now() - started,
    },
    matches,
  });
}, { module: 'sap', action: 'match-batch' });
