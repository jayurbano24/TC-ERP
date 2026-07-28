import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeClassifyEquipmentError } from '../../client/humanizeClassifyError';
import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type { ClassifyBatchParams, ClassifyBatchResult } from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries, auditClassifyBatchCompleted } from '../audit';

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
    } | null;

    const serviceOrders = Array.isArray(payload?.service_orders)
      ? payload.service_orders
      : [];

    const seriesIds = Array.isArray(payload?.series_ids)
      ? payload.series_ids.filter((id): id is string => typeof id === 'string')
      : [];

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

    return { data: serviceOrders };
  }
}
