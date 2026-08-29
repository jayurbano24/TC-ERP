import type { SupabaseClient } from '@supabase/supabase-js';

export type OsInventoryModules = {
  total: number;
  con_serie: number;
  sin_series: number;
  bodega_con_caja: number;
  /** @deprecated Stock suelto no se reporta; usar pistoleo_en_curso. */
  bodega_sin_caja: number;
  /** Series en cajas TMP / EN_PROCESO (pistoleo activo). */
  pistoleo_en_curso: number;
  backoffice: number;
  /** OS que ya salieron de la bandeja activa CAC/Backoffice. */
  historial_backoffice: number;
  /** Cola Equipo Listo (bodega central post-taller). */
  equipo_listo: number;
  despachado: number;
  qc: number;
  scrap: number;
  taller: number;
  /** @deprecated Fusionado en taller; se mantiene en 0 por compat. */
  control: number;
  otro: number;
  /** total − despachado (ledger); puede incluir residual no mostrado. */
  activas_ledger: number;
  /** Suma de módulos visibles (bodega + pistoleo + BO + QC + taller + scrap). */
  activas: number;
};

const EMPTY: OsInventoryModules = {
  total: 0,
  con_serie: 0,
  sin_series: 0,
  bodega_con_caja: 0,
  bodega_sin_caja: 0,
  pistoleo_en_curso: 0,
  backoffice: 0,
  historial_backoffice: 0,
  equipo_listo: 0,
  despachado: 0,
  qc: 0,
  scrap: 0,
  taller: 0,
  control: 0,
  otro: 0,
  activas_ledger: 0,
  activas: 0,
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Capacidad instalada / inventario físico por módulo (1 OS = 1 equipo).
 * Prefiere RPC `count_os_inventory_modules` (migración 222).
 */
export async function fetchOsInventoryModules(
  supabase: SupabaseClient
): Promise<OsInventoryModules> {
  const { data, error } = await supabase.rpc('count_os_inventory_modules');
  if (!error && data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const total = num(d.total);
    const despachado = num(d.despachado);
    const bodega = num(d.bodega_con_caja);
    const pistoleo = num(d.pistoleo_en_curso);
    const backoffice = num(d.backoffice);
    const qc = num(d.qc);
    const scrap = num(d.scrap);
    const taller = num(d.taller);
    // Siempre suma de buckets visibles — no confiar en d.activas de RPCs viejas
    // (antes era total−despachado e inflaba el badge vs. las tarjetas).
    const activasSum = bodega + pistoleo + backoffice + qc + scrap + taller;
    const activasLedger =
      num(d.activas_ledger) || Math.max(total - despachado, 0);
    return {
      total,
      con_serie: num(d.con_serie),
      sin_series: 0,
      bodega_con_caja: bodega,
      bodega_sin_caja: 0,
      pistoleo_en_curso: pistoleo,
      backoffice,
      historial_backoffice: 0,
      equipo_listo: 0,
      despachado,
      qc,
      scrap,
      taller,
      control: 0,
      otro: 0,
      activas_ledger: activasLedger,
      activas: activasSum,
    };
  }

  if (error) {
    console.warn('[osInventoryModules] RPC unavailable, fallback:', error.message);
  }

  // Fallback aproximado con RPCs 167 (sin split con/sin caja).
  const countStatus = async (status: string) => {
    const { data: n, error: e } = await supabase.rpc('count_os_by_status', { p_status: status });
    if (e) return 0;
    return num(n);
  };
  const countStatuses = async (statuses: string[]) => {
    const { data: n, error: e } = await supabase.rpc('count_os_in_statuses', {
      p_statuses: statuses,
    });
    if (e) return 0;
    return num(n);
  };

  const [
    totalRes,
    despachado,
    scrap,
    qc,
    taller,
    control,
    backoffice,
    inventoryDetail,
  ] = await Promise.all([
    supabase.from('service_orders').select('id', { count: 'exact', head: true }),
    countStatus('dispatched'),
    countStatuses(['scrapped', 'in_scraps', 'irreparable']),
    countStatuses(['in_qc', 'in_validation']),
    countStatus('in_workshop'),
    countStatus('in_control_warehouse'),
    countStatuses(['RECEPCIONADO_BODEGA_GENERAL', 'INGRESADO', 'classified', 'in_backoffice']),
    supabase.rpc('count_inventory_detail_os'),
  ]);

  const total = totalRes.count || 0;
  const bodegaConCaja = num(inventoryDetail);

  return {
    ...EMPTY,
    total,
    despachado,
    scrap,
    qc,
    taller: taller + control,
    control: 0,
    bodega_con_caja: bodegaConCaja,
    bodega_sin_caja: 0,
    pistoleo_en_curso: 0,
    backoffice,
    historial_backoffice: 0,
    equipo_listo: 0,
    activas_ledger: Math.max(total - despachado, 0),
    activas: bodegaConCaja + backoffice + qc + scrap + taller + control,
    sin_series: 0,
    con_serie: 0,
    otro: 0,
  };
}
