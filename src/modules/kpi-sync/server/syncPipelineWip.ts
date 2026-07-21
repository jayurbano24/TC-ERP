import type { SupabaseClient } from '@supabase/supabase-js';
import { rpcInternal } from '@/lib/supabase/rpcInternal';
import { fechaEnGuatemala } from './timeRange';
import type { SyncRunResult } from './types';
import {
  countCacTrayOsInStatuses,
  countDistinctOsByStatus,
  countInventoryDetailOs,
} from './countDistinctOs';

const PROCESS_ID = 'kpi_pipeline_wip';

async function upsertProcesoMetric(
  supabase: SupabaseClient,
  fecha: string,
  metrica: string,
  valor: number
) {
  await supabase.from('kpi_proceso').upsert(
    {
      fecha,
      metrica,
      valor,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: 'fecha,metrica' }
  );
}

/**
 * Pipeline WIP: wip_* = OS distintos.
 * Bodega = count_inventory_detail_os (misma regla que Detalle de Inventario).
 */
export async function runKpiPipelineWipSync(supabase: SupabaseClient): Promise<SyncRunResult> {
  const fecha = fechaEnGuatemala(new Date().toISOString());

  await rpcInternal(supabase, 'refresh_enterprise_summary_views').then(({ error }) => {
    if (
      error &&
      error.code !== '42883' &&
      error.code !== 'PGRST202' &&
      error.code !== 'PGRST106'
    ) {
      console.warn('[kpi_pipeline_wip] MV refresh:', error.message);
    }
  });

  const { data: mv, error: mvError } = await supabase
    .from('mv_dashboard')
    .select('taller_diagnostico_os, taller_reparacion_os, series_movidas_hoy')
    .eq('snapshot_id', 1)
    .maybeSingle();

  if (mvError && mvError.code !== 'PGRST116') {
    return {
      processId: PROCESS_ID,
      status: 'error',
      rowsRead: 0,
      rowsAffected: 0,
      error: mvError.message,
    };
  }

  const { data: workshopRows } = await supabase.from('mv_workshop').select('status, os_count');

  const workshopStatuses = new Set([
    'in_workshop',
    'in_qc',
    'in_validation',
    'ready_to_dispatch',
    'irreparable',
    'scrapped',
  ]);

  const tallerFromMv =
    workshopRows?.reduce((acc, row) => {
      if (!workshopStatuses.has(row.status)) return acc;
      return acc + Number(row.os_count ?? 0);
    }, 0) ?? 0;

  const tallerWip =
    tallerFromMv > 0
      ? tallerFromMv
      : Number(mv?.taller_diagnostico_os ?? 0) + Number(mv?.taller_reparacion_os ?? 0);

  // Backoffice = OS en bandeja pendientes de ingreso bodega.
  // No incluir `in_validation` (eso es QC de Taller).
  const [recepcionOs, backofficeOs, bodegaOs, despachoOs] = await Promise.all([
    countDistinctOsByStatus(supabase, 'INGRESADO'),
    countCacTrayOsInStatuses(supabase, ['RECEPCIONADO_BODEGA_GENERAL']),
    countInventoryDetailOs(supabase),
    countDistinctOsByStatus(supabase, 'dispatched'),
  ]);

  const metrics: Array<[string, number]> = [
    ['wip_recepcion', recepcionOs],
    ['wip_backoffice', backofficeOs],
    ['wip_taller', tallerWip],
    ['wip_bodega', bodegaOs],
    ['wip_despacho', despachoOs],
    ['series_movidas_hoy', Number(mv?.series_movidas_hoy ?? 0)],
  ];

  const { data: tabCounts } = await supabase.rpc('count_workshop_os_all_tabs');
  if (tabCounts && typeof tabCounts === 'object') {
    const c = tabCounts as Record<string, number>;
    metrics.push(
      ['os_diagnostico', Number(c.diagnostico ?? 0)],
      ['os_reparacion', Number(c.reparacion ?? 0)],
      ['os_reacondicionado', Number(c.reacondicionado ?? 0)],
      ['os_qc', Number(c.qc ?? 0)],
      ['os_l3', Number(c.l3 ?? 0)],
      ['os_scraps', Number(c.scraps ?? 0)]
    );
  }

  for (const [metrica, valor] of metrics) {
    await upsertProcesoMetric(supabase, fecha, metrica, valor);
  }

  await supabase.from('sync_watermarks').upsert({
    process_id: PROCESS_ID,
    cursor_ts: new Date().toISOString(),
    cursor_id: null,
    rows_processed: metrics.length,
    updated_at: new Date().toISOString(),
  });

  return {
    processId: PROCESS_ID,
    status: 'success',
    rowsRead: metrics.length,
    rowsAffected: metrics.length,
    metadata: {
      fecha,
      metrics: Object.fromEntries(metrics),
      unit: 'os',
      bodegaSource: 'inventory_detail',
    },
  };
}
