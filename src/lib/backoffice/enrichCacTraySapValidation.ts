import type { CacTrayUnitRow } from './cacTrayTypes';
import { getSupabaseServerClient } from '@/lib/supabase/server';

function chunkIds<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Enriquece filas del tray con estados SAP desde service_orders y series. */
export async function enrichCacTrayRowsWithSapValidation(
  rows: CacTrayUnitRow[]
): Promise<CacTrayUnitRow[]> {
  if (rows.length === 0) return rows;

  const supabase = getSupabaseServerClient();
  const osIds = [...new Set(rows.map((r) => r.service_order_id))];
  const seriesIds = [...new Set(rows.flatMap((r) => r.series_ids || []))];

  const orderStatusById = new Map<string, string | null>();
  const seriesStatusById = new Map<string, string | null>();

  const orderChunks = chunkIds(osIds, 80);
  const seriesChunks = chunkIds(seriesIds, 80);

  await Promise.all([
    ...orderChunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('service_orders')
        .select('id, sap_integration_status')
        .in('id', chunk);
      if (error) throw new Error(error.message);
      for (const row of data || []) {
        orderStatusById.set(row.id, row.sap_integration_status ?? null);
      }
    }),
    ...seriesChunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from('series')
        .select('id, sap_status')
        .in('id', chunk);
      if (error) throw new Error(error.message);
      for (const row of data || []) {
        seriesStatusById.set(row.id, row.sap_status ?? null);
      }
    }),
  ]);

  const orderStatusByIdFinal = orderStatusById;
  const seriesStatusByIdFinal = seriesStatusById;

  return rows.map((row) => {
    const seriesSapStatuses = (row.series_ids || []).map(
      (id) => seriesStatusByIdFinal.get(id) ?? 'Pendiente'
    );
    return {
      ...row,
      sap_integration_status: orderStatusByIdFinal.get(row.service_order_id) ?? null,
      series_sap_statuses: seriesSapStatuses,
    };
  });
}
