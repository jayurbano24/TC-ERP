import type { SupabaseClient } from '@supabase/supabase-js';

export type BICostRow = {
  tech: string;
  condition: string;
  price: number;
  quantity: number;
};

const BI_PRICING_TABLE: Omit<BICostRow, 'quantity'>[] = [
  { tech: 'EMTA', condition: 'REACONDICIONADO', price: 2.78 },
  { tech: 'EMTA', condition: 'REPARADO', price: 4.32 },
  { tech: 'STB-HFC', condition: 'REACONDICIONADO', price: 2.78 },
  { tech: 'STB-HFC', condition: 'REPARADO', price: 3.64 },
  { tech: 'ONT', condition: 'REACONDICIONADO', price: 2.78 },
  { tech: 'ONT', condition: 'REPARADO', price: 3.64 },
  { tech: 'DTH', condition: 'REACONDICIONADO', price: 4.97 },
  { tech: 'DTH', condition: 'REPARADO', price: 5.97 },
  { tech: 'IPTV', condition: 'REACONDICIONADO', price: 2.78 },
  { tech: 'IPTV', condition: 'REPARADO', price: 3.64 },
  { tech: 'SWITCH', condition: 'REACONDICIONADO', price: 2.16 },
  { tech: 'XDSL', condition: 'REACONDICIONADO', price: 3.64 },
  { tech: 'XDSL', condition: 'REPARADO', price: 3.64 },
];

const PATH_ACTIONS = [
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'DIAGNÓSTICO INICIAL COMPLETADO',
] as const;

const LISTO_CLOSE_ACTIONS = [
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
] as const;

function emptyTable(): BICostRow[] {
  return BI_PRICING_TABLE.map((r) => ({ ...r, quantity: 0 }));
}

export function getTimeRangeBounds(timeRange: string): { startIso: string; endIso: string } {
  const startOfRange = new Date();
  const endOfRange = new Date();

  if (timeRange === 'Ayer') {
    startOfRange.setDate(startOfRange.getDate() - 1);
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setDate(endOfRange.getDate() - 1);
    endOfRange.setHours(23, 59, 59, 999);
  } else if (timeRange === 'Esta Semana') {
    const day = startOfRange.getDay();
    const diff = startOfRange.getDate() - day + (day === 0 ? -6 : 1);
    startOfRange.setDate(diff);
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setHours(23, 59, 59, 999);
  } else if (timeRange === 'Este Mes') {
    startOfRange.setDate(1);
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setHours(23, 59, 59, 999);
  } else {
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setHours(23, 59, 59, 999);
  }

  return { startIso: startOfRange.toISOString(), endIso: endOfRange.toISOString() };
}

function resolveBIPricingTech(raw: string | null | undefined): string | null {
  const u = String(raw || '').trim().toUpperCase();
  if (!u) return null;
  if (u.includes('EMTA')) return 'EMTA';
  if (u.includes('STB') || u.includes('HFC')) return 'STB-HFC';
  if (u.includes('ONT') || u.includes('GPON')) return 'ONT';
  if (u.includes('DTH')) return 'DTH';
  if (u.includes('IPTV')) return 'IPTV';
  if (u.includes('SWITCH')) return 'SWITCH';
  if (u.includes('XDSL') || u.includes('ADSL') || u.includes('DSL')) return 'XDSL';
  return null;
}

function isEquipoListoPayload(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const result = String(payload.result || '').toLowerCase();
  const next = String(payload.nextStatus || payload.next_status || '').toLowerCase();
  return result === 'listo' || next === 'in_central_warehouse';
}

function bump(table: BICostRow[], tech: string, condition: string) {
  const row = table.find((r) => r.tech === tech && r.condition === condition);
  if (row) row.quantity += 1;
}

