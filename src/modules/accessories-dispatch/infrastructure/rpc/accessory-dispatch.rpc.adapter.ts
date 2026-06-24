import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IAccessoryDispatchGateway } from '../../domain/ports/accessory-dispatch.gateway.port';
import type {
  DispatchAccessoryOutParams,
  DispatchAccessoryOutResult,
} from '../../domain/types/accessory-dispatch.types';

export class AccessoryDispatchRpcAdapter implements IAccessoryDispatchGateway {
  async dispatchOut(params: DispatchAccessoryOutParams): Promise<DispatchAccessoryOutResult> {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.rpc('accessory_dispatch_out_tx', {
        p_accessory_id: params.accessoryId,
        p_condition: params.condition,
        p_quantity: params.quantity,
        p_destination: params.destination,
        p_notes: params.notes || null,
        p_dispatch_batch_id: params.dispatchBatchId || null,
        p_operator_id: params.operatorId || null,
        p_box_id: params.boxId || null,
      });

      if (error) return { success: false, error: error.message };

      const payload = (data || {}) as {
        movement_id?: string;
        dispatch_mode?: 'WITH_BATCH' | 'WITHOUT_BATCH';
      };

      return {
        success: true,
        movementId: payload.movement_id,
        dispatchMode: payload.dispatch_mode || (params.dispatchBatchId ? 'WITH_BATCH' : 'WITHOUT_BATCH'),
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Error al despachar accesorio.',
      };
    }
  }
}
