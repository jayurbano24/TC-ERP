import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Invoca un RPC en schema `internal` (solo service_role).
 * Requiere que `internal` esté en Exposed schemas del proyecto Supabase
 * (Dashboard → Settings → API). Ver CHG-014.
 */
export function rpcInternal(
  supabase: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
) {
  return supabase.schema('internal').rpc(fn, args ?? {});
}
