import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addWarrantyDays,
  resolveWarrantyDispatchProfile,
  warrantyStatusAt,
  WARRANTY_PERIOD_DAYS,
  type WarrantyDispatchProfile,
} from '../domain/warrantyPolicy';

const DEVUELTO_STATUSES = ['DEVUELTO', 'DEVUELTO_A_AGENCIA', 'DEVUELTO_BLOQUE'];

export type WarrantyBreakdownRow = {
  id: string;
  label: string;
  enGarantia: number;
  vencida: number;
  total: number;
};

export type WarrantyOsExportRow = {
  osLabel: string;
  mainSerial: string;
  technology: string;
  brand: string;
  model: string;
  dispatchedAt: string;
  warrantyEndsAt: string;
  warrantyStatus: 'en_garantia' | 'vencida' | 'na';
  profile: string;
  elegibleGarantia: 'Sí' | 'No';
};

export type WarrantyPackResult = {
  periodDays: number;
  totalOsDespachadas: number;
  osConFechaDespacho: number;
  osSinFechaDespacho: number;
  enGarantia: number;
  vencida: number;
  elegiblesDespachados: number;
  reingresosGarantia: number;
  reingresosEnVentana90: number;
  noElegiblesPerfil?: number;
  byTechnology: WarrantyBreakdownRow[];
  byModel: WarrantyBreakdownRow[];
  trendByMonth?: Array<{
    period: string;
    despachadas: number;
    elegibles: number;
    enGarantia: number;
    vencida: number;
  }>;
  computedAt: string;
};

type PrediagRow = {
  service_order_id: string;
  clase_carcasa: string;
  dictamen: string | null;
};

type OsRow = {
  id: string;
  os_label: string | null;
  closed_at: string | null;
  model_id: string | null;
  brand_id: string | null;
  main_serial: string | null;
  status: string | null;
};

function isDevueltoStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toUpperCase().trim();
  return DEVUELTO_STATUSES.some((d) => s === d || s.includes(d));
}

function isDespachadoStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toUpperCase().trim();
  return s === 'DESPACHADO' || s === 'CERRADO' || s.includes('DESPACHADO');
}

/** Misma base que `despachado_os` en count_os_inventory_modules (mig 157/228). */
export async function collectDispatchedOsIds(supabase: SupabaseClient): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; from < 25_000; from += pageSize) {
    const { data, error } = await supabase
      .from('service_orders')
      .select('id, status')
      .or('status.eq.DESPACHADO,status.eq.CERRADO,status.ilike.%DESPACHADO%')
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (isDevueltoStatus(row.status)) continue;
      if (isDespachadoStatus(row.status)) ids.add(String(row.id));
    }
    if (data.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('series')
      .select('service_order_id')
      .eq('current_status', 'dispatched')
      .not('service_order_id', 'is', null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(String(row.service_order_id));
    }
    if (data.length < pageSize) break;
  }

  if (!ids.size) return ids;

  const devuelto = new Set<string>();
  const idList = [...ids];
  for (let i = 0; i < idList.length; i += 200) {
    const chunk = idList.slice(i, i + 200);
    const { data } = await supabase.from('service_orders').select('id, status').in('id', chunk);
    for (const row of data ?? []) {
      if (isDevueltoStatus(row.status)) devuelto.add(String(row.id));
    }
  }
  for (const id of devuelto) ids.delete(id);

  return ids;
}

async function loadOsRows(supabase: SupabaseClient, osIds: string[]): Promise<OsRow[]> {
  const rows: OsRow[] = [];
  for (let i = 0; i < osIds.length; i += 200) {
    const chunk = osIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from('service_orders')
      .select('id, os_label, closed_at, model_id, brand_id, main_serial, status')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as OsRow[]));
  }
  return rows;
}

