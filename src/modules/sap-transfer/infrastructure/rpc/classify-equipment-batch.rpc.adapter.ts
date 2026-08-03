import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeClassifyEquipmentError } from '../../client/humanizeClassifyError';
import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type {
  ClassifyBatchParams,
  ClassifyBatchResult,
  ClassifyUnitSkipError,
} from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries, auditClassifyBatchCompleted } from '../audit';

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

export class ClassifyEquipmentBatchRpcAdapter implements IClassifyBatchGateway {
  async classifyBatch(params: ClassifyBatchParams): Promise<ClassifyBatchResult> {
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

    // Éxito parcial: el RPC no lanza excepción si procesó ≥1, pero trae `errors`.
    const partialError =
      skippedErrors.length > 0
        ? formatSkippedError(skippedErrors[0])
        : unitsSkipped > 0 && serviceOrders.length < params.units.length
          ? `Serie duplicada: ${params.units.length - serviceOrders.length} equipo(s) no se pudieron ingresar. Revise duplicados en el lote o series ya registradas en TC.`
          : undefined;

    return {
      data: serviceOrders,
      error: partialError,
      skippedErrors,
      unitsProcessed,
      unitsSkipped,
    };
  }
}
