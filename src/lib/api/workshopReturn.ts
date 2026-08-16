import { BATCH_LIMITS, getWorkshopOperateBatchSize } from '@/shared/constants/batchLimits';
import { apiFetch } from '@/lib/http/apiFetch';

export type ReturnCandidates = {
  seriesIds: string[];
  equipmentCount: number;
  seriesCount: number;
};

function chunkSeriesIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export async function fetchRepairWithoutDiagnosisCandidates(): Promise<ReturnCandidates> {
  const res = await apiFetch('/api/v1/workshop/return-candidates?source=in_qc', {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return {
    seriesIds: (data.seriesIds ?? []) as string[],
    equipmentCount: Number(data.equipmentCount ?? 0),
    seriesCount: Number(data.seriesCount ?? 0),
  };
}

export async function returnWorkshopSeriesBatchCall(params: {
  seriesIds: string[];
  targetStatus?: string;
  reason?: string;
  clearBoxId?: boolean;
}): Promise<number> {
  const res = await apiFetch('/api/v1/workshop/return-batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      series_ids: params.seriesIds,
      target_status: params.targetStatus ?? 'in_workshop',
      reason: params.reason,
      clear_box_id: params.clearBoxId ?? false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
  }
  return Number(data.processed ?? params.seriesIds.length);
}

export type ReturnProgress = {
  processedSeries: number;
  totalSeries: number;
  batchIndex: number;
  batchCount: number;
};

/** Regresa series a otra etapa en lotes (p. ej. Reparación → Diagnóstico). */
export async function returnWorkshopInBatches(
  seriesIds: string[],
  opts?: {
    targetStatus?: string;
    reason?: string;
    clearBoxId?: boolean;
    onProgress?: (p: ReturnProgress) => void;
  }
): Promise<number> {
  const batchSize = getWorkshopOperateBatchSize();
  const chunks = chunkSeriesIds(seriesIds, batchSize);
  let processedSeries = 0;

  for (let i = 0; i < chunks.length; i++) {
    const n = await returnWorkshopSeriesBatchCall({
      seriesIds: chunks[i],
      targetStatus: opts?.targetStatus,
      reason: opts?.reason,
      clearBoxId: opts?.clearBoxId,
    });
    processedSeries += n;
    opts?.onProgress?.({
      processedSeries,
      totalSeries: seriesIds.length,
      batchIndex: i + 1,
      batchCount: chunks.length,
    });
  }

  return processedSeries;
}

export function validateReturnSelection(
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
      message: `Máximo ${BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES} series por operación. Seleccionó ${seriesCount}.`,
    };
  }
  if (equipmentCount === 0) {
    return { ok: false, message: 'Seleccione al menos un equipo.' };
  }
  return { ok: true };
}
