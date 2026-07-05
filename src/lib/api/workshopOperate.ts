import {
  BATCH_LIMITS,
  getWorkshopOperateBatchSize,
} from '@/shared/constants/batchLimits';

export type WorkshopOperatePayload = {
  seriesIds: string[];
  result: string;
  notes: string;
  selectedDiagnostics?: string[];
  actionName: string;
};

function chunkSeriesIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function operateWorkshopBatchCall(payload: WorkshopOperatePayload): Promise<number> {
  const res = await fetch('/api/v1/workshop/operate-batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      series_ids: payload.seriesIds,
      result: payload.result,
      notes: payload.notes,
      selected_diagnostics: payload.selectedDiagnostics,
      action_name: payload.actionName,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
  }
  return Number(data.processed ?? payload.seriesIds.length);
}

export type WorkshopOperateProgress = {
  /** Series ya procesadas en BD. */
  processedSeries: number;
  totalSeries: number;
  equipmentCount: number;
  batchIndex: number;
  batchCount: number;
};

/** Traspasa equipos en lotes de series (cada equipo mueve todas sus series juntas). */
export async function operateWorkshopInBatches(
  payload: Omit<WorkshopOperatePayload, 'seriesIds'> & {
    seriesIds: string[];
    equipmentCount: number;
  },
  onProgress?: (p: WorkshopOperateProgress) => void
): Promise<number> {
  const batchSize = getWorkshopOperateBatchSize();
  const chunks = chunkSeriesIds(payload.seriesIds, batchSize);
  let processedSeries = 0;

  for (let i = 0; i < chunks.length; i++) {
    const n = await operateWorkshopBatchCall({
      ...payload,
      seriesIds: chunks[i],
    });
    processedSeries += n;
    onProgress?.({
      processedSeries,
      totalSeries: payload.seriesIds.length,
      equipmentCount: payload.equipmentCount,
      batchIndex: i + 1,
      batchCount: chunks.length,
    });
  }

  return processedSeries;
}

/** Filas seleccionadas = equipos (1 equipo ≈ 1 OS en cola). */
export function countEquipmentsInSelection(
  items: Array<{ all_dbIds?: string[]; dbId?: string }>
): number {
  return items.length;
}

/** Total de registros series a actualizar (S1…S4 por equipo). */
export function countSeriesInSelection(
  items: Array<{ all_dbIds?: string[]; dbId?: string; total_series?: number }>
): number {
  return items.reduce((sum, item) => sum + (item.all_dbIds?.length || item.total_series || 1), 0);
}

export function validateWorkshopOperateSelection(
  equipmentCount: number,
  seriesCount: number
): { ok: true } | { ok: false; message: string } {
  if (equipmentCount > BATCH_LIMITS.WORKSHOP_OPERATE_MAX_EQUIPMENTS) {
    return {
      ok: false,
      message: `Máximo ${BATCH_LIMITS.WORKSHOP_OPERATE_MAX_EQUIPMENTS} equipos por operación. Seleccionó ${equipmentCount}.`,
    };
  }
  if (seriesCount > BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES) {
    return {
      ok: false,
      message: `Máximo ${BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES} series por operación. Seleccionó ${seriesCount} (${equipmentCount} equipos).`,
    };
  }
  if (equipmentCount === 0) {
    return { ok: false, message: 'Seleccione al menos un equipo.' };
  }
  return { ok: true };
}

export function formatWorkshopSelectionLabel(
  items: Array<{ all_dbIds?: string[]; dbId?: string; total_series?: number }>
): string {
  const eq = countEquipmentsInSelection(items);
  const ser = countSeriesInSelection(items);
  return `${eq} equipo${eq !== 1 ? 's' : ''} / ${ser} serie${ser !== 1 ? 's' : ''}`;
}
