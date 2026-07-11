import type { ApiAuthResult } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { runWithRequestScopedClient } from '@/lib/supabase/server-request-scope';

/**
 * ADR-011: ejecuta trabajo de lectura bajo el cliente resuelto (RLS si USE_RLS_READS).
 * DI (`@inject('SupabaseClient')`) y lecturas server heredan el scope vía ALS.
 */
export function withResolvedReadClient<T>(
  auth: ApiAuthResult,
  fn: () => Promise<T>
): Promise<T> {
  const { client } = resolveReadClient(auth.supabase);
  return runWithRequestScopedClient(client, fn);
}
