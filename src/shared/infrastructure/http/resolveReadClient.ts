import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { useRlsReads } from '@/shared/feature-flags/rlsReads';

/**
 * Elige cliente de lectura para GETs migrables (ADR-011 2A).
 * - USE_RLS_READS=true + auth.supabase → respeta RLS del usuario
 * - fallback → service role (comportamiento histórico)
 */
export function resolveReadClient(
  userSupabase: SupabaseClient | null | undefined
): { client: SupabaseClient; mode: 'rls' | 'service_role' } {
  if (useRlsReads() && userSupabase) {
    return { client: userSupabase, mode: 'rls' };
  }
  return { client: getSupabaseServerClient(), mode: 'service_role' };
}
