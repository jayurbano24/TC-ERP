import type { SupabaseClient } from '@supabase/supabase-js';
import type { CacTrayQueryParams, CacTrayUnitRow } from '@/lib/backoffice/cacTrayTypes';

const SUMMARY_SELECT =
  'service_order_id, clase_carcasa, dictamen, observaciones, actualizado_por_nombre, actualizado_en';

function missingTable(message: string): boolean {
  return message.includes('prediagnosticos') || message.includes('does not exist');
}

export async function attachPrediagnosticoSummaries(
  client: SupabaseClient,
  rows: CacTrayUnitRow[]
): Promise<CacTrayUnitRow[]> {
  const ids = [...new Set(rows.map((row) => row.service_order_id).filter(Boolean))];
  if (ids.length === 0) return rows;

  const { data, error } = await client.from('prediagnosticos').select(SUMMARY_SELECT).in('service_order_id', ids);
  if (error) {
    if (missingTable(error.message)) return rows;
    console.warn('[prediagnostico] resumen bandeja:', error.message);
    return rows;
  }

  const byOs = new Map(
    (data || []).map((row) => [String(row.service_order_id), row] as const)
  );

  return rows.map((row) => {
    const hit = byOs.get(row.service_order_id);
    if (!hit) return row;
    return {
      ...row,
      prediagnostico_clase: String(hit.clase_carcasa),
      prediagnostico_dictamen: String(hit.dictamen),
      prediagnostico_observaciones: hit.observaciones ? String(hit.observaciones) : '',
      prediagnostico_actualizado_por_nombre: hit.actualizado_por_nombre
        ? String(hit.actualizado_por_nombre)
        : '',
      prediagnostico_actualizado_en: hit.actualizado_en ? String(hit.actualizado_en) : '',
    };
  });
}

export async function restrictByPrediagnostico(
  client: SupabaseClient,
  // El builder de PostgREST cambia de tipo en cada filtro.
  query: any,
  params: CacTrayQueryParams
): Promise<any> {
  const shellClass = params.shellClass?.trim();
  const verdict = params.verdict?.trim();
  if (!shellClass && !verdict) return query;

  let lookup = client.from('prediagnosticos').select('service_order_id');
  if (verdict && verdict !== 'pendiente') lookup = lookup.eq('dictamen', verdict);
  if (shellClass && verdict !== 'pendiente') lookup = lookup.eq('clase_carcasa', shellClass);

  const { data, error } = await lookup.limit(5000);
  if (error) {
    if (missingTable(error.message)) return query;
    throw new Error(error.message);
  }

  const ids = (data || []).map((row) => String(row.service_order_id)).filter(Boolean);
  if (verdict === 'pendiente') {
    if (ids.length === 0) return query;
    return query.not('service_order_id', 'in', `(${ids.join(',')})`);
  }
  if (ids.length === 0) {
    return query.eq('service_order_id', '00000000-0000-0000-0000-000000000000');
  }
  return query.in('service_order_id', ids);
}
