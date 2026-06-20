import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type { ClassifyBatchParams, ClassifyBatchResult } from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries } from '../audit';

export class ClassifyEquipmentBatchLegacyAdapter implements IClassifyBatchGateway {
  async classifyBatch(params: ClassifyBatchParams): Promise<ClassifyBatchResult> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: 'Supabase not configured' };

    const results: unknown[] = [];

    for (const unit of params.units) {
      if (!unit.main_serial) continue;

      const { count } = await supabase
        .from('service_orders')
        .select('*', { count: 'exact', head: true })
        .eq('main_serial', unit.main_serial);

      const reentryCount = (count || 0) + 1;

      const { data: sapTransfer } = await supabase
        .from('sap_transfer_documents')
        .select('reception_guide_id')
        .eq('id', params.sapTransferId)
        .single();

      const { data: osData, error: osError } = await supabase
        .from('service_orders')
        .insert([{
          reception_id: params.receptionId,
          reception_guide_id: sapTransfer?.reception_guide_id || null,
          sap_transfer_id: params.sapTransferId,
          model_id: unit.model_id,
          brand_id: unit.brand_id,
          main_serial: unit.main_serial,
          reentry_count: reentryCount,
          status: 'INGRESADO',
        }])
        .select()
        .single();

      if (osError) {
        console.error('Error creating Service Order:', osError);
        return { error: osError.message };
      }

      const seriesToUpsert = unit.all_series.map((sn) => ({
        serial_number: sn,
        current_reception_id: params.receptionId,
        service_order_id: osData.id,
        sap_transfer_id: params.sapTransferId,
        current_status: 'RECEPCIONADO_BODEGA_GENERAL',
        model_id: unit.model_id,
        brand_id: unit.brand_id,
        ...(unit.material ? { material: unit.material } : {}),
      }));

      const { data: upsertedSeries, error: seriesError } = await supabase
        .from('series')
        .upsert(seriesToUpsert, { onConflict: 'serial_number' })
        .select('id');

      if (seriesError) {
        await supabase.from('service_orders').delete().eq('id', osData.id);
        return { error: seriesError.message };
      }

      if (upsertedSeries) {
        await auditClassifiedSeries(
          upsertedSeries.map((s) => s.id),
          params.sapTransferId,
          params.registeredBy
        );
      }

      results.push(osData);
    }

    return { data: results };
  }
}
