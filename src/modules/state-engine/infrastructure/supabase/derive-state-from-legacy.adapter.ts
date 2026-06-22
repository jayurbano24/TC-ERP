import type { SupabaseClient } from '@supabase/supabase-js';

export type RefreshOperationalStatesResult = {
  operationalStatesUpserted: number;
};

/** Strangler: delega en RPC SQL hasta que todas las transiciones pasen por commands. */
export class DeriveStateFromLegacyAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async refreshAllFromLegacy(): Promise<RefreshOperationalStatesResult> {
    const { data, error } = await this.supabase.rpc('refresh_service_order_operational_states');

    if (error) throw new Error(error.message);

    const payload = (data ?? {}) as { operational_states_upserted?: number };
    return {
      operationalStatesUpserted: Number(payload.operational_states_upserted ?? 0),
    };
  }
}
