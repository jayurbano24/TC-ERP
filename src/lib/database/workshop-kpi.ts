export const WORKSHOP_KPI_STAGES = [
  { id: 'diagnostico', label: 'Diagnóstico', goalStage: 'diagnostico', color: 'blue' },
  { id: 'reacondicionado', label: 'Reacondicionado', goalStage: 'reacondicionado', color: 'emerald' },
  { id: 'reparacion', label: 'Reparación', goalStage: 'reparacion', color: 'amber' },
  { id: 'l3', label: 'L3', goalStage: 'l3', color: 'orange' },
  { id: 'scraps', label: 'Scraps', goalStage: 'scraps', color: 'rose' },
  { id: 'control_calidad', label: 'Ctrl. calidad', goalStage: 'qc', color: 'violet' },
  { id: 'aprobado', label: 'Aprobado', goalStage: 'aprobado', color: 'green' },
  { id: 'rechazado', label: 'Rechazado', goalStage: 'rechazado', color: 'red' },
  { id: 'listo', label: 'Listo', goalStage: 'listo', color: 'teal' },
] as const;

export type WorkshopStageId = (typeof WORKSHOP_KPI_STAGES)[number]['id'];

export type WorkshopAuditLog = {
  user_id: string | null;
  action: string;
  record_id: string | null;
  new_values?: { result?: string } | null;
};

export type WorkshopStageMetric = {
  hoy: number;
  metaDia: number;
  pctDia: number | null;
  semana: number;
  metaSem: number;
  pctSem: number | null;
  cumpleDia: boolean | null;
};

export type WorkshopUserPerformance = {
  usuario: string;
  userId: string | null;
  stages: Record<WorkshopStageId, WorkshopStageMetric>;
  totalHoy: number;
  totalSemana: number;
};

export type WorkshopPerformancePayload = {
  stages: typeof WORKSHOP_KPI_STAGES;
  summary: Record<WorkshopStageId, number>;
  summarySemana: Record<WorkshopStageId, number>;
  users: WorkshopUserPerformance[];
};

