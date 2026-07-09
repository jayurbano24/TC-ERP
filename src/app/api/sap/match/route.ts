import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { normalizeSerial } from '@/lib/sap/normalizeSerial';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Payload compacto: lista de series + mapa opcional serial→material.
 * Límites amplios: Excel SAP a veces trae celdas largas/sucias.
 */
const MatchBodySchema = z.object({
  serials: z.array(z.string()).min(1).max(250_000),
  materials: z.record(z.string(), z.string()).optional().default({}),
});

const PAGE_SIZE = 1000;
const MAX_SERIAL_LEN = 80;

type TcSeriesRow = { id: string; serial_number: string; service_order_id: string };
type TcEquipoRow = { id: string };

async function fetchAllTcSeries(
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<{ series: TcSeriesRow[]; equipos: TcEquipoRow[]; queries: number }> {
  let queries = 0;
  const series: TcSeriesRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('series')
      .select('id, serial_number, service_order_id')
      .not('service_order_id', 'is', null)
      .range(from, to);
    queries += 1;
    if (error) throw error;
    const batch = (data || []) as TcSeriesRow[];
    series.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const equipos: TcEquipoRow[] = [];
  from = 0;
  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase.from('service_orders').select('id').range(from, to);
    queries += 1;
    if (error) throw error;
    const batch = (data || []) as TcEquipoRow[];
    equipos.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { series, equipos, queries };
}

/**
 * Cruce SAP ↔ TC en servidor (payload mínimo + paginación TC completa).
 */
export const POST = withErrorHandler(async (request: Request) => {
  const started = Date.now();
  const body = await parseJsonBody(request, MatchBodySchema);
  const supabase = getSupabaseServerClient();

  const sapSet = new Set<string>();
  const materialBySerial = new Map<string, string>();
  let skippedSerials = 0;

  for (const raw of body.serials) {
    const key = normalizeSerial(raw);
    if (!key || key.length > MAX_SERIAL_LEN) {
      skippedSerials += 1;
      continue;
    }
    sapSet.add(key);
  }

  for (const [raw, mat] of Object.entries(body.materials || {})) {
    const key = normalizeSerial(raw);
    if (!key || key.length > MAX_SERIAL_LEN) continue;
    const material = String(mat || '').trim().slice(0, 120);
    if (material) materialBySerial.set(key, material);
  }

  if (sapSet.size === 0) {
    return NextResponse.json(
      { success: false, error: 'No hay series válidas en el archivo para cruzar.' },
      { status: 400 }
    );
  }

  const { series, equipos, queries } = await fetchAllTcSeries(supabase);

  const equipoToSeries = new Map<string, TcSeriesRow[]>();
  for (const s of series) {
    if (!equipoToSeries.has(s.service_order_id)) equipoToSeries.set(s.service_order_id, []);
    equipoToSeries.get(s.service_order_id)!.push(s);
  }

  let validados = 0;
  let noEncontrados = 0;
  let inconsistencias = 0;
  let seriesMatched = 0;
  let seriesUnmatched = 0;

  const validationDetails: Record<string, unknown>[] = [];
  const equiposUpdates: { id: string; sap_integration_status: string }[] = [];
  const seriesUpdates: { id: string; sap_status: string }[] = [];
  const seenSeriesUpdate = new Set<string>();

  for (const eq of equipos) {
    const eqSeries = equipoToSeries.get(eq.id) || [];
    if (eqSeries.length === 0) continue;

    let matchCount = 0;
    const foundMaterials = new Set<string>();

    eqSeries.forEach((seriesRow, idx) => {
      const norm = normalizeSerial(seriesRow.serial_number);
      const isMatch = Boolean(norm && sapSet.has(norm));
      const material = norm ? materialBySerial.get(norm) ?? null : null;

      if (isMatch) {
        matchCount++;
        seriesMatched++;
        if (material) foundMaterials.add(material);
        if (!seenSeriesUpdate.has(seriesRow.id)) {
          seenSeriesUpdate.add(seriesRow.id);
          seriesUpdates.push({ id: seriesRow.id, sap_status: 'Validado' });
        }
      } else {
        seriesUnmatched++;
        if (!seenSeriesUpdate.has(seriesRow.id)) {
          seenSeriesUpdate.add(seriesRow.id);
          seriesUpdates.push({ id: seriesRow.id, sap_status: 'Sin Coincidencia' });
        }
      }

      validationDetails.push({
        equipo_id: eq.id,
        tipo_serie: `S${idx + 1}`,
        serie: seriesRow.serial_number,
        material,
        coincidencia: isMatch,
      });
    });

    let eqStatus = 'Sin Coincidencia';
    if (matchCount > 0) {
      if (foundMaterials.size > 1) {
        eqStatus = 'Pendiente Revisión';
        inconsistencias++;
      } else {
        eqStatus = 'Validado SAP';
        validados++;
      }
    } else {
      noEncontrados++;
    }

    equiposUpdates.push({ id: eq.id, sap_integration_status: eqStatus });
  }

  const elapsedMs = Date.now() - started;

  return NextResponse.json({
    success: true,
    stats: {
      sapUniqueSerials: sapSet.size,
      sapEntriesReceived: body.serials.length,
      skippedSerials,
      tcSeries: series.length,
      tcEquipos: equipos.length,
      validados,
      noEncontrados,
      inconsistencias,
      seriesMatched,
      seriesUnmatched,
      dbQueries: queries,
      elapsedMs,
    },
    validationDetails,
    equiposUpdates,
    seriesUpdates,
  });
}, { module: 'sap', action: 'match' });