async function loadDispatchAtByOsId(
  supabase: SupabaseClient,
  osIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!osIds.length) return out;

  for (let i = 0; i < osIds.length; i += 100) {
    const chunk = osIds.slice(i, i + 100);
    const { data: seriesRows } = await supabase
      .from('series')
      .select('id, service_order_id')
      .in('service_order_id', chunk);

    const seriesIds = (seriesRows ?? []).map((s) => String(s.id));
    const seriesToOs = new Map(
      (seriesRows ?? []).map((s) => [String(s.id), String(s.service_order_id)])
    );

    if (!seriesIds.length) continue;

    for (let j = 0; j < seriesIds.length; j += 150) {
      const sChunk = seriesIds.slice(j, j + 150);
      const { data: diRows } = await supabase
        .from('dispatch_items')
        .select('series_id, created_at, dispatches:dispatch_id(dispatched_at)')
        .in('series_id', sChunk);

      for (const row of diRows ?? []) {
        const osId = seriesToOs.get(String(row.series_id));
        if (!osId) continue;
        const d = Array.isArray(
          (row as { dispatches?: { dispatched_at?: string }[] }).dispatches
        )
          ? (row as { dispatches: { dispatched_at?: string }[] }).dispatches[0]
          : (row as { dispatches?: { dispatched_at?: string } }).dispatches;
        const at =
          d?.dispatched_at ||
          (row as { created_at?: string }).created_at ||
          null;
        if (!at) continue;
        const prev = out.get(osId);
        if (!prev || new Date(at).getTime() > new Date(prev).getTime()) {
          out.set(osId, at);
        }
      }
    }
  }

  return out;
}

async function loadAuditFlagsByOs(
  supabase: SupabaseClient,
  osIds: string[]
): Promise<Map<string, { hadRepairCompleted: boolean; hadQcOrReacondCompleted: boolean }>> {
  const out = new Map<string, { hadRepairCompleted: boolean; hadQcOrReacondCompleted: boolean }>();
  if (!osIds.length) return out;

  for (let i = 0; i < osIds.length; i += 100) {
    const chunk = osIds.slice(i, i + 100);
    const { data: seriesRows } = await supabase
      .from('series')
      .select('id, service_order_id')
      .in('service_order_id', chunk);

    const seriesToOs = new Map<string, string>();
    for (const row of seriesRows ?? []) {
      if (row.service_order_id) seriesToOs.set(String(row.id), String(row.service_order_id));
    }

    const recordIds = [...seriesToOs.keys()];
    for (let j = 0; j < recordIds.length; j += 200) {
      const rChunk = recordIds.slice(j, j + 200);
      const { data: audits } = await supabase
        .from('erp_audit_logs')
        .select('record_id, action')
        .in('record_id', rChunk)
        .limit(4000);

      for (const row of audits ?? []) {
        const osId = seriesToOs.get(String(row.record_id));
        if (!osId) continue;
        const slot = out.get(osId) ?? { hadRepairCompleted: false, hadQcOrReacondCompleted: false };
        const action = String(row.action ?? '').toUpperCase();
        if (action.includes('REPARACIÓN COMPLETADA') || action.includes('REPARACION COMPLETADA')) {
          slot.hadRepairCompleted = true;
        }
        if (
          action.includes('CONTROL DE CALIDAD COMPLETADO') ||
          action.includes('REACONDICIONADO COMPLETADO') ||
          action.includes('REACONDICIÓN COMPLETADA')
        ) {
          slot.hadQcOrReacondCompleted = true;
        }
        out.set(osId, slot);
      }
    }
  }

  return out;
}

function aggregateBreakdown(
  rows: Array<{
    techId: string;
    techLabel: string;
    modelId: string;
    modelLabel: string;
    status: 'en_garantia' | 'vencida';
  }>,
  dimension: 'technology' | 'model'
): WarrantyBreakdownRow[] {
  const map = new Map<string, WarrantyBreakdownRow>();
  for (const row of rows) {
    const id = dimension === 'technology' ? row.techId : row.modelId;
    const label = dimension === 'technology' ? row.techLabel : row.modelLabel;
    const slot = map.get(id) ?? { id, label, enGarantia: 0, vencida: 0, total: 0 };
    slot.total += 1;
    if (row.status === 'en_garantia') slot.enGarantia += 1;
    else slot.vencida += 1;
    map.set(id, slot);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'es'));
}

