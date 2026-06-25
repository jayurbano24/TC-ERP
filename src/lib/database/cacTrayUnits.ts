import type {
  CacTrayPageResponse,
  CacTrayQueryParams,
  CacTrayStatsResponse,
  CacTrayUnitRow,
  TransferEligibleItem,
} from '@/lib/backoffice/cacTrayTypes';
import { enrichCacTrayRowsWithSapValidation } from '@/lib/backoffice/enrichCacTraySapValidation';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { sanitizeOrFilterValue } from '@/lib/database/postgrestSafe';

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
    const code = sanitizeOrFilterValue(agencyId.toLowerCase());
    if (code) q = q.or(`agency_code.ilike.%${code}%,agency_name.ilike.%${code}%`);
  }

  return q;
}

type TrayPageOptions = {
  /** Si false, omite joins SAP (más rápido en primera pintura). */
  includeSapValidation?: boolean;
};

export async function queryCacTrayPage(
  params: CacTrayQueryParams,
  options?: TrayPageOptions
): Promise<CacTrayPageResponse> {
  const supabase = getSupabaseServerClient();
  const limit = Math.min(Math.max(params.limit || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const page = Math.max(params.page || 1, 1);
  const offset = (page - 1) * limit;

  let rowsQuery = supabase
    .from('cac_tray_units')
    .select('*')
    .order('classified_at', { ascending: false })
    .order('os_number', { ascending: false })
    .range(offset, offset + limit - 1);

  let countQuery = supabase
    .from('cac_tray_units')
    .select('id', { count: 'exact', head: true });

  rowsQuery = applyTrayFilters(rowsQuery, params);
  countQuery = applyTrayFilters(countQuery, params);

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    rowsQuery,
    countQuery,
  ]);

  const trayError = error || countError;
  if (trayError) {
    if (trayError.message.includes('cac_tray_units') && trayError.message.includes('does not exist')) {
      throw new Error('Migración 033 pendiente: ejecute 033_cac_tray_units.sql en Supabase.');
    }
    throw new Error(trayError.message);
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const baseRows = (data || []) as CacTrayUnitRow[];
  const rows =
    options?.includeSapValidation === false
      ? baseRows
      : await enrichCacTrayRowsWithSapValidation(baseRows);

  return {
    rows,
    totalCount,
    page,
    limit,
    totalPages,
  };
}

export async function queryCacTrayStats(params: CacTrayQueryParams): Promise<CacTrayStatsResponse> {
  const supabase = getSupabaseServerClient();

  const { data: techRows, error: techError } = await supabase.from('technologies').select('id');
  if (techError) throw new Error(techError.message);

  const techIds = (techRows || []).map((t: { id: string }) => t.id);

  const countFiltered = (
    extra?: (q: ReturnType<typeof applyTrayFilters>) => ReturnType<typeof applyTrayFilters>
  ) => {
    let q = supabase.from('cac_tray_units').select('*', { count: 'exact', head: true }).eq('is_active', true);
    q = applyTrayFilters(q, params);
    if (extra) q = extra(q);
    return q;
  };

  const [totalResult, ...techCountResults] = await Promise.all([
    countFiltered(),
    ...techIds.map((techId: string) => countFiltered((q) => q.eq('tech_id', techId))),
    countFiltered((q) => q.is('tech_id', null)),
  ]);

  if (totalResult.error) {
    if (totalResult.error.message.includes('cac_tray_units') && totalResult.error.message.includes('does not exist')) {
      throw new Error('Migración 033 pendiente: ejecute 033_cac_tray_units.sql en Supabase.');
    }
    throw new Error(totalResult.error.message);
  }

  const byTechId: Record<string, number> = {};
  techIds.forEach((techId: string, index: number) => {
    const result = techCountResults[index];
    const count = result.error ? 0 : (result.count ?? 0);
    if (count > 0) byTechId[techId] = count;
  });

  const unknownResult = techCountResults[techCountResults.length - 1];
  const unknownCount = unknownResult?.error ? 0 : (unknownResult?.count ?? 0);
  if (unknownCount > 0) byTechId['__unknown__'] = unknownCount;

  return {
    total: totalResult.count ?? 0,
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
  return enrichCacTrayRowsWithSapValidation((data || []) as CacTrayUnitRow[]);
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

export function buildTrayQueryString(
  params: CacTrayQueryParams & { includeSap?: boolean }
): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (key === 'includeSap') return;
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      sp.set(key, String(value));
    }
  });
  if (params.includeSap === false) {
    sp.set('includeSap', '0');
  }
  return sp.toString();
}
