import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { rpcViaDirectPostgresNamed } from '@/lib/database/pgDirect';

type RpcInternalError = Pick<PostgrestError, 'message'> & {
  code?: string;
  details?: string;
  hint?: string;
};

export type RpcInternalResult<T = unknown> = {
  data: T | null;
  error: RpcInternalError | null;
};

function mapPostgrestError(error: PostgrestError | null): RpcInternalError | null {
  if (!error) return null;
  return {
    message: error.message,
    code: error.code,
    details: error.details ?? undefined,
    hint: error.hint ?? undefined,
  };
}

/**
 * Invoca un RPC de schema `internal` desde server (service_role).
 *
 * Orden (sin exigir exponer `internal` en Data API):
 * 1. PostgREST `public.<fn>` — wrappers service_role (migración 166)
 * 2. Postgres directo → `internal.<fn>` (`DATABASE_URL` / `DIRECT_URL`)
 * 3. PostgREST `internal.<fn>` — solo si el schema está expuesto
 */
export async function rpcInternal<T = unknown>(
  supabase: SupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcInternalResult<T>> {
  const payload = args ?? {};

  const publicRpc = await supabase.rpc(fn, payload);
  if (!publicRpc.error) {
    return { data: (publicRpc.data as T | null) ?? null, error: null };
  }

  const direct = await rpcViaDirectPostgresNamed<T>(`internal.${fn}`, payload);
  if (!direct.error) {
    return { data: direct.data, error: null };
  }

  const internalRpc = await supabase.schema('internal').rpc(fn, payload);
  if (!internalRpc.error) {
    return { data: (internalRpc.data as T | null) ?? null, error: null };
  }

  return {
    data: null,
    error:
      mapPostgrestError(publicRpc.error) ??
      mapPostgrestError(internalRpc.error) ?? {
        message: direct.error.message || 'RPC_INTERNAL_UNAVAILABLE',
      },
  };
}