async function loadCatalogMaps(supabase: SupabaseClient) {
  const [{ data: brands }, { data: models }, { data: techs }] = await Promise.all([
    supabase.from('brands').select('id, name'),
    supabase.from('models').select('id, name, technology_id, brand_id'),
    supabase.from('technologies').select('id, name'),
  ]);
  return {
    brandMap: new Map((brands ?? []).map((b) => [String(b.id), String(b.name)])),
    modelMap: new Map(
      (models ?? []).map((m) => [
        String(m.id),
        {
          name: String(m.name),
          technology_id: m.technology_id as string | null,
          brand_id: m.brand_id as string | null,
        },
      ])
    ),
    techMap: new Map((techs ?? []).map((t) => [String(t.id), String(t.name)])),
  };
}

async function loadPrediagByOs(
  supabase: SupabaseClient,
  osIds: string[]
): Promise<Map<string, PrediagRow>> {
  const map = new Map<string, PrediagRow>();
  for (let i = 0; i < osIds.length; i += 200) {
    const chunk = osIds.slice(i, i + 200);
    const { data } = await supabase
      .from('prediagnosticos')
      .select('service_order_id, clase_carcasa, dictamen')
      .in('service_order_id', chunk);
    for (const row of data ?? []) {
      map.set(String(row.service_order_id), row as PrediagRow);
    }
  }
  return map;
}

type ProcessedOs = {
  os: OsRow;
  dispatchIso: string | null;
  profile: WarrantyDispatchProfile | null;
  techId: string;
  techLabel: string;
  modelId: string;
  modelLabel: string;
  brandLabel: string;
};

async function processDispatchedOs(
  supabase: SupabaseClient,
  now: Date
): Promise<{ processed: ProcessedOs[]; reingresosGarantia: number; reingresosEnVentana90: number }> {
  const osIdSet = await collectDispatchedOsIds(supabase);
  const osIds = [...osIdSet];
  const [osRows, dispatchByOs, auditByOs, predByOs, catalogs] = await Promise.all([
    loadOsRows(supabase, osIds),
    loadDispatchAtByOsId(supabase, osIds),
    loadAuditFlagsByOs(supabase, osIds),
    loadPrediagByOs(supabase, osIds),
    loadCatalogMaps(supabase),
  ]);

  const profileCache = new Map<string, WarrantyDispatchProfile | null>();
  function profileForOs(osId: string): WarrantyDispatchProfile | null {
    if (profileCache.has(osId)) return profileCache.get(osId)!;
    const pred = predByOs.get(osId);
    const flags = auditByOs.get(osId) ?? { hadRepairCompleted: false, hadQcOrReacondCompleted: false };
    const profile = resolveWarrantyDispatchProfile({
      claseCarcasa: pred?.clase_carcasa ?? null,
      dictamen: pred?.dictamen ?? null,
      ...flags,
    });
    profileCache.set(osId, profile);
    return profile;
  }

  const processed: ProcessedOs[] = osRows.map((os) => {
    const osId = String(os.id);
    const dispatchIso = dispatchByOs.get(osId) || (os.closed_at ? String(os.closed_at) : null);
    const modelId = String(os.model_id || 'unknown');
    const modelMeta = catalogs.modelMap.get(modelId);
    const techId = String(modelMeta?.technology_id || 'unknown');
    return {
      os,
      dispatchIso,
      profile: profileForOs(osId),
      techId,
      techLabel: catalogs.techMap.get(techId) || 'Sin tecnología',
      modelId,
      modelLabel: modelMeta?.name || 'Sin modelo',
      brandLabel:
        catalogs.brandMap.get(String(os.brand_id || modelMeta?.brand_id || 'unknown')) || '—',
    };
  });

  const since = new Date(now.getTime());
  since.setUTCDate(since.getUTCDate() - 400);

  const { count: reingresosGarantia } = await supabase
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .eq('ingress_kind', 'garantia')
    .gte('created_at', since.toISOString());

  const { data: recentReentries } = await supabase
    .from('service_orders')
    .select('id, created_at, warranty_basis_dispatch_at, reentry_count')
    .gt('reentry_count', 1)
    .gte('created_at', since.toISOString())
    .limit(8000);

  let reingresosEnVentana90 = 0;
  for (const row of recentReentries ?? []) {
    const basis = row.warranty_basis_dispatch_at;
    if (!basis) continue;
    const dispatchAt = new Date(basis);
    const ingressAt = new Date(row.created_at);
    const end = addWarrantyDays(dispatchAt, WARRANTY_PERIOD_DAYS);
    if (ingressAt >= dispatchAt && ingressAt <= end) reingresosEnVentana90 += 1;
  }

  return {
    processed,
    reingresosGarantia: reingresosGarantia ?? 0,
    reingresosEnVentana90,
  };
}

