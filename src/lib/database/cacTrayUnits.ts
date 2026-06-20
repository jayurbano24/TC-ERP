import type {
  CacTrayPageResponse,
  CacTrayQueryParams,
  CacTrayStatsResponse,
  CacTrayUnitRow,
  TransferEligibleItem,
} from '@/lib/backoffice/cacTrayTypes';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

function applyTrayFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  params: CacTrayQueryParams
) {
  let q = query.eq('is_active', true);

  if (params.from) q = q.gte('classified_at', `${params.from}T00:00:00`);
  if (params.to) q = q.lte('classified_at', `${params.to}T23:59:59`);
  if (params.techId) q = q.eq('tech_id', params.techId);
  if (params.brandId) q = q.eq('brand_id', params.brandId);
  if (params.modelId) q = q.eq('model_id', params.modelId);

  const search = params.search?.trim();
  if (search) q = q.ilike('search_text', `%${search.toLowerCase()}%`);

  const guide = params.guide?.trim();
  if (guide) q = q.ilike('guide_number', `%${guide}%`);

  const pilot = params.pilot?.trim();
  if (pilot) q = q.ilike('pilot_name', `%${pilot}%`);

  const courier = params.courier?.trim();
  if (courier) q = q.ilike('carrier', `%${courier}%`);

  const receivedBy = params.receivedBy?.trim();
  if (receivedBy) q = q.ilike('received_by_name', `%${receivedBy}%`);

  const status = params.status?.trim();
  if (status) q = q.ilike('unit_status_label', `%${status}%`);

  const osLabel = params.osLabel?.trim();
  if (osLabel) q = q.ilike('os_label', `%${osLabel}%`);

  const sapDocument = params.sapDocument?.trim();
  if (sapDocument) q = q.ilike('sap_document_number', `%${sapDocument}%`);

  const agencyId = params.agencyId?.trim();
  if (agencyId) {
    const code = agencyId.toLowerCase();
    q = q.or(`agency_code.ilike.%${code}%,agency_name.ilike.%${code}%`);
  }

  return q;
}

export async function queryCacTrayPage(params: CacTrayQueryParams): Promise<CacTrayPageResponse> {
  const supabase = getSupabaseServerClient();
  const limit = Math.min(Math.max(params.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(params.page || 1, 1);
  const offset = (page - 1) * limit;

  let query = supabase
    .from('cac_tray_units')
    .select('*', { count: 'exact' })
    .order('classified_at', { ascending: false })
    .order('os_number', { ascending: false })
    .range(offset, offset + limit - 1);

  query = applyTrayFilters(query, params);

  const { data, error, count } = await query;
  if (error) {
    if (error.message.includes('cac_tray_units') && error.message.includes('does not exist')) {
      throw new Error('Migración 033 pendiente: ejecute 033_cac_tray_units.sql en Supabase.');
    }
    throw new Error(error.message);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return {
    rows: (data || []) as CacTrayUnitRow[],
    totalCount,
    page,
    limit,
    totalPages,
  };
}

export async function queryCacTrayStats(params: CacTrayQueryParams): Promise<CacTrayStatsResponse> {
  const supabase = getSupabaseServerClient();

  let query = supabase.from('cac_tray_units').select('tech_id').eq('is_active', true);

  query = applyTrayFilters(query, params);

  const { data, error } = await query;
  if (error) {
    if (error.message.includes('cac_tray_units') && error.message.includes('does not exist')) {
      throw new Error('Migración 033 pendiente: ejecute 033_cac_tray_units.sql en Supabase.');
    }
    throw new Error(error.message);
  }

  const byTechId: Record<string, number> = {};
  let unknown = 0;

  for (const row of data || []) {
    const techId = (row as { tech_id?: string | null }).tech_id;
    if (techId) {
      byTechId[techId] = (byTechId[techId] || 0) + 1;
    } else {
      unknown += 1;
    }
  }

  if (unknown > 0) byTechId['__unknown__'] = unknown;

  return {
    total: (data || []).length,
    byTechId,
  };
}

/** Para exportación: hasta maxRows filas con los mismos filtros. */
export async function queryCacTrayAllFiltered(
  params: CacTrayQueryParams,
  maxRows = 10000
): Promise<CacTrayUnitRow[]> {
  const supabase = getSupabaseServerClient();

  let query = supabase
    .from('cac_tray_units')
    .select('*')
    .order('classified_at', { ascending: false })
    .order('os_number', { ascending: false })
    .limit(maxRows);

  query = applyTrayFilters(query, params);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as CacTrayUnitRow[];
}

export async function queryTransferEligibleSeries(
  techId: string,
  brandId: string,
  modelId: string
): Promise<TransferEligibleItem[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from('cac_tray_units')
    .select('series_ids, serial_numbers')
    .eq('is_active', true)
    .eq('tech_id', techId)
    .eq('brand_id', brandId)
    .eq('model_id', modelId)
    .eq('unit_status', 'RECEPCIONADO_BODEGA_GENERAL')
    .limit(5000);

  if (error) throw new Error(error.message);

  const out: TransferEligibleItem[] = [];
  for (const row of data || []) {
    const ids = (row as CacTrayUnitRow).series_ids || [];
    const sns = (row as CacTrayUnitRow).serial_numbers || [];
    if (ids.length > 0 && sns[0]) {
      out.push({ seriesIds: ids, sn: sns[0] });
    }
  }
  return out;
}

export function buildTrayQueryString(params: CacTrayQueryParams): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      sp.set(key, String(value));
    }
  });
  return sp.toString();
}