async function loadTechByModelId(
  supabase: SupabaseClient,
  modelIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (modelIds.length === 0) return map;

  for (let i = 0; i < modelIds.length; i += 80) {
    const chunk = modelIds.slice(i, i + 80);
    const { data: models } = await supabase
      .from('models')
      .select('id, name, technology_id')
      .in('id', chunk);

    const techIds = [
      ...new Set((models || []).map((m) => m.technology_id).filter(Boolean) as string[]),
    ];
    const techNameById = new Map<string, string>();
    if (techIds.length > 0) {
      const { data: techs } = await supabase
        .from('technologies')
        .select('id, name')
        .in('id', techIds);
      for (const t of techs || []) {
        techNameById.set(String(t.id), String(t.name || ''));
      }
    }

    for (const m of models || []) {
      const techName =
        (m.technology_id && techNameById.get(String(m.technology_id))) ||
        String(m.name || '');
      map.set(String(m.id), techName);
    }
  }
  return map;
}

/** Misma fuente que pestaña Equipo Listo del Taller. */
async function collectEquipoListoOsIds(supabase: SupabaseClient): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  const pageLimit = 50;

  for (let page = 0; page < 100 && ids.length < 5_000; page++) {
    const rpcResult = await supabase.rpc('workshop_list_listo_os_page', {
      p_cursor: cursor,
      p_limit: pageLimit + 1,
    });
    const data = (rpcResult.data || null) as
      | Array<{ service_order_id?: string; sort_ts?: string }>
      | null;
    if (rpcResult.error || !Array.isArray(data) || data.length === 0) break;

    const hasMore = data.length > pageLimit;
    const slice = hasMore ? data.slice(0, pageLimit) : data;
    for (const row of slice) {
      const osId = String(row.service_order_id || '');
      if (osId) ids.push(osId);
    }
    if (!hasMore) break;
    cursor = String(slice[slice.length - 1]?.sort_ts || '') || null;
    if (!cursor) break;
  }

  return [...new Set(ids)];
}

type SeriesLite = {
  id: string;
  service_order_id: string | null;
  model_id: string | null;
};

async function classifyOsPaths(
  supabase: SupabaseClient,
  seriesByOs: Map<string, SeriesLite[]>
): Promise<Map<string, 'REACONDICIONADO' | 'REPARADO'>> {
  const pathByOs = new Map<string, 'REACONDICIONADO' | 'REPARADO'>();
  const allSeriesIds = [...seriesByOs.values()].flat().map((s) => s.id);

  for (let i = 0; i < allSeriesIds.length; i += 40) {
    const chunk = allSeriesIds.slice(i, i + 40);
    const { data } = await supabase
      .from('erp_audit_logs')
      .select('record_id, action, created_at, new_values')
      .in('record_id', chunk)
      .in('action', [...PATH_ACTIONS])
      .order('created_at', { ascending: false })
      .limit(3000);

    // series → os
    const osOfSeries = new Map<string, string>();
    for (const [osId, rows] of seriesByOs) {
      for (const s of rows) osOfSeries.set(s.id, osId);
    }

    for (const row of data || []) {
      const sid = String(row.record_id || '');
      const osId = osOfSeries.get(sid);
      if (!osId || pathByOs.has(osId)) continue;

      const action = String(row.action || '');
      const payload = (row.new_values || {}) as Record<string, unknown>;

      // Cierre a listo manda: Reacondicionado vs QC (Reparación).
      if (action === 'REACONDICIONADO COMPLETADO' && isEquipoListoPayload(payload)) {
        pathByOs.set(osId, 'REACONDICIONADO');
        continue;
      }
      if (action === 'CONTROL DE CALIDAD COMPLETADO' && isEquipoListoPayload(payload)) {
        pathByOs.set(osId, 'REPARADO');
        continue;
      }
      if (action === 'REACONDICIONADO COMPLETADO') {
        pathByOs.set(osId, 'REACONDICIONADO');
        continue;
      }
      if (action === 'CONTROL DE CALIDAD COMPLETADO' || action === 'REPARACIÓN COMPLETADA') {
        pathByOs.set(osId, 'REPARADO');
        continue;
      }
      if (action === 'DIAGNÓSTICO INICIAL COMPLETADO') {
        const result = String(payload.result || '').toLowerCase();
        if (result === 'reparacion') pathByOs.set(osId, 'REPARADO');
        else if (result === 'reacondicionado') pathByOs.set(osId, 'REACONDICIONADO');
      }
    }
  }

  return pathByOs;
}

