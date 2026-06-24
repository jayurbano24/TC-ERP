import { registerAccessoryDispatch as legacyDispatch } from '@/lib/database/accessories';
import type { IAccessoryDispatchGateway } from '../../domain/ports/accessory-dispatch.gateway.port';
import type {
  DispatchAccessoryOutParams,
  DispatchAccessoryOutResult,
} from '../../domain/types/accessory-dispatch.types';

export class AccessoryDispatchLegacyAdapter implements IAccessoryDispatchGateway {
  async dispatchOut(params: DispatchAccessoryOutParams): Promise<DispatchAccessoryOutResult> {
    const res = await legacyDispatch(
      params.accessoryId,
      params.condition,
      params.quantity,
      params.destination,
      params.notes,
      params.boxId || undefined
    );

    if (res.error) return { success: false, error: res.error };

    return {
      success: true,
      dispatchMode: params.dispatchBatchId ? 'WITH_BATCH' : 'WITHOUT_BATCH',
    };
  }
}
