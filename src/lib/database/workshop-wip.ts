import type { WorkshopStageId } from '@/lib/database/workshop-kpi';

/** Conteo por OS (1 OS = 1 equipo), alineado con pestañas de Taller & Operación. */
export type WorkshopWipCounts = Record<WorkshopStageId, number> & {
  total: number;
};

/**
 * WIP en taller ahora — misma lógica que `produccion/taller/page.tsx` (current_status → etapa).
 */
export function buildWorkshopWipCounts(
  getCount: (status: string) => number
): WorkshopWipCounts {
  const byStage: Record<WorkshopStageId, number> = {
    diagnostico: getCount('in_workshop'),
    reparacion: getCount('in_qc'),
    reacondicionado: getCount('ready_to_dispatch'),
    control_calidad: getCount('in_validation'),
    l3: getCount('in_control_warehouse'),
    scraps: getCount('irreparable') + getCount('scrapped'),
    listo: getCount('in_central_warehouse'),
    aprobado: 0,
    rechazado: 0,
  };

  const total =
    byStage.diagnostico +
    byStage.reparacion +
    byStage.reacondicionado +
    byStage.control_calidad +
    byStage.l3 +
    byStage.scraps +
    byStage.listo;

  return { ...byStage, total };
}
