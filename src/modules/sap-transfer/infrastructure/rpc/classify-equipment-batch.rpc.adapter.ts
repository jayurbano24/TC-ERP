import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeClassifyEquipmentError } from '../../client/humanizeClassifyError';
import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type {
  ClassifyBatchParams,
  ClassifyBatchResult,
  ClassifyUnitSkipError,
} from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries, auditClassifyBatchCompleted } from '../audit';
import {
  chunkClassifyUnits,
  isClassifyUpstreamTimeout,
} from './classify-equipment-batch-chunk';

function formatSkippedError(err: ClassifyUnitSkipError): string {
  const serial = String(err.main_serial || err.serial || '').trim();
  const detail = String(err.error || '').trim();
  if (detail) {
    const human = humanizeClassifyEquipmentError(
      serial && !/serie duplicada/i.test(detail) ? `Serie duplicada: ${serial}. ${detail}` : detail
    );
    return human.description;
  }
  if (serial) {
    return humanizeClassifyEquipmentError(
      `Serie duplicada: ${serial} ya está registrada con una orden de servicio abierta.`
    ).description;
  }
  return humanizeClassifyEquipmentError('Serie duplicada: una serie del lote ya está registrada.').description;
}

function mergeClassifyResults(
  params: ClassifyBatchParams,
  parts: ClassifyBatchResult[],
): ClassifyBatchResult {
  const serviceOrders: unknown[] = [];
  const skippedErrors: ClassifyUnitSkipError[] = [];
  let unitsProcessed = 0;
  let unitsSkipped = 0;
  const fatalErrors: string[] = [];

  for (const part of parts) {
    if (part.data?.length) {
      serviceOrders.push(...part.data);
    }
    if (part.skippedErrors?.length) {
      skippedErrors.push(...part.skippedErrors);
    }
    unitsProcessed += Number(part.unitsProcessed ?? part.data?.length ?? 0);
    unitsSkipped += Number(part.unitsSkipped ?? part.skippedErrors?.length ?? 0);
    if (part.error && !part.data?.length) {
      fatalErrors.push(part.error);
    } else if (part.error) {
      fatalErrors.push(part.error);
    }
  }

  const partialError =
    skippedErrors.length > 0
      ? formatSkippedError(skippedErrors[0])
      : unitsSkipped > 0 && serviceOrders.length < params.units.length
        ? `Serie duplicada: ${params.units.length - serviceOrders.length} equipo(s) no se pudieron ingresar. Revise duplicados en el lote o series ya registradas en TC.`
        : fatalErrors.length > 0 && serviceOrders.length === 0
          ? fatalErrors[0]
          : fatalErrors.length > 0
            ? fatalErrors[fatalErrors.length - 1]
            : undefined;

  return {
    data: serviceOrders.length > 0 ? serviceOrders : undefined,
    error: partialError,
    skippedErrors: skippedErrors.length > 0 ? skippedErrors : undefined,
    unitsProcessed,
    unitsSkipped,
  };
}

export class ClassifyEquipmentBatchRpcAdapter implements IClassifyBatchGateway {
  async classifyBatch(params: ClassifyBatchParams): Promise<ClassifyBatchResult> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: 'Supabase not configured' };

    const chunks = chunkClassifyUnits(params.units);
    if (chunks.length <= 1) {
      return this.classifyBatchOnce(params);
    }

    const parts: ClassifyBatchResult[] = [];
    const baseCorrelation = params.correlationId ?? params.receptionId;

    for (let index = 0; index < chunks.length; index += 1) {
      const chunkUnits = chunks[index];
      let part = await this.classifyBatchOnce({
        ...params,
        units: chunkUnits,
        correlationId: `${baseCorrelation}:c${index + 1}`,
      });

      if (
        part.error &&
        !part.data?.length &&
        isClassifyUpstreamTimeout(part.error)
      ) {
        await new Promise((r) => setTimeout(r, 1500));
        part = await this.classifyBatchOnce({
          ...params,
          units: chunkUnits,
          correlationId: `${baseCorrelation}:c${index + 1}:retry`,
        });
      }

      parts.push(part);

      if (part.error && !part.data?.length) {
        break;
      }
    }

    return mergeClassifyResults(params, parts);
  }

  private async classifyBatchOnce(params: ClassifyBatchParams): Promise<ClassifyBatchResult> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: 'Supabase not configured' };

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
      const human = humanizeClassifyEquipmentError(error.message);
      return { error: human.description };
    }

    return this.mapRpcPayload(params, data, correlationId);
  }

  private async mapRpcPayload(
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
      correlationId
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
        ? formatSkippedError(skippedErrors[0])
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
}
