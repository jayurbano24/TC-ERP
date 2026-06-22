/** Desglose de OS recepcionados en periodo por current_status de series (1 OS = 1 equipo). */
export type PeriodCohortBreakdown = {
  total: number;
  byStatus: Record<string, number>;
  pendienteIngresoBodega: number;
  /** INGRESO BODEGA → in_central_warehouse (+ sub-bodega in_control_warehouse) */
  enInventarioBodega: number;
  /** Estados operativos de taller (excluye in_central_warehouse que es bodega/listo) */
  enTallerOperativo: number;
  despachados: number;
  devueltos: number;
  sinSerieVinculada: number;
  otros: number;
};

const INVENTARIO_BODEGA = new Set(['in_central_warehouse', 'in_control_warehouse']);
const TALLER_OPERATIVO = new Set([
  'in_workshop',
  'in_qc',
  'in_validation',
  'ready_to_dispatch',
  'irreparable',
  'scrapped',
]);
const PENDIENTE_INGRESO = 'RECEPCIONADO_BODEGA_GENERAL';

export function buildPeriodCohortBreakdown(
  periodOsIds: Set<string>,
  statusByOsId: Map<string, string | null | undefined>
): PeriodCohortBreakdown {
  const byStatus: Record<string, number> = {};
  let pendienteIngresoBodega = 0;
  let enInventarioBodega = 0;
  let enTallerOperativo = 0;
  let despachados = 0;
  let devueltos = 0;
  let sinSerieVinculada = 0;
  let otros = 0;

  periodOsIds.forEach((osId) => {
    const raw = statusByOsId.get(osId);
    const status = raw?.trim() || 'SIN_SERIE';
    byStatus[status] = (byStatus[status] || 0) + 1;

    if (status === 'SIN_SERIE') sinSerieVinculada++;
    else if (status === PENDIENTE_INGRESO) pendienteIngresoBodega++;
    else if (INVENTARIO_BODEGA.has(status)) enInventarioBodega++;
    else if (TALLER_OPERATIVO.has(status)) enTallerOperativo++;
    else if (status === 'dispatched') despachados++;
    else if (status === 'returned' || status === 'obsolete') devueltos++;
    else otros++;
  });

  return {
    total: periodOsIds.size,
    byStatus,
    pendienteIngresoBodega,
    enInventarioBodega,
    enTallerOperativo,
    despachados,
    devueltos,
    sinSerieVinculada,
    otros,
  };
}

export const STATUS_LABELS: Record<string, string> = {
  RECEPCIONADO_BODEGA_GENERAL: 'Pendiente INGRESO BODEGA',
  in_central_warehouse: 'Bodega central',
  in_control_warehouse: 'Sub-bodega / control',
  in_workshop: 'Taller · diagnóstico',
  in_qc: 'Taller · reparación',
  in_validation: 'Taller · control calidad',
  ready_to_dispatch: 'Taller · reacond./listo despacho',
  irreparable: 'Scrap / irreparable',
  scrapped: 'Scrap',
  dispatched: 'Despachado',
  returned: 'Devuelto',
  obsolete: 'Obsoleto',
  in_validation: 'Validación',
  received: 'Recibido (sin clasificar)',
  SIN_SERIE: 'Sin serie vinculada',
};