/**
 * Arribo a Equipo Listo por OS dentro del periodo (auditoría).
 */
async function loadListoArrivalOsInRange(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<Set<string>> {
  const arrived = new Set<string>();
  const pageSize = 1000;
  const seriesIds: string[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('erp_audit_logs')
      .select('record_id, new_values')
      .in('action', [...LISTO_CLOSE_ACTIONS])
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) break;
    const chunk = data || [];
    for (const row of chunk) {
      if (!isEquipoListoPayload(row.new_values as Record<string, unknown>)) continue;
      if (row.record_id) seriesIds.push(String(row.record_id));
    }
    if (chunk.length < pageSize) break;
  }

  for (let i = 0; i < seriesIds.length; i += 80) {
    const chunk = seriesIds.slice(i, i + 80);
    const { data } = await supabase
      .from('series')
      .select('id, service_order_id')
      .in('id', chunk);
    for (const s of data || []) {
      if (s.service_order_id) arrived.add(String(s.service_order_id));
    }
  }
  return arrived;
}

/**
 * Desglose BI alineado a Equipo Listo del Taller (misma RPC).
 * - Cantidad = OS en cola Equipo Listo (SSOT Taller).
 * - Condición = ruta Reacondicionado vs Reparación/QC.
 * - Filtro de periodo: solo OS de esa cola cuyo arribo a Listo cayó en el rango
 *   (si ninguna tiene arribo fechado, se cuenta toda la cola para no quedar en 0).
 */
export async function computeBICostBreakdown(
  supabase: SupabaseClient,
  timeRange: string
): Promise<{ rows: BICostRow[]; source: string; countedOs: number }> {
  const table = emptyTable();
  const rangeKey =
    timeRange === 'Hoy' ||
    timeRange === 'Ayer' ||
    timeRange === 'Esta Semana' ||
    timeRange === 'Este Mes'
      ? timeRange
      : 'Este Mes';
  const { startIso, endIso } = getTimeRangeBounds(rangeKey);

  const listoOsIds = await collectEquipoListoOsIds(supabase);
  if (listoOsIds.length === 0) {
    return { rows: table, source: 'empty', countedOs: 0 };
  }

  const arrivedInRange = await loadListoArrivalOsInRange(supabase, startIso, endIso);
  // Intersección: evita contar OS que ya salieron de Equipo Listo (el +1 vs Taller).
  let targetOsIds = listoOsIds.filter((id) => arrivedInRange.has(id));
  // Si el periodo no trae arribos auditados pero sí hay cola, usar la cola completa (SSOT).
  if (targetOsIds.length === 0) {
    targetOsIds = listoOsIds;
  }

  const seriesByOs = new Map<string, SeriesLite[]>();
  for (let i = 0; i < targetOsIds.length; i += 80) {
    const chunk = targetOsIds.slice(i, i + 80);
    const { data } = await supabase
      .from('series')
      .select('id, service_order_id, model_id')
      .in('service_order_id', chunk)
      .eq('current_status', 'in_central_warehouse');
    for (const row of (data || []) as SeriesLite[]) {
      const osId = String(row.service_order_id || '');
      if (!osId) continue;
      const list = seriesByOs.get(osId) || [];
      list.push(row);
      seriesByOs.set(osId, list);
    }
  }

  const modelIds = [
    ...new Set(
      [...seriesByOs.values()]
        .flat()
        .map((s) => s.model_id)
        .filter(Boolean) as string[]
    ),
  ];
  const techByModel = await loadTechByModelId(supabase, modelIds);
  const pathByOs = await classifyOsPaths(supabase, seriesByOs);

  let counted = 0;
  for (const osId of targetOsIds) {
    const seriesList = seriesByOs.get(osId);
    if (!seriesList?.length) continue;
    const condition = pathByOs.get(osId) || 'REPARADO';
    const techRaw = seriesList[0]?.model_id
      ? techByModel.get(seriesList[0].model_id)
      : null;
    const tech = resolveBIPricingTech(techRaw) || 'ONT';
    bump(table, tech, condition);
    counted += 1;
  }

  return {
    rows: table,
    source: 'equipo_listo_ssot',
    countedOs: counted,
  };
}