function matchesWorkshopStage(log: WorkshopAuditLog, stageId: WorkshopStageId): boolean {
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

function countWorkUnitsByUser(
  logs: WorkshopAuditLog[],
  stageId: WorkshopStageId,
  getUserName: (id: string | null | undefined) => string,
  resolveWorkUnit: (recordId: string | null | undefined) => string | null
): Record<string, number> {
  const map: Record<string, Set<string>> = {};
  logs.forEach((log) => {
    if (!matchesWorkshopStage(log, stageId)) return;
    const name = getUserName(log.user_id);
    const unit = resolveWorkUnit(log.record_id);
    if (!unit) return;
    if (!map[name]) map[name] = new Set();
    map[name].add(unit);
  });
  return Object.fromEntries(Object.entries(map).map(([name, units]) => [name, units.size]));
}

function countWorkUnitsTotal(
  logs: WorkshopAuditLog[],
  stageId: WorkshopStageId,
  resolveWorkUnit: (recordId: string | null | undefined) => string | null
): number {
  const units = new Set<string>();
  logs.forEach((log) => {
    if (!matchesWorkshopStage(log, stageId)) return;
    const unit = resolveWorkUnit(log.record_id);
    if (unit) units.add(unit);
  });
  return units.size;
}

export function resolveWorkshopGoal(
  goals: Array<{
    user_id?: string | null;
    stage?: string;
    technology_id?: string | null;
    model_id?: string | null;
    daily_goal?: number;
    weekly_goal?: number;
  }>,
  userId: string | null,
  goalStage: string,
  modelId?: string | null,
  techId?: string | null
): { daily: number; weekly: number } {
  type Scored = { g: (typeof goals)[number]; score: number };
  const scored: Scored[] = [];

  goals.forEach((g) => {
    if (g.stage !== goalStage) return;
    if (g.user_id && g.user_id !== userId) return;
    // Filtra a la meta del modelo/tecnología solicitados cuando se especifican;
    // las metas globales (sin model_id/technology_id) siguen siendo elegibles.
    if (modelId && g.model_id && g.model_id !== modelId) return;
    if (techId && g.technology_id && g.technology_id !== techId) return;
    if (!g.user_id && userId) {
      // global goal — lower priority than user-specific
    }

    let score = 0;
    if (g.user_id && userId && g.user_id === userId) score += 8;
    else if (!g.user_id) score += 2;
    else return;

    if (g.model_id) score += 4;
    if (g.technology_id) score += 2;

    scored.push({ g, score });
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.g;
  const daily = Number(best?.daily_goal) || 0;
  const weekly = Number(best?.weekly_goal) || (daily > 0 ? daily * 5 : 0);
  return { daily, weekly };
}

function buildStageMetric(
  hoy: number,
  semana: number,
  metaDia: number,
  metaSem: number
): WorkshopStageMetric {
  return {
    hoy,
    metaDia,
    pctDia: metaDia > 0 ? Math.min(999, Math.round((hoy / metaDia) * 100)) : null,
    semana,
    metaSem,
    pctSem: metaSem > 0 ? Math.min(999, Math.round((semana / metaSem) * 100)) : null,
    cumpleDia: metaDia > 0 ? hoy >= metaDia : null,
  };
}

export function buildWorkshopPerformance(params: {
  periodLogs: WorkshopAuditLog[];
  weekLogs: WorkshopAuditLog[];
  goals: Array<Record<string, unknown>>;
  getUserName: (id: string | null | undefined) => string;
  resolveWorkUnit: (recordId: string | null | undefined) => string | null;
  nameToUserId: Record<string, string | null>;
}): WorkshopPerformancePayload {
  const { periodLogs, weekLogs, goals, getUserName, resolveWorkUnit, nameToUserId } = params;

  const hoyByStage: Record<WorkshopStageId, Record<string, number>> = {} as Record<
    WorkshopStageId,
    Record<string, number>
  >;
  const semByStage: Record<WorkshopStageId, Record<string, number>> = {} as Record<
    WorkshopStageId,
    Record<string, number>
  >;
  const summary = {} as Record<WorkshopStageId, number>;
  const summarySemana = {} as Record<WorkshopStageId, number>;
  const allUsers = new Set<string>();

  WORKSHOP_KPI_STAGES.forEach((stage) => {
    hoyByStage[stage.id] = countWorkUnitsByUser(periodLogs, stage.id, getUserName, resolveWorkUnit);
    semByStage[stage.id] = countWorkUnitsByUser(weekLogs, stage.id, getUserName, resolveWorkUnit);
    summary[stage.id] = countWorkUnitsTotal(periodLogs, stage.id, resolveWorkUnit);
    summarySemana[stage.id] = countWorkUnitsTotal(weekLogs, stage.id, resolveWorkUnit);
    Object.keys(hoyByStage[stage.id]).forEach((u) => allUsers.add(u));
    Object.keys(semByStage[stage.id]).forEach((u) => allUsers.add(u));
  });

  const users: WorkshopUserPerformance[] = Array.from(allUsers)
    .map((usuario) => {
      const userId = nameToUserId[usuario] ?? null;
      const stages = {} as Record<WorkshopStageId, WorkshopStageMetric>;
      let totalHoy = 0;
      let totalSemana = 0;

      WORKSHOP_KPI_STAGES.forEach((stage) => {
        const hoy = hoyByStage[stage.id][usuario] ?? 0;
        const semana = semByStage[stage.id][usuario] ?? 0;
        const { daily, weekly } = resolveWorkshopGoal(goals as any[], userId, stage.goalStage);
        stages[stage.id] = buildStageMetric(hoy, semana, daily, weekly);
        totalHoy += hoy;
        totalSemana += semana;
      });

      return { usuario, userId, stages, totalHoy, totalSemana };
    })
    .filter((row) => row.totalHoy > 0 || row.totalSemana > 0)
    .sort((a, b) => b.totalHoy - a.totalHoy || b.totalSemana - a.totalSemana);

  return {
    stages: WORKSHOP_KPI_STAGES,
    summary,
    summarySemana,
    users,
  };
}

export function getWeekRangeReference(now = new Date()) {
  const start = new Date(now);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
