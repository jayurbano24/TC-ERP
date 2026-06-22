import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkshopPerformancePayload } from '@/lib/database/workshop-kpi';
import { WORKSHOP_KPI_STAGES, type WorkshopStageId } from '@/lib/database/workshop-kpi';
import { getWeekRangeReference } from '@/lib/database/workshop-kpi';

export type ExecutiveProjectionStatus = 'verde' | 'amarillo' | 'rojo' | 'neutral';

export type ExecutiveAlert = {
  nivel: 'critico' | 'advertencia' | 'info';
  mensaje: string;
};

export type ExecutiveKpiPayload = {
  timeRange: string;
  volumen: {
    equiposRecepcionados: number;
    equiposDespachados: number;
    equiposProducidos: number;
    backlogTotal: number;
  };
  eficiencia: {
    tatPromedioHoras: number | null;
    tatMetaHoras: number;
    tatCumple: boolean | null;
  };
  calidad: {
    yieldPct: number | null;
    scrapRatePct: number | null;
    aprobadosQC: number;
    rechazadosQC: number;
    scraps: number;
  };
  metas: {
    cumplimientoPct: number | null;
    metaSemanal: number;
    actualSemanal: number;
    proyeccionSemanal: number;
    estadoProyeccion: ExecutiveProjectionStatus;
    diasRestantesSemana: number;
    requeridoPorDia: number | null;
  };
  alertas: ExecutiveAlert[];
  funnel: {
    recepcion: number;
    backoffice: number;
    taller: number;
    bodega: number;
    despacho: number;
  };
};

const TAT_META_HORAS = 72;
const YIELD_META_PCT = 98;
const SCRAP_META_PCT = 3;
const CUMPLIMIENTO_META_PCT = 95;

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function computeCumplimientoMetas(performance: WorkshopPerformancePayload | undefined): number | null {
  if (!performance?.users?.length) return null;
  let cumplidos = 0;
  let conMeta = 0;
  performance.users.forEach((user) => {
    WORKSHOP_KPI_STAGES.forEach((stage) => {
      const metric = user.stages[stage.id as WorkshopStageId];
      if (metric.metaDia > 0) {
        conMeta++;
        if (metric.cumpleDia) cumplidos++;
      }
    });
  });
  if (conMeta === 0) return null;
  return Math.round((cumplidos / conMeta) * 100);
}

function sumWeeklyOutputGoals(
  goals: Array<{ stage?: string; weekly_goal?: number; daily_goal?: number; user_id?: string | null }>
): number {
  const outputStages = new Set(['listo', 'diagnostico', 'reacondicionado', 'reparacion', 'aprobado']);
  const seen = new Set<string>();
  let total = 0;
  goals.forEach((g) => {
    if (!g.stage || !outputStages.has(g.stage)) return;
    const key = `${g.user_id || 'global'}:${g.stage}:${g.weekly_goal}:${g.daily_goal}`;
    if (seen.has(key)) return;
    seen.add(key);
    const weekly = Number(g.weekly_goal) || (Number(g.daily_goal) > 0 ? Number(g.daily_goal) * 5 : 0);
    total += weekly;
  });
  return total;
}

function buildProjection(params: {
  actualSemanal: number;
  metaSemanal: number;
}): Pick<
  ExecutiveKpiPayload['metas'],
  'proyeccionSemanal' | 'estadoProyeccion' | 'diasRestantesSemana' | 'requeridoPorDia'
> {
  const now = new Date();
  const day = now.getDay();
  const daysElapsed = day === 0 ? 7 : day;
  const diasRestantesSemana = day === 0 ? 0 : 7 - day;
  const proyeccionSemanal =
    daysElapsed > 0 ? Math.round((params.actualSemanal / daysElapsed) * 7) : params.actualSemanal;

  let estadoProyeccion: ExecutiveProjectionStatus = 'neutral';
  if (params.metaSemanal > 0) {
    const ratio = proyeccionSemanal / params.metaSemanal;
    if (ratio >= 0.95) estadoProyeccion = 'verde';
    else if (ratio >= 0.8) estadoProyeccion = 'amarillo';
    else estadoProyeccion = 'rojo';
  }

  const requeridoPorDia =
    params.metaSemanal > 0 && diasRestantesSemana > 0
      ? Math.ceil(Math.max(0, params.metaSemanal - params.actualSemanal) / diasRestantesSemana)
      : null;

  return { proyeccionSemanal, estadoProyeccion, diasRestantesSemana, requeridoPorDia };
}

