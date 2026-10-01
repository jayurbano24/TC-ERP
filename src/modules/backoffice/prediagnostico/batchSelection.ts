export const PREDIAGNOSTICO_BATCH_MAX = 25;

export type BatchEquipment = {
  serviceOrderId: string;
  techId: string;
  modelId: string;
};

export function batchSelectionError(selected: BatchEquipment[], candidate: BatchEquipment): string | null {
  if (!candidate.serviceOrderId) return 'Esta fila no tiene orden de servicio';
  if (!candidate.techId || !candidate.modelId) return 'Falta tecnología o modelo en esta orden';
  if (selected.some((row) => row.serviceOrderId === candidate.serviceOrderId)) return null;
  if (selected.length >= PREDIAGNOSTICO_BATCH_MAX) {
    return `Máximo ${PREDIAGNOSTICO_BATCH_MAX} equipos del mismo modelo y tecnología`;
  }
  const anchor = selected[0];
  if (anchor && (anchor.techId !== candidate.techId || anchor.modelId !== candidate.modelId)) {
    return 'Solo puedes agrupar equipos del mismo modelo y tecnología';
  }
  return null;
}

export function assertUniformBatch(rows: BatchEquipment[], requestedIds: string[]): string | null {
  if (requestedIds.length < 1 || requestedIds.length > PREDIAGNOSTICO_BATCH_MAX) {
    return `Selecciona entre 1 y ${PREDIAGNOSTICO_BATCH_MAX} órdenes`;
  }
  if (new Set(requestedIds).size !== requestedIds.length) return 'Hay órdenes repetidas en la selección';
  const byId = new Map(rows.map((row) => [row.serviceOrderId, row]));
  const matched: BatchEquipment[] = [];
  for (const id of requestedIds) {
    const row = byId.get(id);
    if (!row) return 'Alguna orden no está en el historial';
    matched.push(row);
  }
  const anchor = matched[0];
  if (!anchor?.techId || !anchor.modelId) return 'Falta tecnología o modelo';
  if (matched.some((row) => row.techId !== anchor.techId || row.modelId !== anchor.modelId)) {
    return 'Solo puedes agrupar equipos del mismo modelo y tecnología';
  }
  return null;
}
