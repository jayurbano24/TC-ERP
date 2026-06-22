import type { SupabaseClient } from '@supabase/supabase-js';

export type RecepcionOsMetrics = {
  /** OS clasificados en bandeja CAC (misma base que backoffice historial) */
  cacClasificados: number;
  /** OS de recepciones PX en el periodo, no incluidas en bandeja CAC */
  pxOs: number;
  /** Total canónico para KPI: CAC + PX */
  equiposRecepcionados: number;
  /** Conteo legacy: todas las service_orders por created_at (puede incluir reingresos/legacy) */
  osCreadasEnPeriodo: number;
  /** OS creadas en periodo pero fuera de bandeja CAC activa */
  osSinBandejaCac: number;
};

export async function loadRecepcionOsMetrics(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<RecepcionOsMetrics> {
  const { data: trayRows, error: trayError } = await supabase
    .from('cac_tray_units')
    .select('service_order_id')
    .eq('is_active', true)
    .gte('classified_at', startIso)
    .lte('classified_at', endIso);

  if (trayError && !trayError.message.includes('does not exist')) {
    console.error('KPI cac_tray_units error:', trayError);
  }

  const cacOsIds = new Set<string>();
  (trayRows || []).forEach((row) => {
    if (row.service_order_id) cacOsIds.add(row.service_order_id);
  });

  const { count: osCreatedCount } = await supabase
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  let pxOs = 0;
  const { data: pxReceptions } = await supabase
    .from('receptions')
    .select('id')
    .eq('source', 'px')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const pxReceptionIds = (pxReceptions || []).map((r) => r.id).filter(Boolean);
  if (pxReceptionIds.length > 0) {
    const { data: pxOrders } = await supabase
      .from('service_orders')
      .select('id')
      .in('reception_id', pxReceptionIds)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    const pxOsIds = new Set<string>();
    (pxOrders || []).forEach((order) => {
      if (order.id && !cacOsIds.has(order.id)) pxOsIds.add(order.id);
    });
    pxOs = pxOsIds.size;
  }

  const cacClasificados = cacOsIds.size;
  const equiposRecepcionados = cacClasificados + pxOs;
  const osCreadasEnPeriodo = osCreatedCount ?? 0;
  const osSinBandejaCac = Math.max(0, osCreadasEnPeriodo - cacClasificados);

  return {
    cacClasificados,
    pxOs,
    equiposRecepcionados,
    osCreadasEnPeriodo,
    osSinBandejaCac,
  };
}
