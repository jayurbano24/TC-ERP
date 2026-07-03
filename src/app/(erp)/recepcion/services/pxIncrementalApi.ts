import type { GuideData } from '../types/reception.types';
import type { PxLotInput, PxReceptionSnapshot } from '@/modules/recepcion/client/pxCapture';
import { apiFetch } from '@/lib/http/apiFetch';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

const INCREMENTAL_SESSION_KEY = 'tc_erp_px_incremental_reception_id';
export const PX_INCREMENTAL_ACTIVE_STATUS = 'EN_PROCESO';

export function isPxReceptionResumable(status: string | null | undefined): boolean {
  return (status || '').trim().toUpperCase() === PX_INCREMENTAL_ACTIVE_STATUS;
}

export function getIncrementalReceptionIdFromSession(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(INCREMENTAL_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setIncrementalReceptionIdInSession(receptionId: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (receptionId) sessionStorage.setItem(INCREMENTAL_SESSION_KEY, receptionId);
    else sessionStorage.removeItem(INCREMENTAL_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchPxInProgressList() {
  const res = await apiFetch('/api/recepcion/px');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al listar recepciones');
  return json.data as Array<{
    id: string;
    guide_number: string;
    sap_document: string | null;
    created_at: string;
    captured_count: number;
  }>;
}

export async function joinOrStartPxReceptionApi(input: {
  guideData: GuideData;
  operatorName: string;
  operatorId?: string | null;
  preferredGuideNumber?: string;
}) {
  const res = await apiFetch('/api/recepcion/px', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success && !json.receptionId) {
    throw new Error(json.error || 'No se pudo iniciar o unir a la recepción');
  }
  return json as {
    success: true;
    receptionId: string;
    guideNumber: string;
    joined: boolean;
  };
}

/** @deprecated use joinOrStartPxReceptionApi */
export const startPxReceptionApi = joinOrStartPxReceptionApi;

export async function fetchPxReceptionSnapshot(
  receptionId: string,
  options?: { includeEquipment?: boolean }
) {
  const params = options?.includeEquipment ? '?includeEquipment=1' : '';
  const res = await apiFetch(`/api/recepcion/px/${receptionId}${params}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Recepción no encontrada');
  return json.data as PxReceptionSnapshot;
}

export async function createPxBoxApi(
  receptionId: string,
  boxCode: string,
  lots: PxLotInput[]
) {
  const res = await apiFetch(`/api/recepcion/px/${receptionId}/boxes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxCode, lots }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo crear la caja');
  return json.box as { id: string; box_code: string };
}

export async function acquireBoxLockApi(input: {
  boxId: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo tomar control de la caja');
  return json as {
    locked_by?: string | null;
    lock_expires_at?: string | null;
    version?: number;
  };
}

export async function releaseBoxLockApi(input: {
  boxId: string;
  operatorId?: string | null;
  reason?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/lock`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo liberar la caja');
  return json;
}

export async function adjustPxBoxQuantityApi(input: {
  boxId: string;
  newDeclaredQuantity: number;
  reason: string;
  expectedVersion: number;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/quantity`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo ajustar cantidad');
  return json.data;
}

export async function closePxBoxApi(input: {
  boxId: string;
  expectedVersion: number;
  partialReason?: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo cerrar la caja');
  return json.data;
}

export async function promotePxBoxApi(input: {
  boxId: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo enviar la caja a bodega');
  return json.data;
}

export async function reopenPxBoxApi(input: {
  boxId: string;
  expectedVersion: number;
  reason?: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo reabrir la caja');
  return json.data;
}

export async function updatePxReceptionHeaderApi(input: {
  receptionId: string;
  guideData: GuideData;
  operatorName: string;
  expectedVersion: number;
}) {
  const res = await apiFetch(`/api/recepcion/px/${input.receptionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo guardar la cabecera');
  return json.data as PxReceptionSnapshot;
}

export async function appendPxCaptureLotsApi(boxId: string, lots: PxLotInput[]) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${boxId}/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lots }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo agregar el lote');
  return json.data as { declaredQuantity: number };
}

export type ScanPxEquipmentResult = {
  success: true;
  equipmentId: string;
  capturedCount: number;
  declaredQuantity: number;
  boxStatus: string;
};

export async function scanPxEquipmentApi(input: {
  receptionId: string;
  boxId: string;
  mainSerial: string;
  serialS2?: string;
  serialS3?: string;
  serialS4?: string;
  brandId?: string | null;
  modelId?: string | null;
  material?: string | null;
  operatorId?: string | null;
  operatorName?: string;
  workstationLabel?: string | null;
}): Promise<ScanPxEquipmentResult> {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      receptionId: input.receptionId,
      mainSerial: input.mainSerial,
      serialS2: input.serialS2,
      serialS3: input.serialS3,
      serialS4: input.serialS4,
      brandId: input.brandId,
      modelId: input.modelId,
      material: input.material,
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      workstationLabel: input.workstationLabel,
    }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al capturar equipo');
  return json as ScanPxEquipmentResult;
}

export type VoidPxEquipmentResult = {
  success: true;
  equipmentId: string;
  mainSerial: string;
  capturedCount: number;
  declaredQuantity: number;
  boxStatus: string;
  version: number;
};

export async function voidPxEquipmentApi(input: {
  receptionId: string;
  boxId: string;
  equipmentId?: string | null;
  mainSerial?: string | null;
  operatorId?: string | null;
  operatorName?: string;
}): Promise<VoidPxEquipmentResult> {
  const equipmentKey = input.equipmentId || 'pending';
  const res = await apiFetch(
    `/api/recepcion/px/boxes/${input.boxId}/equipment/${encodeURIComponent(equipmentKey)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receptionId: input.receptionId,
        mainSerial: input.mainSerial,
        sn: input.mainSerial,
        operatorId: input.operatorId,
        operatorName: input.operatorName,
      }),
    }
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al eliminar equipo');
  return json as VoidPxEquipmentResult;
}

export async function deletePxCaptureBoxApi(input: {
  receptionId: string;
  boxId: string;
  expectedVersion: number;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/boxes/${input.boxId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al eliminar caja');
  return json as { success: true; boxId: string; boxCode: string; version: number };
}

export type PxFinalizeProgress = {
  phase: 'prep' | 'promote';
  prepDone: number;
  prepTotal: number;
  promoteDone: number;
  promoteTotal: number;
  label: string;
};

export async function finalizePxPrepNextApi(input: {
  receptionId: string;
  expectedVersion: number;
}) {
  const res = await apiFetch(`/api/recepcion/px/${input.receptionId}/finalize/prep-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedVersion: input.expectedVersion }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al preparar caja');
  return json.data as {
    phase: 'preparing' | 'prepared' | 'done';
    box_code?: string | null;
    boxes_remaining: number;
    already_finalized?: boolean;
    guide_number?: string;
    received_units?: number;
  };
}

export async function finalizePxPromoteNextApi(input: {
  receptionId: string;
  expectedVersion: number;
  varianceReason?: string;
  operatorId?: string | null;
  operatorName?: string;
  stampVariance?: boolean;
}) {
  const res = await apiFetch(`/api/recepcion/px/${input.receptionId}/finalize/promote-next`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al promover equipos');
  return json.data as {
    phase: 'promoting' | 'done';
    promoted_this_batch: number;
    remaining_active: number;
    received_units?: number;
    reception_id?: string;
    guide_number?: string;
    status?: string;
    expected_units?: number;
    is_partial?: boolean;
    already_finalized?: boolean;
  };
}

/** Finaliza PX con el cliente orquestando prep/promote paso a paso (progreso en UI). */
export async function finalizePxReceptionStepwise(
  input: {
    receptionId: string;
    expectedVersion: number;
    varianceReason?: string;
    operatorId?: string | null;
    operatorName?: string;
    prepTotal: number;
    promoteTotal: number;
  },
  onProgress?: (progress: PxFinalizeProgress) => void,
) {
  let prepDone = 0;
  let prepBatches = 0;
  let promoteBatches = 0;

  const report = (phase: 'prep' | 'promote', label: string, promoteDone = 0) => {
    onProgress?.({
      phase,
      prepDone,
      prepTotal: input.prepTotal,
      promoteDone,
      promoteTotal: input.promoteTotal,
      label,
    });
  };

  report('prep', 'Preparando cajas para Bodega…');

  for (let i = 1; i <= BATCH_LIMITS.PX_FINALIZE_PREP_MAX_ITERATIONS; i += 1) {
    prepBatches = i;
    const prep = await finalizePxPrepNextApi({
      receptionId: input.receptionId,
      expectedVersion: input.expectedVersion,
    });

    if (prep.already_finalized || prep.phase === 'done') {
      return {
        reception_id: input.receptionId,
        guide_number: prep.guide_number ?? '',
        status: 'CLASIFICADA',
        received_units: prep.received_units ?? input.promoteTotal,
        expected_units: input.promoteTotal,
        is_partial: false,
        already_finalized: true,
        batches: { prep: 0, promote: 0 },
      };
    }

    prepDone = Math.max(0, input.prepTotal - prep.boxes_remaining);
    const prepLabel = prep.box_code
      ? `Caja ${prepDone}/${input.prepTotal} → ${prep.box_code}`
      : `Preparando ${prepDone}/${input.prepTotal}`;
    report('prep', prepLabel);

    if (prep.phase === 'prepared') break;
  }

  let promoteDone = 0;
  report('promote', 'Ingresando equipos a inventario…', 0);

  let lastDone: Awaited<ReturnType<typeof finalizePxPromoteNextApi>> | null = null;
  for (let i = 1; i <= BATCH_LIMITS.PX_FINALIZE_PROMOTE_MAX_ITERATIONS; i += 1) {
    promoteBatches = i;
    const promote = await finalizePxPromoteNextApi({
      receptionId: input.receptionId,
      expectedVersion: input.expectedVersion,
      varianceReason: input.varianceReason,
      operatorId: input.operatorId,
      operatorName: input.operatorName,
      stampVariance: i === 1,
    });

    promoteDone = Math.max(0, input.promoteTotal - promote.remaining_active);
    report(
      'promote',
      `Equipos ${promoteDone}/${input.promoteTotal} (+${promote.promoted_this_batch} en lote)`,
      promoteDone,
    );

    if (promote.phase === 'done') {
      lastDone = promote;
      break;
    }
  }

  if (!lastDone || lastDone.phase !== 'done') {
    throw new Error(
      'Finalización incompleta. Puede reintentar Finalizar — el progreso quedó guardado en servidor.',
    );
  }

  return {
    reception_id: lastDone.reception_id ?? input.receptionId,
    guide_number: lastDone.guide_number ?? '',
    status: lastDone.status ?? 'CLASIFICADA',
    received_units: lastDone.received_units ?? input.promoteTotal,
    expected_units: lastDone.expected_units ?? input.promoteTotal,
    is_partial: lastDone.is_partial ?? false,
    batches: { prep: prepBatches, promote: promoteBatches },
  };
}

export async function finalizePxReceptionApi(input: {
  receptionId: string;
  expectedVersion: number;
  varianceReason?: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const res = await apiFetch(`/api/recepcion/px/${input.receptionId}/finalize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'No se pudo finalizar la recepción');
  return json.data as {
    reception_id: string;
    guide_number: string;
    status: string;
    received_units: number;
    expected_units: number;
    is_partial: boolean;
    already_finalized?: boolean;
    batches?: { prep: number; promote: number };
  };
}