function buildAlertas(payload: {
  backlogTotal: number;
  yieldPct: number | null;
  scrapRatePct: number | null;
  cumplimientoPct: number | null;
  tatPromedioHoras: number | null;
  estadoProyeccion: ExecutiveProjectionStatus;
  metaSemanal: number;
  actualSemanal: number;
}): ExecutiveAlert[] {
  const alertas: ExecutiveAlert[] = [];

  if (payload.estadoProyeccion === 'rojo' && payload.metaSemanal > 0) {
    alertas.push({
      nivel: 'critico',
      mensaje: `Proyección semanal por debajo de meta (${payload.actualSemanal}/${payload.metaSemanal} listos+despachos).`,
    });
  } else if (payload.estadoProyeccion === 'amarillo' && payload.metaSemanal > 0) {
    alertas.push({
      nivel: 'advertencia',
      mensaje: 'Riesgo medio en cierre semanal — acelerar salidas y QC.',
    });
  }

  if (payload.backlogTotal > 300) {
    alertas.push({
      nivel: 'advertencia',
      mensaje: `Backlog elevado: ${payload.backlogTotal} equipos en pipeline.`,
    });
  }

  if (payload.yieldPct !== null && payload.yieldPct < YIELD_META_PCT) {
    alertas.push({
      nivel: 'advertencia',
      mensaje: `Yield ${payload.yieldPct}% — por debajo de meta ${YIELD_META_PCT}%.`,
    });
  }

  if (payload.scrapRatePct !== null && payload.scrapRatePct > SCRAP_META_PCT) {
    alertas.push({
      nivel: 'critico',
      mensaje: `Scrap rate ${payload.scrapRatePct}% — supera meta ${SCRAP_META_PCT}%.`,
    });
  }

  if (payload.cumplimientoPct !== null && payload.cumplimientoPct < CUMPLIMIENTO_META_PCT) {
    alertas.push({
      nivel: 'advertencia',
      mensaje: `Cumplimiento de metas ${payload.cumplimientoPct}% — objetivo ${CUMPLIMIENTO_META_PCT}%.`,
    });
  }

  if (payload.tatPromedioHoras !== null && payload.tatPromedioHoras > TAT_META_HORAS) {
    alertas.push({
      nivel: 'advertencia',
      mensaje: `TAT promedio ${round1(payload.tatPromedioHoras)}h — supera meta ${TAT_META_HORAS}h.`,
    });
  }

  if (alertas.length === 0) {
    alertas.push({
      nivel: 'info',
      mensaje: 'Operación dentro de parámetros en el rango seleccionado.',
    });
  }

  return alertas;
}

async function computeTatPromedioHoras(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string,
  seriesOsMap: Map<string, string>
): Promise<number | null> {
  const { data: dispatchLogs } = await supabase
    .from('erp_audit_logs')
    .select('record_id, created_at')
    .eq('action', 'DESPACHO CREADO')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (!dispatchLogs?.length) return null;

  const osDispatchAt = new Map<string, number>();
  dispatchLogs.forEach((log) => {
    const osId = log.record_id ? seriesOsMap.get(log.record_id) : undefined;
    if (!osId || !log.created_at) return;
    const ts = new Date(log.created_at).getTime();
    const prev = osDispatchAt.get(osId);
    if (!prev || ts > prev) osDispatchAt.set(osId, ts);
  });

  const osIds = Array.from(new Set(osDispatchAt.keys()));
  if (osIds.length === 0) return null;

  const { data: orders } = await supabase
    .from('service_orders')
    .select('id, created_at')
    .in('id', osIds);

  if (!orders?.length) return null;

  let sumHours = 0;
  let count = 0;
  orders.forEach((order) => {
    const dispatchTs = osDispatchAt.get(order.id);
    if (!dispatchTs || !order.created_at) return;
    const startTs = new Date(order.created_at).getTime();
    const hours = (dispatchTs - startTs) / (1000 * 60 * 60);
    if (hours >= 0 && hours < 24 * 365) {
      sumHours += hours;
      count++;
    }
  });

  if (count === 0) return null;
  return round1(sumHours / count);
}

