import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WORKSHOP_KPI_STAGES,
  type WorkshopAuditLog,
  type WorkshopStageId,
  resolveWorkshopGoal,
  getWeekRangeReference,
} from '@/lib/database/workshop-kpi';

export type PersonProductivityRow = {
  ranking: number;
  usuario: string;
  userId: string | null;
  metaDia: number;
  hoy: number;
  ayer: number;
  semana: number;
  mes: number;
  cumplimientoPct: number | null;
  productividadPonderada: number;
  yieldPct: number | null;
  rechazosQC: number;
  scrap: number;
  listo: number;
  eficienciaPct: number | null;
};

export type TechnologyProductivityRow = {
  techId: string;
  tecnologia: string;
  pendientes: number;
  backlog: number;
  procesadosHoy: number;
  procesadosSemana: number;
  yieldPct: number | null;
  scrap: number;
};

export type ModelProductivityRow = {
  modelId: string;
  modelo: string;
  peso: number;
  procesadosHoy: number;
  procesadosMes: number;
  scrap: number;
  yieldPct: number | null;
  productividadPonderada: number;
  retrabajos: number;
};

export type ProductivityKpiPayload = {
  personas: PersonProductivityRow[];
  tecnologias: TechnologyProductivityRow[];
  modelos: ModelProductivityRow[];
};

const TALLER_ACTIONS = [
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO',
];

const WIP_STATUSES = [
  'in_workshop',
  'in_validation',
  'in_control_warehouse',
  'RECEPCIONADO_BODEGA_GENERAL',
  'ready_to_dispatch',
];

