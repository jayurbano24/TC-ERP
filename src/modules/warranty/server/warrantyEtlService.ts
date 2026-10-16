import type { SupabaseClient } from '@supabase/supabase-js';
import type { WarrantyBreakdownRow, WarrantyPackResult } from './warrantyPackCompute';

export type WarrantyTrendPointRpc = {
  period: string;
  despachadas: number;
  elegibles: number;
  enGarantia: number;
  vencida: number;
};

type SummaryRpc = {
  periodDays: number;
  totalOsDespachadas: number;
  osConFechaDespacho: number;
  osSinFechaDespacho: number;
  enGarantia: number;
  vencida: number;
  elegiblesDespachados: number;
  noElegiblesPerfil?: number;
  reingresosGarantia: number;
  reingresosEnVentana90: number;
  byTechnology: WarrantyBreakdownRow[];
  byModel: WarrantyBreakdownRow[];
  trendByMonth?: WarrantyTrendPointRpc[];
  snapshotRefreshedAt: string | null;
  snapshotRefreshMs: number | null;
  snapshotRowCount: number | null;
  computedAt: string;
};

export type WarrantyPackSummaryWithMeta = WarrantyPackResult & {
  noElegiblesPerfil: number;
  trendByMonth: WarrantyTrendPointRpc[];
  snapshotRefreshedAt: string | null;
  snapshotRefreshMs: number | null;
  snapshotRowCount: number | null;
  snapshotEmpty: boolean;
};

function mapSummary(raw: SummaryRpc): WarrantyPackSummaryWithMeta {
  const rowCount = raw.snapshotRowCount ?? 0;
  return {
    periodDays: raw.periodDays ?? 90,
    totalOsDespachadas: raw.totalOsDespachadas ?? 0,
    osConFechaDespacho: raw.osConFechaDespacho ?? 0,
    osSinFechaDespacho: raw.osSinFechaDespacho ?? 0,
    enGarantia: raw.enGarantia ?? 0,
    vencida: raw.vencida ?? 0,
    elegiblesDespachados: raw.elegiblesDespachados ?? 0,
    reingresosGarantia: raw.reingresosGarantia ?? 0,
    reingresosEnVentana90: raw.reingresosEnVentana90 ?? 0,
    noElegiblesPerfil: raw.noElegiblesPerfil ?? Math.max(0, (raw.totalOsDespachadas ?? 0) - (raw.elegiblesDespachados ?? 0)),
    byTechnology: raw.byTechnology ?? [],
    byModel: raw.byModel ?? [],
    trendByMonth: raw.trendByMonth ?? [],
    computedAt: raw.computedAt ?? new Date().toISOString(),
    snapshotRefreshedAt: raw.snapshotRefreshedAt ?? null,
    snapshotRefreshMs: raw.snapshotRefreshMs ?? null,
    snapshotRowCount: raw.snapshotRowCount ?? null,
    snapshotEmpty: rowCount === 0,
  };
}

export async function fetchWarrantyPackSummaryFromEtl(
  supabase: SupabaseClient
): Promise<WarrantyPackSummaryWithMeta> {
  const { data, error } = await supabase.rpc('get_warranty_pack_summary');
  if (error) throw new Error(error.message);
  return mapSummary((data ?? {}) as SummaryRpc);
}

export async function refreshWarrantyPackSnapshot(
  supabase: SupabaseClient
): Promise<{ row_count: number; refresh_ms: number; refreshed_at: string }> {
  const { data, error } = await supabase.rpc('refresh_warranty_pack_snapshot');
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as { row_count?: number; refresh_ms?: number; refreshed_at?: string };
  return {
    row_count: Number(row.row_count ?? 0),
    refresh_ms: Number(row.refresh_ms ?? 0),
    refreshed_at: String(row.refreshed_at ?? new Date().toISOString()),
  };
}

export async function fetchWarrantyPackExportFromSnapshot(
  supabase: SupabaseClient
): Promise<
  Array<{
    os_label: string | null;
    main_serial: string | null;
    technology_name: string;
    brand_name: string;
    model_name: string;
    dispatched_at: string | null;
    warranty_ends_at: string | null;
    warranty_status: string;
    warranty_profile: string | null;
    elegible: boolean;
  }>
> {
  const { data, error } = await supabase
    .from('warranty_pack_os_snapshot')
    .select(
      'os_label, main_serial, technology_name, brand_name, model_name, dispatched_at, warranty_ends_at, warranty_status, warranty_profile, elegible'
    )
    .order('dispatched_at', { ascending: false, nullsFirst: false })
    .limit(50_000);

  if (error) throw new Error(error.message);
  return data ?? [];
}
