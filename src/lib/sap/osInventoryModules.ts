import type { SupabaseClient } from '@supabase/supabase-js';

/** Inventario OS · Capacidad instalada (1 OS = 1 equipo). SSOT mig 228. */
export type OsInventoryModules = {
  total: number;
  con_serie: number;
  sin_series: number;
  bodega_con_caja: number;
  /** Bodega Despacho / Outbound: fuera de Bodega Central, todavía en planta. */
  bodega_despacho: number;
  /** @deprecated */
  bodega_sin_caja: number;
  pistoleo_en_curso: number;
  /** Pendiente ingresar Bodega Central (cac_tray activa = Historial CAC). */
  backoffice: number;
  /** Referencia ledger series RECEPCIONADO_BODEGA_GENERAL (no usar como cola). */
  series_recepcionado_bo: number;
  historial_backoffice: number;
  equipo_listo: number;
  despachado: number;
  taller_diagnostico: number;
  taller_reparacion: number;
  taller_reacondicionado: number;
  taller_qc: number;
  taller_l3: number;
  taller_scraps_piso: number;
  taller_piso_total: number;
  bodega_scraps: number;
  scrap_ledger: number;
  /** Compat: alias taller_qc */
  qc: number;
  /** Compat: diag + L3 */
  taller: number;
  /** Compat: scrap_ledger */
  scrap: number;
  control: number;
  otro: number;
  activas_ledger: number;
  /** Suma módulos físicos sin doble conteo (excluye equipo_listo y reacondicionado). */
  activas: number;
};

