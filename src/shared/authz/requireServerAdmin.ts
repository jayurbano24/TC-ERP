import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUserServerClient } from '@/lib/supabase/server-user';
import { loadUserAuthz } from '@/shared/authz/permissions';

/**
 * Exige sesión + GERENTE GENERAL (app_is_admin vía loadUserAuthz).
 * ADR-011 2C: las admin actions no deben confiar solo en UI.
 * Nota: sin 'use server' aquí — los callers (`"use server"` en users.ts / admin.ts)
 * son las Server Actions; exportar helpers sync desde un 'use server' rompe el build.
 */
export async function requireServerAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const userClient = await getSupabaseUserServerClient();
  if (!userClient) {
    return { ok: false, error: 'No autenticado' };
  }
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, error: 'No autenticado' };
  }
  const authz = await loadUserAuthz(data.user.id);
  if (!authz.isAdmin) {
    console.warn('[ADMIN_ACTION] deny', { userId: data.user.id });
    return { ok: false, error: 'No autorizado: se requiere administrador' };
  }
  return { ok: true, userId: data.user.id };
}

export function getServiceRoleAdminClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRoleKey || !url) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL no configurados');
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
