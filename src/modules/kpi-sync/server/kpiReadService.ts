import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardMetrics } from '@/lib/database/kpi';
import {
  countCacTrayOsInStatuses,
  countInventoryDetailOs,
} from './countDistinctOs';
import { fechasEnRango, resolveTimeRangeBounds } from './timeRange';

export type WorkshopOsByStage = {
  diagnostico: number;
  reparacion: number;
  reacondicionado: number;
  qc: number;
  l3: number;
  scraps: number;
};

export type PipelineSnapshot = {
  recepcion: number;
  backoffice: number;
  taller: number;
  bodega: number;
  despacho: number;
  workshopOs: WorkshopOsByStage;
  refreshedAt: string | null;
};

function readWorkshopOsFromMap(map: Record<string, number>): WorkshopOsByStage {
  return {
    diagnostico: map.os_diagnostico ?? 0,
    reparacion: map.os_reparacion ?? 0,
    reacondicionado: map.os_reacondicionado ?? 0,
    qc: map.os_qc ?? 0,
    l3: map.os_l3 ?? 0,
    scraps: map.os_scraps ?? 0,
  };
}

function readTechNameFromSeriesRow(row: {
  models?: { technologies?: { name?: string } | null } | { technologies?: { name?: string } | null }[] | null;
}): string {
  const models = row.models;
  const model = Array.isArray(models) ? models[0] : models;
  const raw = model?.technologies?.name;
  if (!raw) return 'GENERICO';
  return raw.trim().toUpperCase() || 'GENERICO';
}

/** Equipos procesados en el rango, agrupados por tecnología (models → technologies). */
export async function readProductionByTechnology(
  supabase: SupabaseClient,
  timeRange: string
): Promise<{ name: string; count: number }[]> {
  const { startIso, endIso } = resolveTimeRangeBounds(timeRange);

  const { data: series, error } = await supabase
    .from('series')
    .select('id, models(technologies(name))')
    .gte('updated_at', startIso)
    .lte('updated_at', endIso);

  if (error || !series?.length) return [];

  const counts: Record<string, number> = {};
  for (const row of series) {
    const tech = readTechNameFromSeriesRow(row as Parameters<typeof readTechNameFromSeriesRow>[0]);
    counts[tech] = (counts[tech] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export async function readDashboardMetricsFromKpi(
  supabase: SupabaseClient,
  timeRange: string
): Promise<DashboardMetrics | null> {
  const fechas = fechasEnRango(timeRange);
  if (fechas.length === 0) return null;

  const { data: diario, error } = await supabase
    .from('kpi_diario')
    .select('fecha, proceso, metrica, valor')
    .in('fecha', fechas);

  if (error) return null;

  const productionMetrics = new Set([
    'diagnosticos_completados',
    'reparaciones_completadas',
    'reacondicionados_completados',
    'qc_completados',
  ]);

  let totalProduction = 0;
  let qcTotal = 0;
  let qcFailed = 0;

  for (const row of diario) {
    const val = Number(row.valor ?? 0);
    if (row.proceso === 'taller' && productionMetrics.has(row.metrica)) {
      totalProduction += val;
    }
    if (row.metrica === 'qc_completados') qcTotal += val;
    if (row.metrica === 'qc_rechazados') qcFailed += val;
  }

  const { data: usuarios } = await supabase
    .from('kpi_usuario')
    .select('user_id, valor')
    .in('fecha', fechas)
    .gt('valor', 0);

  const activeTechnicians = new Set((usuarios ?? []).map((u) => u.user_id)).size;

  const errorRate = qcTotal > 0 ? parseFloat(((qcFailed / qcTotal) * 100).toFixed(1)) : 0;

  const productionByBrand = await readProductionByTechnology(supabase, timeRange);

  return {
    totalProduction,
    activeTechnicians,
    errorRate,
    productionByBrand,
  };
}

export async function readPipelineFromKpi(supabase: SupabaseClient): Promise<PipelineSnapshot | null> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Lectura rápida desde proyección (el sync escribe OS; Bodega = Detalle Inventario).
  // No pagear series aquí: provoca input delay / renders largos en el dashboard.
  const { data, error } = await supabase
    .from('kpi_proceso')
    .select('metrica, valor, refreshed_at')
    .eq('fecha', today);

  if (error || !data?.length) return null;

  const map = Object.fromEntries(data.map((r) => [r.metrica, Number(r.valor ?? 0)]));
  const refreshedAt = data.reduce<string | null>((max, r) => {
    if (!r.refreshed_at) return max;
    if (!max || r.refreshed_at > max) return r.refreshed_at;
    return max;
  }, null);

  // Bodega + Backoffice en vivo (OS). Evita wip_* stale/inflado en kpi_proceso.
  let bodegaOs = map.wip_bodega ?? 0;
  let backofficeOs = map.wip_backoffice ?? 0;
  try {
    const [bodegaLive, backofficeLive] = await Promise.all([
      countInventoryDetailOs(supabase),
      countCacTrayOsInStatuses(supabase, ['RECEPCIONADO_BODEGA_GENERAL']),
    ]);
    bodegaOs = bodegaLive;
    backofficeOs = backofficeLive;
  } catch {
    /* conservar proyección */
  }

  return {
    recepcion: map.wip_recepcion ?? 0,
    backoffice: backofficeOs,
    taller: map.wip_taller ?? 0,
    bodega: bodegaOs,
    despacho: map.wip_despacho ?? 0,
    workshopOs: readWorkshopOsFromMap(map),
    refreshedAt,
  };
}

export async function kpiProjectionsAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { count, error } = await supabase
    .from('kpi_diario')
    .select('fecha', { count: 'exact', head: true })
    .limit(1);
  return !error && (count ?? 0) > 0;
}
