import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUserServerClient } from '@/lib/supabase/server-user';
import { loadUserAuthz } from '@/shared/authz/permissions';
import { canDo, type UserAuthz } from '@/shared/authz/canDo';
import { AUTHZ_MODULE, type PermAction } from '@/shared/authz/modules';

export type ServerAuthzGate =
  | { ok: true; userId: string; authz: UserAuthz }
  | { ok: false; error: string };

async function loadSessionAuthz(): Promise<ServerAuthzGate> {
  const userClient = await getSupabaseUserServerClient();
  if (!userClient) {
    return { ok: false, error: 'No autenticado' };
  }
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, error: 'No autenticado' };
  }
  const authz = await loadUserAuthz(data.user.id);
  return { ok: true, userId: data.user.id, authz };
}

/**
 * Exige sesión + GERENTE GENERAL (app_is_admin vía loadUserAuthz).
 * ADR-011 2C: las admin actions no deben confiar solo en UI.
 * Nota: sin 'use server' aquí — los callers (`"use server"` en users.ts / admin.ts)
 * son las Server Actions; exportar helpers sync desde un 'use server' rompe el build.
 */
export async function requireServerAdmin(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await loadSessionAuthz();
  if (!session.ok) return session;
  if (!session.authz.isAdmin) {
    console.warn('[ADMIN_ACTION] deny', { userId: session.userId });
    return { ok: false, error: 'No autorizado: se requiere administrador' };
  }
  return { ok: true, userId: session.userId };
}

/** Regla pura: admin total o permiso de módulo (alineado con useCan en UI). */
export function canPassServerModuleGate(
  authz: UserAuthz,
  module: string,
  action: PermAction
): boolean {
  return canDo(authz, module, action);
}

/**
 * Exige sesión + permiso de edición en Seguridad (o GERENTE GENERAL).
 * Usar en invitaciones / alta de usuarios: misma regla que `useCan('Seguridad','edit')`.
 */
export async function requireServerSeguridadEdit(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await loadSessionAuthz();
  if (!session.ok) return session;
  if (!canPassServerModuleGate(session.authz, AUTHZ_MODULE.SEGURIDAD, 'edit')) {
    console.warn('[SEGURIDAD_EDIT] deny', {
      userId: session.userId,
      role: session.authz.roleLabel,
    });
    return {
      ok: false,
      error:
        'No autorizado: se requiere permiso EDITAR en el módulo Seguridad.',
    };
  }
  return { ok: true, userId: session.userId };
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
