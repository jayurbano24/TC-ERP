import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { normalizeSerial } from '@/lib/sap/normalizeSerial';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Lote pequeño: bajo egress (solo coincidencias) y sin body gigante. */
const BatchSchema = z.object({
  serials: z.array(z.string()).min(1).max(3_000),
  materials: z.record(z.string(), z.string()).optional().default({}),
});

const MAX_SERIAL_LEN = 80;
const IN_CHUNK = 200; // .in() de Supabase se comporta mejor en chunks chicos

type MatchRow = {
  id: string;
  serial_number: string;
  service_order_id: string;
  material: string | null;
};

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

  const matches: MatchRow[] = [];
  let queries = 0;

  for (let i = 0; i < norms.length; i += IN_CHUNK) {
    const chunk = norms.slice(i, i + IN_CHUNK);

    // Preferir columna generada (migración 097); fallback a upper(trim)
    let data: { id: string; serial_number: string; service_order_id: string }[] | null = null;
    let error: { message?: string; code?: string } | null = null;

    const byCol = await supabase
      .from('series')
      .select('id, serial_number, service_order_id')
      .not('service_order_id', 'is', null)
      .in('serial_normalized', chunk);
    queries += 1;

    if (byCol.error && /serial_normalized|column/i.test(byCol.error.message || '')) {
      // Pre-migración: filtrar en memoria sobre un IN por serial_number exacto no basta;
      // usamos ilike no sirve para IN. Traemos por filter or de equals case-insensitive
      // vía RPC no disponible → fallback: .in con valores ya upper (muchas series TC están upper).
      const byExact = await supabase
        .from('series')
        .select('id, serial_number, service_order_id')
        .not('service_order_id', 'is', null)
        .in('serial_number', chunk);
      queries += 1;
      data = byExact.data;
      error = byExact.error;
    } else {
      data = byCol.data;
      error = byCol.error;
    }

    if (error) throw error;

    for (const row of data || []) {
      const norm = normalizeSerial(row.serial_number);
      matches.push({
        id: row.id,
        serial_number: row.serial_number,
        service_order_id: row.service_order_id,
        material: materialByNorm.get(norm) ?? null,
      });
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