const EMPTY: OsInventoryModules = {
  total: 0,
  con_serie: 0,
  sin_series: 0,
  bodega_con_caja: 0,
  bodega_despacho: 0,
  bodega_sin_caja: 0,
  pistoleo_en_curso: 0,
  backoffice: 0,
  series_recepcionado_bo: 0,
  historial_backoffice: 0,
  equipo_listo: 0,
  despachado: 0,
  taller_diagnostico: 0,
  taller_reparacion: 0,
  taller_reacondicionado: 0,
  taller_qc: 0,
  taller_l3: 0,
  taller_scraps_piso: 0,
  taller_piso_total: 0,
  bodega_scraps: 0,
  scrap_ledger: 0,
  qc: 0,
  taller: 0,
  scrap: 0,
  control: 0,
  otro: 0,
  activas_ledger: 0,
  activas: 0,
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type OsRealityRow = {
  key: string;
  modulo: string;
  os: number;
  definicion: string;
  highlight?: boolean;
  muted?: boolean;
};

/** Filas de tabla Inventario OS (mismo detalle que diagnose_os_module_reality). */
export function buildOsRealityTableRows(m: OsInventoryModules): OsRealityRow[] {
  const tallerPiso =
    m.taller_piso_total ||
    m.taller_diagnostico +
      m.taller_reparacion +
      m.taller_reacondicionado +
      m.taller_qc +
      m.taller_l3 +
      m.taller_scraps_piso;

  return [
    {
      key: 'historico',
      modulo: '01 · Histórico (todas las OS)',
      os: m.total,
      definicion: 'Todas las filas service_orders',
      muted: true,
    },
    {
      key: 'despachado',
      modulo: '02 · Despachadas (históricas)',
      os: m.despachado,
      definicion: 'OS con ≥1 serie status=dispatched',
      muted: true,
    },
    {
      key: 'activas_ledger',
      modulo: '03 · Activas (físico estimado)',
      os: m.activas_ledger,
      definicion: 'Histórico − Despachadas (incluye residual sin módulo)',
      muted: true,
    },
    {
      key: 'backoffice',
      modulo: '04 · Backoffice · PENDIENTE ingresar Bodega Central',
      os: m.backoffice,
      definicion: 'cac_tray_units activas (SSOT = Historial CAC)',
      highlight: true,
    },
    {
      key: 'series_bo',
      modulo: '04b · series RECEPCIONADO_BODEGA_GENERAL (referencia)',
      os: m.series_recepcionado_bo,
      definicion: 'Solo status series; no es la cola operativa',
      muted: true,
    },
    {
      key: 'bodega',
      modulo: '05 · Bodega Central (con caja, no TMP)',
      os: m.bodega_con_caja,
      definicion: 'in_central_warehouse/ready_to_dispatch + caja real',
    },
    {
      key: 'pistoleo',
      modulo: '05b · Pistoleo en curso (TMP)',
      os: m.pistoleo_en_curso,
      definicion: 'Series en caja TMP / rack EN_PROCESO',
    },
    {
      key: 'bodega_despacho',
      modulo: '05c · Bodega Despacho (Outbound)',
      os: m.bodega_despacho,
      definicion: 'in_dispatch_warehouse: en caja de salida, aún no despachada',
    },
    {
      key: 'diag',
      modulo: '06 · Taller · Diagnóstico',
      os: m.taller_diagnostico,
      definicion: 'status = in_workshop',
    },
    {
      key: 'rep',
      modulo: '07 · Taller · Reparación',
      os: m.taller_reparacion,
      definicion: 'status = in_qc',
    },
    {
      key: 'reac',
      modulo: '08 · Taller · Reacondicionado',
      os: m.taller_reacondicionado,
      definicion: 'status = ready_to_dispatch',
    },
    {
      key: 'qc',
      modulo: '09 · Taller · Control Calidad (CQ)',
      os: m.taller_qc,
      definicion: 'status = in_validation',
    },
    {
      key: 'l3',
      modulo: '10 · Taller · L3',
      os: m.taller_l3,
      definicion: 'status = in_control_warehouse',
    },
    {
      key: 'scraps_piso',
      modulo: '11 · Taller · SCRAPS (piso, pendientes caja)',
      os: m.taller_scraps_piso,
      definicion: 'irreparable sin caja y OS sin series en BOX-BAD',
    },
    {
      key: 'bodega_scraps',
      modulo: '12 · Bodega SCRAPS (ya en caja)',
      os: m.bodega_scraps,
      definicion: 'OS con ≥1 serie en caja rack SCRAP / BOX-BAD',
    },
    {
      key: 'scrap_ledger',
      modulo: '12b · Scrap ledger (todos status scrap)',
      os: m.scrap_ledger,
      definicion: 'irreparable + in_scraps + scrapped (piso + caja)',
      muted: true,
    },
    {
      key: 'listo',
      modulo: '13 · Equipo Listo (post-taller → outbound)',
      os: m.equipo_listo,
      definicion: 'in_central_warehouse + auditoría de taller/QC (subset Bodega)',
    },
    {
      key: 'taller_piso',
      modulo: '14 · Taller TOTAL etapas piso',
      os: tallerPiso,
      definicion: 'Suma Diag+Rep+Reac+CQ+L3+SCRAPS piso',
      highlight: true,
    },
  ];
}

/**
 * Capacidad instalada / inventario físico por módulo (1 OS = 1 equipo).
 * Prefiere RPC `count_os_inventory_modules` (migración 228).
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
    const bodegaDespacho = num(d.bodega_despacho);
    const pistoleo = num(d.pistoleo_en_curso);
    const backoffice = num(d.backoffice);
    const diag = num(d.taller_diagnostico);
    const rep = num(d.taller_reparacion);
    const reac = num(d.taller_reacondicionado);
    const qc = num(d.taller_qc) || num(d.qc);
    const l3 = num(d.taller_l3);
    const scrapsPiso = num(d.taller_scraps_piso);
    const bodegaScraps = num(d.bodega_scraps);
    const scrapLedger = num(d.scrap_ledger) || num(d.scrap);
    const equipoListo = num(d.equipo_listo);
    const tallerPiso =
      num(d.taller_piso_total) || diag + rep + reac + qc + l3 + scrapsPiso;

    const activasSum =
      num(d.activas) ||
      bodega +
        bodegaDespacho +
        pistoleo +
        backoffice +
        diag +
        rep +
        qc +
        l3 +
        scrapsPiso +
        bodegaScraps;

    return {
      total,
      con_serie: num(d.con_serie),
      sin_series: 0,
      bodega_con_caja: bodega,
      bodega_despacho: bodegaDespacho,
      bodega_sin_caja: 0,
      pistoleo_en_curso: pistoleo,
      backoffice,
      series_recepcionado_bo: num(d.series_recepcionado_bo),
      historial_backoffice: 0,
      equipo_listo: equipoListo,
      despachado,
      taller_diagnostico: diag,
      taller_reparacion: rep,
      taller_reacondicionado: reac,
      taller_qc: qc,
      taller_l3: l3,
      taller_scraps_piso: scrapsPiso,
      taller_piso_total: tallerPiso,
      bodega_scraps: bodegaScraps,
      scrap_ledger: scrapLedger,
      qc,
      taller: diag + l3,
      scrap: scrapLedger,
      control: 0,
      otro: 0,
      activas_ledger: num(d.activas_ledger) || Math.max(total - despachado, 0),
      activas: activasSum,
    };
  }

  if (error) {
    console.warn('[osInventoryModules] RPC unavailable, fallback:', error.message);
  }

  const countStatus = async (status: string) => {
    const { data: n, error: e } = await supabase.rpc('count_os_by_status', { p_status: status });
    if (e) return 0;
    return num(n);
  };

  const [totalRes, despachado, diag, rep, qc, l3] = await Promise.all([
    supabase.from('service_orders').select('id', { count: 'exact', head: true }),
    countStatus('dispatched'),
    countStatus('in_workshop'),
    countStatus('in_qc'),
    countStatus('in_validation'),
    countStatus('in_control_warehouse'),
  ]);

  const total = totalRes.count || 0;
  return {
    ...EMPTY,
    total,
    despachado,
    taller_diagnostico: diag,
    taller_reparacion: rep,
    taller_qc: qc,
    taller_l3: l3,
    taller_piso_total: diag + rep + qc + l3,
    taller: diag + l3,
    qc,
    activas_ledger: Math.max(total - despachado, 0),
  };
}