function getRange(kind: 'hoy' | 'ayer' | 'mes', now = new Date()) {
  const start = new Date(now);
  const end = new Date(now);

  if (kind === 'ayer') {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (kind === 'mes') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }

  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function matchesStage(log: WorkshopAuditLog, stageId: WorkshopStageId): boolean {
  const result = log.new_values?.result;
  switch (stageId) {
    case 'diagnostico':
      return log.action === 'DIAGNÓSTICO INICIAL COMPLETADO';
    case 'reacondicionado':
      return log.action === 'REACONDICIONADO COMPLETADO';
    case 'reparacion':
      return log.action === 'REPARACIÓN COMPLETADA';
    case 'l3':
      return result === 'l3';
    case 'scraps':
      return result === 'scraps';
    case 'control_calidad':
      return log.action === 'CONTROL DE CALIDAD COMPLETADO';
    case 'aprobado':
      return log.action === 'CONTROL DE CALIDAD COMPLETADO' && result !== 'rechazado_qc';
    case 'rechazado':
      return log.action === 'CONTROL DE CALIDAD COMPLETADO' && result === 'rechazado_qc';
    case 'listo':
      return result === 'listo';
    default:
      return false;
  }
}

function countByUserStage(
  logs: WorkshopAuditLog[],
  stageId: WorkshopStageId,
  getUserName: (id: string | null | undefined) => string,
  resolveWorkUnit: (recordId: string | null | undefined) => string | null
): Record<string, number> {
  const map: Record<string, Set<string>> = {};
  logs.forEach((log) => {
    if (!matchesStage(log, stageId)) return;
    const user = getUserName(log.user_id);
    const unit = resolveWorkUnit(log.record_id);
    if (!unit) return;
    if (!map[user]) map[user] = new Set();
    map[user].add(unit);
  });
  return Object.fromEntries(Object.entries(map).map(([u, s]) => [u, s.size]));
}

function weightedByUserStage(
  logs: WorkshopAuditLog[],
  stageId: WorkshopStageId,
  getUserName: (id: string | null | undefined) => string,
  resolveWorkUnit: (recordId: string | null | undefined) => string | null,
  seriesModelMap: Map<string, string>,
  modelWeights: Map<string, number>
): Record<string, number> {
  const totals: Record<string, number> = {};
  const seen = new Map<string, Set<string>>();

  logs.forEach((log) => {
    if (!matchesStage(log, stageId)) return;
    const user = getUserName(log.user_id);
    const unit = resolveWorkUnit(log.record_id);
    if (!unit) return;
    if (!seen.has(user)) seen.set(user, new Set());
    if (seen.get(user)!.has(unit)) return;
    seen.get(user)!.add(unit);

    const modelId = log.record_id ? seriesModelMap.get(log.record_id) : undefined;
    const weight = modelId ? modelWeights.get(modelId) ?? 1 : 1;
    totals[user] = (totals[user] ?? 0) + weight;
  });

  return totals;
}

function countByModelStage(
  logs: WorkshopAuditLog[],
  stageId: WorkshopStageId,
  resolveWorkUnit: (recordId: string | null | undefined) => string | null,
  seriesModelMap: Map<string, string>
): Record<string, number> {
  const map: Record<string, Set<string>> = {};
  logs.forEach((log) => {
    if (!matchesStage(log, stageId)) return;
    const modelId = log.record_id ? seriesModelMap.get(log.record_id) : undefined;
    if (!modelId) return;
    const unit = resolveWorkUnit(log.record_id);
    if (!unit) return;
    if (!map[modelId]) map[modelId] = new Set();
    map[modelId].add(unit);
  });
  return Object.fromEntries(Object.entries(map).map(([id, s]) => [id, s.size]));
}

function yieldPct(aprob: number, rech: number): number | null {
  const total = aprob + rech;
  if (total === 0) return null;
  return Math.round((aprob / total) * 1000) / 10;
}

async function fetchTallerLogs(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<WorkshopAuditLog[]> {
  const { data } = await supabase
    .from('erp_audit_logs')
    .select('user_id, action, new_values, record_id')
    .in('action', TALLER_ACTIONS)
    .gte('created_at', startIso)
    .lte('created_at', endIso);
  return (data || []) as WorkshopAuditLog[];
}

async function loadBacklogByTech(
  supabase: SupabaseClient,
  techIds: Set<string>
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  techIds.forEach((id) => {
    counts[id] = 0;
  });

  const { data } = await supabase
    .from('series')
    .select('service_order_id, models(technology_id)')
    .in('current_status', WIP_STATUSES);

  const unitsByTech: Record<string, Set<string>> = {};
  data?.forEach((row: any) => {
    const modelObj = Array.isArray(row.models) ? row.models[0] : row.models;
    const techId = modelObj?.technology_id;
    if (!techId || !techIds.has(techId)) return;
    const unit = row.service_order_id ? `os:${row.service_order_id}` : null;
    if (!unit) return;
    if (!unitsByTech[techId]) unitsByTech[techId] = new Set();
    unitsByTech[techId].add(unit);
  });

  Object.entries(unitsByTech).forEach(([techId, units]) => {
    counts[techId] = units.size;
  });
  return counts;
}

function resolveUserDailyMeta(
  goals: Array<Record<string, unknown>>,
  userId: string | null,
  modelIds: Set<string>,
  techIds: Set<string>
): number {
  let daily = 0;
  if (modelIds.size > 0) {
    modelIds.forEach((modelId) => {
      const g = resolveWorkshopGoal(goals as any[], userId, 'listo', modelId);
      if (g.daily > 0) daily += g.daily;
    });
  }
  if (daily === 0 && techIds.size > 0) {
    techIds.forEach((techId) => {
      const g = resolveWorkshopGoal(goals as any[], userId, 'listo', null, techId);
      if (g.daily > 0) daily += g.daily;
    });
  }
  if (daily === 0) {
    daily = resolveWorkshopGoal(goals as any[], userId, 'listo').daily;
  }
  return daily;
}

function collectUserModelTechIds(
  logs: WorkshopAuditLog[],
  usuario: string,
  getUserName: (id: string | null | undefined) => string,
  seriesModelMap: Map<string, string>,
  seriesTechIdMap: Map<string, string>
): { modelIds: Set<string>; techIds: Set<string> } {
  const modelIds = new Set<string>();
  const techIds = new Set<string>();
  logs.forEach((log) => {
    if (getUserName(log.user_id) !== usuario) return;
    const modelId = log.record_id ? seriesModelMap.get(log.record_id) : undefined;
    const techId = log.record_id ? seriesTechIdMap.get(log.record_id) : undefined;
    if (modelId) modelIds.add(modelId);
    if (techId) techIds.add(techId);
  });
  return { modelIds, techIds };
}

export async function buildProductivityKpi(params: {
  supabase: SupabaseClient;
  getUserName: (id: string | null | undefined) => string;
  resolveWorkUnit: (recordId: string | null | undefined) => string | null;
  nameToUserId: Record<string, string | null>;
  seriesModelMap: Map<string, string>;
  seriesTechIdMap: Map<string, string>;
  configuredTechnologies: Array<{ id: string; name: string }>;
  models: Array<{ id: string; name: string; code?: string }>;
  kpiGoals: Array<Record<string, unknown>>;
  modelWeights?: Map<string, number>;
}): Promise<ProductivityKpiPayload> {
  const {
    supabase,
    getUserName,
    resolveWorkUnit,
    nameToUserId,
    seriesModelMap,
    seriesTechIdMap,
    configuredTechnologies,
    models,
    kpiGoals,
  } = params;

  const modelWeights = params.modelWeights ?? new Map<string, number>();
  models.forEach((m) => {
    if (!modelWeights.has(m.id)) modelWeights.set(m.id, 1);
  });

  const hoyRange = getRange('hoy');
  const ayerRange = getRange('ayer');
  const mesRange = getRange('mes');
  const semanaRange = getWeekRangeReference();

  const [logsHoy, logsAyer, logsSemana, logsMes] = await Promise.all([
    fetchTallerLogs(supabase, hoyRange.startIso, hoyRange.endIso),
    fetchTallerLogs(supabase, ayerRange.startIso, ayerRange.endIso),
    fetchTallerLogs(supabase, semanaRange.startIso, semanaRange.endIso),
    fetchTallerLogs(supabase, mesRange.startIso, mesRange.endIso),
  ]);

  const listoHoy = countByUserStage(logsHoy, 'listo', getUserName, resolveWorkUnit);
  const listoAyer = countByUserStage(logsAyer, 'listo', getUserName, resolveWorkUnit);
  const listoSemana = countByUserStage(logsSemana, 'listo', getUserName, resolveWorkUnit);
  const listoMes = countByUserStage(logsMes, 'listo', getUserName, resolveWorkUnit);
  const weightedHoy = weightedByUserStage(
    logsHoy,
    'listo',
    getUserName,
    resolveWorkUnit,
    seriesModelMap,
    modelWeights
  );
  const aprobHoy = countByUserStage(logsHoy, 'aprobado', getUserName, resolveWorkUnit);
  const rechHoy = countByUserStage(logsHoy, 'rechazado', getUserName, resolveWorkUnit);
  const scrapHoy = countByUserStage(logsHoy, 'scraps', getUserName, resolveWorkUnit);

  const allUsers = new Set<string>([
    ...Object.keys(listoHoy),
    ...Object.keys(listoAyer),
    ...Object.keys(listoSemana),
    ...Object.keys(listoMes),
    ...Object.keys(weightedHoy),
  ]);

  const personaDraft: Omit<PersonProductivityRow, 'ranking'>[] = Array.from(allUsers).map((usuario) => {
    const userId = nameToUserId[usuario] ?? null;
    const hoy = listoHoy[usuario] ?? 0;
    const { modelIds, techIds } = collectUserModelTechIds(
      logsHoy,
      usuario,
      getUserName,
      seriesModelMap,
      seriesTechIdMap
    );
    const metaDia = resolveUserDailyMeta(kpiGoals, userId, modelIds, techIds);
    const productividadPonderada = Math.round((weightedHoy[usuario] ?? 0) * 10) / 10;
    const cumplimientoPct =
      metaDia > 0 ? Math.min(999, Math.round((hoy / metaDia) * 100)) : null;
    const eficienciaPct =
      metaDia > 0
        ? Math.min(999, Math.round((productividadPonderada / metaDia) * 100))
        : null;

    return {
      usuario,
      userId,
      metaDia,
      hoy,
      ayer: listoAyer[usuario] ?? 0,
      semana: listoSemana[usuario] ?? 0,
      mes: listoMes[usuario] ?? 0,
      cumplimientoPct,
      productividadPonderada,
      yieldPct: yieldPct(aprobHoy[usuario] ?? 0, rechHoy[usuario] ?? 0),
      rechazosQC: rechHoy[usuario] ?? 0,
      scrap: scrapHoy[usuario] ?? 0,
      listo: hoy,
      eficienciaPct,
    };
  });

  personaDraft.sort(
    (a, b) =>
      b.productividadPonderada - a.productividadPonderada ||
      b.hoy - a.hoy ||
      b.semana - a.semana
  );

  const personas: PersonProductivityRow[] = personaDraft.map((row, idx) => ({
    ...row,
    ranking: idx + 1,
  }));

  const techIds = new Set(configuredTechnologies.map((t) => t.id));
  const backlogByTech = await loadBacklogByTech(supabase, techIds);

  const tecnologias: TechnologyProductivityRow[] = configuredTechnologies.map((tech) => {
    const procesadosHoy: Record<string, number> = {};
    const procesadosSemana: Record<string, number> = {};

    logsHoy.forEach((log) => {
      if (!matchesStage(log, 'listo')) return;
      const tid = log.record_id ? seriesTechIdMap.get(log.record_id) : undefined;
      if (tid !== tech.id) return;
      const unit = resolveWorkUnit(log.record_id);
      if (!unit) return;
      procesadosHoy[unit] = 1;
    });
    logsSemana.forEach((log) => {
      if (!matchesStage(log, 'listo')) return;
      const tid = log.record_id ? seriesTechIdMap.get(log.record_id) : undefined;
      if (tid !== tech.id) return;
      const unit = resolveWorkUnit(log.record_id);
      if (!unit) return;
      procesadosSemana[unit] = 1;
    });

    let aprob = 0;
    let rech = 0;
    let scrap = 0;
    logsHoy.forEach((log) => {
      const tid = log.record_id ? seriesTechIdMap.get(log.record_id) : undefined;
      if (tid !== tech.id) return;
      const unit = resolveWorkUnit(log.record_id);
      if (!unit) return;
      if (matchesStage(log, 'aprobado')) aprob++;
      if (matchesStage(log, 'rechazado')) rech++;
      if (matchesStage(log, 'scraps')) scrap++;
    });

    return {
      techId: tech.id,
      tecnologia: tech.name.trim().toUpperCase(),
      pendientes: backlogByTech[tech.id] ?? 0,
      backlog: backlogByTech[tech.id] ?? 0,
      procesadosHoy: Object.keys(procesadosHoy).length,
      procesadosSemana: Object.keys(procesadosSemana).length,
      yieldPct: yieldPct(aprob, rech),
      scrap,
    };
  }).filter((t) => t.procesadosHoy > 0 || t.procesadosSemana > 0 || t.backlog > 0);

  const listoMesByModel = countByModelStage(logsMes, 'listo', resolveWorkUnit, seriesModelMap);
  const listoHoyByModel = countByModelStage(logsHoy, 'listo', resolveWorkUnit, seriesModelMap);
  const scrapMesByModel = countByModelStage(logsMes, 'scraps', resolveWorkUnit, seriesModelMap);
  const rechMesByModel = countByModelStage(logsMes, 'rechazado', resolveWorkUnit, seriesModelMap);
  const aprobMesByModel = countByModelStage(logsMes, 'aprobado', resolveWorkUnit, seriesModelMap);

  const modelos: ModelProductivityRow[] = models
    .map((model) => {
      const procesadosMes = listoMesByModel[model.id] ?? 0;
      const procesadosHoy = listoHoyByModel[model.id] ?? 0;
      const scrap = scrapMesByModel[model.id] ?? 0;
      const retrabajos = rechMesByModel[model.id] ?? 0;
      const peso = modelWeights.get(model.id) ?? 1;
      const productividadPonderada = Math.round(procesadosMes * peso * 10) / 10;

      return {
        modelId: model.id,
        modelo: model.name || model.code || 'Modelo',
        peso,
        procesadosHoy,
        procesadosMes,
        scrap,
        yieldPct: yieldPct(aprobMesByModel[model.id] ?? 0, rechMesByModel[model.id] ?? 0),
        productividadPonderada,
        retrabajos,
      };
    })
    .filter((m) => m.procesadosMes > 0 || m.procesadosHoy > 0 || m.scrap > 0)
    .sort((a, b) => b.productividadPonderada - a.productividadPonderada)
    .slice(0, 20);

  return { personas, tecnologias, modelos };
}