export async function buildExecutiveKpi(params: {
  supabase: SupabaseClient;
  timeRange: string;
  startIso: string;
  endIso: string;
  seriesOsMap: Map<string, string>;
  getCount: (status: string) => number;
  estadoOperativo: {
    recepcion: number;
    backoffice: number;
    taller: number;
    bodega: number;
    despacho: number;
  };
  equiposDespachados: number;
  equiposListos: number;
  totalUnidadesRecepcion: number;
  workshopPerformance: WorkshopPerformancePayload;
  despachosSemana: number;
  listoSemana: number;
  kpiGoals: Array<{ stage?: string; weekly_goal?: number; daily_goal?: number; user_id?: string | null }>;
}): Promise<ExecutiveKpiPayload> {
  const {
    supabase,
    timeRange,
    startIso,
    endIso,
    seriesOsMap,
    getCount,
    estadoOperativo,
    equiposDespachados,
    equiposListos,
    totalUnidadesRecepcion,
    workshopPerformance,
    despachosSemana,
    listoSemana,
    kpiGoals,
  } = params;

  const { count: osRecepcionados } = await supabase
    .from('service_orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const equiposRecepcionados = osRecepcionados ?? totalUnidadesRecepcion;

  const backlogTotal =
    getCount('in_validation') +
    getCount('RECEPCIONADO_BODEGA_GENERAL') +
    getCount('in_workshop') +
    getCount('in_control_warehouse') +
    getCount('ready_to_dispatch') +
    getCount('in_central_warehouse') +
    getCount('irreparable');

  const aprobadosQC = workshopPerformance.summary.aprobado;
  const rechazadosQC = workshopPerformance.summary.rechazado;
  const scraps = workshopPerformance.summary.scraps;
  const qcTotal = aprobadosQC + rechazadosQC;
  const yieldPct = qcTotal > 0 ? round1((aprobadosQC / qcTotal) * 100) : null;

  const procesadosTaller =
    workshopPerformance.summary.diagnostico +
    workshopPerformance.summary.reacondicionado +
    workshopPerformance.summary.reparacion;
  const scrapRatePct =
    procesadosTaller > 0 ? round1((scraps / procesadosTaller) * 100) : null;

  const tatPromedioHoras = await computeTatPromedioHoras(supabase, startIso, endIso, seriesOsMap);
  const cumplimientoPct = computeCumplimientoMetas(workshopPerformance);

  const actualSemanal = listoSemana + despachosSemana;
  const metaSemanal = sumWeeklyOutputGoals(kpiGoals) || Math.max(actualSemanal, 100);
  const projection = buildProjection({ actualSemanal, metaSemanal });

  const alertas = buildAlertas({
    backlogTotal,
    yieldPct,
    scrapRatePct,
    cumplimientoPct,
    tatPromedioHoras,
    estadoProyeccion: projection.estadoProyeccion,
    metaSemanal,
    actualSemanal,
  });

  return {
    timeRange,
    volumen: {
      equiposRecepcionados,
      equiposDespachados,
      equiposProducidos: equiposListos,
      backlogTotal,
    },
    eficiencia: {
      tatPromedioHoras,
      tatMetaHoras: TAT_META_HORAS,
      tatCumple: tatPromedioHoras !== null ? tatPromedioHoras <= TAT_META_HORAS : null,
    },
    calidad: {
      yieldPct,
      scrapRatePct,
      aprobadosQC,
      rechazadosQC,
      scraps,
    },
    metas: {
      cumplimientoPct,
      metaSemanal,
      actualSemanal,
      ...projection,
    },
    alertas,
    funnel: estadoOperativo,
  };
}

export function getExecutiveWeekRange() {
  return getWeekRangeReference();
}

export const EXECUTIVE_TARGETS = {
  tatHoras: TAT_META_HORAS,
  yieldPct: YIELD_META_PCT,
  scrapPct: SCRAP_META_PCT,
  cumplimientoPct: CUMPLIMIENTO_META_PCT,
};
