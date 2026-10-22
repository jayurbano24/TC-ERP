import type { SupabaseClient } from '@supabase/supabase-js';
import { humanizeClassifyEquipmentError } from '../../client/humanizeClassifyError';
import type {
  ClassifyBatchParams,
  ClassifyBatchResult,
  ClassifyUnitSkipError,
} from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries, auditClassifyBatchCompleted } from '../audit';
import { chunkClassifyUnits } from './classify-equipment-batch-chunk';
import {
  CLASSIFY_TIMEOUT_SAFE_MESSAGE,
  findReconciledOpenServiceOrder,
  isClassifyLockTimeout,
  isClassifyRpcTimeout,
  reconciledClassifyResult,
} from './classify-batch-reconcile';
import { formatSkippedClassifyError, mergeClassifyBatchResults } from './classify-equipment-batch-merge';

export async function mapClassifyRpcPayload(
  params: ClassifyBatchParams,
  data: unknown,
  correlationId: string,
): Promise<ClassifyBatchResult> {
  const payload = data as {
    service_orders?: unknown[];
    series_ids?: string[];
    errors?: ClassifyUnitSkipError[];
    units_processed?: number;
    units_skipped?: number;
  } | null;

  const serviceOrders = Array.isArray(payload?.service_orders)
    ? payload.service_orders
    : [];

  const seriesIds = Array.isArray(payload?.series_ids)
    ? payload.series_ids.filter((id): id is string => typeof id === 'string')
    : [];

  const skippedErrors = Array.isArray(payload?.errors)
    ? payload.errors.filter((e): e is ClassifyUnitSkipError => !!e && typeof e === 'object')
    : [];

  const unitsProcessed = Number(payload?.units_processed ?? serviceOrders.length);
  const unitsSkipped = Number(payload?.units_skipped ?? skippedErrors.length);

  await auditClassifiedSeries(
    seriesIds,
    params.sapTransferId,
    params.registeredBy,
    correlationId,
  );

  if (serviceOrders.length > 0) {
    await auditClassifyBatchCompleted({
      receptionId: params.receptionId,
      sapTransferId: params.sapTransferId,
      unitsCount: serviceOrders.length,
      seriesCount: seriesIds.length,
      registeredBy: params.registeredBy,
      correlationId,
    });
  }

  const partialError =
    skippedErrors.length > 0
      ? formatSkippedClassifyError(skippedErrors[0])
      : unitsSkipped > 0 && serviceOrders.length < params.units.length
        ? `Serie duplicada: ${params.units.length - serviceOrders.length} equipo(s) no se pudieron ingresar. Revise duplicados en el lote o series ya registradas en TC.`
        : undefined;

  return {
    data: serviceOrders.length > 0 ? serviceOrders : undefined,
    error: partialError,
    skippedErrors: skippedErrors.length > 0 ? skippedErrors : undefined,
    unitsProcessed,
    unitsSkipped,
  };
}

export async function classifyEquipmentBatchOnce(
  supabase: SupabaseClient,
  params: ClassifyBatchParams,
): Promise<ClassifyBatchResult> {
  const correlationId = params.correlationId ?? params.receptionId;

  const { data, error } = await supabase.rpc('classify_equipment_batch_tx', {
    p_reception_id: params.receptionId,
    p_sap_transfer_id: params.sapTransferId,
    p_units: params.units,
    p_registered_by: params.registeredBy,
    p_correlation_id: correlationId,
  });

  if (error) {
    console.error('classify_equipment_batch_tx:', error);
    if (isClassifyLockTimeout(error.message, error.code)) {
      return {
        error: 'Conflicto de bloqueo al clasificar. Espere un momento e intente de nuevo.',
        rpcCode: error.code,
      };
    }
    const human = humanizeClassifyEquipmentError(error.message);
    return { error: human.description, rpcCode: error.code };
  }

  return mapClassifyRpcPayload(params, data, correlationId);
}

async function classifyUnitWithReconcile(
  supabase: SupabaseClient,
  params: ClassifyBatchParams,
): Promise<ClassifyBatchResult> {
  const mainSerial = params.units[0]?.main_serial ?? '';
  const last = await classifyEquipmentBatchOnce(supabase, params);

  if (!last.error || last.data?.length) {
    return last;
  }

  if (isClassifyLockTimeout(last.error ?? '', last.rpcCode)) {
    return {
      error: last.error ?? 'Conflicto de bloqueo al clasificar. Espere e intente de nuevo.',
      rpcCode: last.rpcCode,
    };
  }

  if (isClassifyRpcTimeout(last.error ?? '', last.rpcCode)) {
    const reconciled = await findReconciledOpenServiceOrder(supabase, {
      receptionId: params.receptionId,
      sapTransferId: params.sapTransferId,
      mainSerial,
    });
    if (reconciled) {
      return reconciledClassifyResult(reconciled);
    }
    return { error: CLASSIFY_TIMEOUT_SAFE_MESSAGE, rpcCode: last.rpcCode };
  }

  return last;
}

/** Ejecuta classify en sub-lotes (1 equipo) — usable en servidor o cliente. */
export async function runClassifyEquipmentBatchChunked(
  supabase: SupabaseClient,
  params: ClassifyBatchParams,
): Promise<ClassifyBatchResult> {
  if (!params.units.length) {
    return { error: 'No hay equipos para clasificar.' };
  }

  const chunks = chunkClassifyUnits(params.units);
  const parts: ClassifyBatchResult[] = [];
  const baseCorrelation = params.correlationId ?? params.receptionId;

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkUnits = chunks[index];
    const part = await classifyUnitWithReconcile(supabase, {
      ...params,
      units: chunkUnits,
      correlationId: `${baseCorrelation}:u${index + 1}`,
    });

    parts.push(part);

    if (part.error && !part.data?.length) {
      break;
    }
  }

  return mergeClassifyBatchResults(params, parts);
}
