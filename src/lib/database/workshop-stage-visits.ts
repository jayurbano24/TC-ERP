import {
  WORKSHOP_KPI_STAGES,
  type WorkshopAuditLog,
  type WorkshopStageId,
} from '@/lib/database/workshop-kpi';

export type TimedWorkshopAuditLog = WorkshopAuditLog & { created_at: string };

export type StageVisitMetrics = {
  /** OS únicas — primera vez que completan la etapa (producción) */
  productionUnits: number;
  /** Eventos de retrabajo (visitas > 1) */
  reworkEvents: number;
};

export type WorkshopVisitSummaries = {
  period: Record<WorkshopStageId, StageVisitMetrics>;
  week: Record<WorkshopStageId, StageVisitMetrics>;
};

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

type TaggedVisit = {
  stageId: WorkshopStageId;
  unit: string;
  visit: number;
  created_at: string;
};

function tagVisits(
  allLogs: TimedWorkshopAuditLog[],
  resolveWorkUnit: (recordId: string | null | undefined) => string | null
): TaggedVisit[] {
  const sorted = [...allLogs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const visitNext = new Map<string, number>();
  const tagged: TaggedVisit[] = [];

  for (const log of sorted) {
    for (const stage of WORKSHOP_KPI_STAGES) {
      if (!matchesStage(log, stage.id)) continue;
      const unit = resolveWorkUnit(log.record_id);
      if (!unit) continue;
      const key = `${stage.id}:${unit}`;
      const visit = (visitNext.get(key) ?? 0) + 1;
      visitNext.set(key, visit);
      tagged.push({
        stageId: stage.id,
        unit,
        visit,
        created_at: log.created_at,
      });
    }
  }

  return tagged;
}

function summarizeWindow(
  tagged: TaggedVisit[],
  startIso: string,
  endIso: string
): Record<WorkshopStageId, StageVisitMetrics> {
  const base = {} as Record<WorkshopStageId, StageVisitMetrics>;
  WORKSHOP_KPI_STAGES.forEach((s) => {
    base[s.id] = { productionUnits: 0, reworkEvents: 0 };
  });

  const productionSets: Partial<Record<WorkshopStageId, Set<string>>> = {};
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();

  tagged.forEach((t) => {
    const ts = new Date(t.created_at).getTime();
    if (ts < start || ts > end) return;

    if (t.visit === 1) {
      if (!productionSets[t.stageId]) productionSets[t.stageId] = new Set();
      productionSets[t.stageId]!.add(t.unit);
    } else {
      base[t.stageId].reworkEvents += 1;
    }
  });

  WORKSHOP_KPI_STAGES.forEach((s) => {
    base[s.id].productionUnits = productionSets[s.id]?.size ?? 0;
  });

  return base;
}

export function buildWorkshopVisitSummaries(params: {
  allLogs: TimedWorkshopAuditLog[];
  periodStartIso: string;
  periodEndIso: string;
  weekStartIso: string;
  weekEndIso: string;
  resolveWorkUnit: (recordId: string | null | undefined) => string | null;
}): WorkshopVisitSummaries {
  const tagged = tagVisits(params.allLogs, params.resolveWorkUnit);
  return {
    period: summarizeWindow(tagged, params.periodStartIso, params.periodEndIso),
    week: summarizeWindow(tagged, params.weekStartIso, params.weekEndIso),
  };
}

/** Yield solo con datos QC; 0/0 → null */
export function computeYieldPct(aprobados: number, rechazados: number): number | null {
  const total = aprobados + rechazados;
  if (total === 0) return null;
  return Math.round((aprobados / total) * 1000) / 10;
}
