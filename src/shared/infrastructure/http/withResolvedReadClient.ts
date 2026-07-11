import type { ApiAuthResult } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { runWithSupabaseClient } from '@/lib/supabase/server';

/**
 * ADR-011: ejecuta trabajo de lectura bajo el cliente resuelto (RLS si USE_RLS_READS).
 * DI (`@inject('SupabaseClient')`) y `getSupabaseServerClient()` heredan el scope.
 */
export function withResolvedReadClient<T>(
  auth: ApiAuthResult,
  fn: () => Promise<T>
): Promise<T> {
  const { client } = resolveReadClient(auth.supabase);
  return runWithSupabaseClient(client, fn);
}