export async function computeWarrantyPack(
  supabase: SupabaseClient,
  now = new Date()
): Promise<WarrantyPackResult> {
  const { processed, reingresosGarantia, reingresosEnVentana90 } = await processDispatchedOs(
    supabase,
    now
  );

  let osConFecha = 0;
  let osSinFecha = 0;
  let enGarantia = 0;
  let vencida = 0;
  const eligibleForBreakdown: Array<{
    techId: string;
    techLabel: string;
    modelId: string;
    modelLabel: string;
    status: 'en_garantia' | 'vencida';
  }> = [];

  for (const row of processed) {
    if (!row.dispatchIso) {
      osSinFecha += 1;
      continue;
    }
    osConFecha += 1;
    if (!row.profile) continue;

    const dispatchedAt = new Date(row.dispatchIso);
    if (Number.isNaN(dispatchedAt.getTime())) continue;

    const status = warrantyStatusAt(dispatchedAt, now);
    if (status === 'en_garantia') enGarantia += 1;
    else vencida += 1;

    eligibleForBreakdown.push({
      techId: row.techId,
      techLabel: row.techLabel,
      modelId: row.modelId,
      modelLabel: row.modelLabel,
      status,
    });
  }

  return {
    periodDays: WARRANTY_PERIOD_DAYS,
    totalOsDespachadas: processed.length,
    osConFechaDespacho: osConFecha,
    osSinFechaDespacho: osSinFecha,
    enGarantia,
    vencida,
    elegiblesDespachados: enGarantia + vencida,
    reingresosGarantia,
    reingresosEnVentana90,
    byTechnology: aggregateBreakdown(eligibleForBreakdown, 'technology'),
    byModel: aggregateBreakdown(eligibleForBreakdown, 'model'),
    computedAt: now.toISOString(),
  };
}

export async function computeWarrantyPackExportRows(
  supabase: SupabaseClient,
  now = new Date()
): Promise<WarrantyOsExportRow[]> {
  const { processed } = await processDispatchedOs(supabase, now);

  return processed.map((row) => {
    const profileLabel =
      row.profile === 'bueno' ? 'Bueno (B)' : row.profile === 'listo' ? 'Equipo Listo' : '—';
    const elegible = row.profile ? ('Sí' as const) : ('No' as const);

    if (!row.dispatchIso || !row.profile) {
      return {
        osLabel: String(row.os.os_label || '—'),
        mainSerial: String(row.os.main_serial || '—'),
        technology: row.techLabel,
        brand: row.brandLabel,
        model: row.modelLabel,
        dispatchedAt: row.dispatchIso || '',
        warrantyEndsAt: '',
        warrantyStatus: 'na' as const,
        profile: profileLabel,
        elegibleGarantia: elegible,
      };
    }

    const dispatchedAt = new Date(row.dispatchIso);
    const warrantyEndsAt = addWarrantyDays(dispatchedAt, WARRANTY_PERIOD_DAYS);
    const warrantyStatus = warrantyStatusAt(dispatchedAt, now);

    return {
      osLabel: String(row.os.os_label || '—'),
      mainSerial: String(row.os.main_serial || '—'),
      technology: row.techLabel,
      brand: row.brandLabel,
      model: row.modelLabel,
      dispatchedAt: dispatchedAt.toISOString(),
      warrantyEndsAt: warrantyEndsAt.toISOString(),
      warrantyStatus,
      profile: profileLabel,
      elegibleGarantia: elegible,
    };
  });
}
