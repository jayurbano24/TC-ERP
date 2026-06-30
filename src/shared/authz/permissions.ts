import { getSupabaseServerClient } from '@/lib/supabase/server';
import { canDo, ACTION_COLUMN, type ModulePermission, type UserAuthz } from './canDo';

// Re-export del núcleo puro para mantener compatibilidad con importadores previos.
export { canDo, ACTION_COLUMN };
export type { ModulePermission, UserAuthz };

/**
 * Carga y evaluación de permisos del usuario desde la fuente AUTORITATIVA:
 *   auth.uid() → user_roles.role_id → hr_positions(name) → erp_role_permissions(module, can_*)
 *
 * El maestro de roles es `hr_positions` (NO `erp_roles`, que no existe en la BD
 * viva). `erp_role_permissions.role_id` referencia `hr_positions.id`.
 *
 * Nota: la lectura de metadatos de autorización del PROPIO usuario se hace con
 * service role (no es fuga de datos: solo resuelve los permisos del solicitante)
 * y es un uso "de sistema" justificado mientras RLS-first se completa.
 */

/** Puesto tratado como administrador total (decisión de negocio, ver ADR-011). */
export const ADMIN_POSITION = 'GERENTE GENERAL';

const TTL_MS = 30_000;
const cache = new Map<string, { value: UserAuthz; ts: number }>();

export async function loadUserAuthz(userId: string): Promise<UserAuthz> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < TTL_MS) return cached.value;

  const supabase = getSupabaseServerClient();

  let roleId: string | null = null;
  let roleLabel: string | null = null;
  const { data: roles } = await supabase
    .from('user_roles')
    .select('role, role_id')
    .eq('user_id', userId);

  if (roles && roles.length) {
    // Solo consideramos filas con role_id válido (las legacy con role_id null
    // son ruido pendiente de normalizar, ver Commit 1).
    const withId = roles.find((r) => (r as { role_id?: string }).role_id) ?? null;
    roleId = withId ? ((withId as { role_id?: string }).role_id ?? null) : null;
    roleLabel = withId ? ((withId as { role?: string }).role ?? null) : null;
  }

  // Resolvemos el nombre canónico del puesto desde hr_positions (maestro de roles).
  let positionName: string | null = null;
  if (roleId) {
    const { data: pos } = await supabase
      .from('hr_positions')
      .select('name')
      .eq('id', roleId)
      .maybeSingle();
    positionName = (pos as { name?: string } | null)?.name ?? null;
  }

  let perms: ModulePermission[] = [];
  if (roleId) {
    const { data } = await supabase
      .from('erp_role_permissions')
      .select('module_name, can_view, can_create, can_edit, can_delete, can_approve, can_export')
      .eq('role_id', roleId);
    perms = (data ?? []) as ModulePermission[];
  }

  // Admin por puesto: GERENTE GENERAL es administrador total (ADR-011).
  const isAdmin = positionName === ADMIN_POSITION;

  const value: UserAuthz = { userId, roleId, roleLabel: positionName ?? roleLabel, isAdmin, perms };
  cache.set(userId, { value, ts: Date.now() });
  return value;
}

/** Invalida la caché de un usuario (p. ej. tras cambiar su rol). */
export function invalidateUserAuthz(userId: string): void {
  cache.delete(userId);
}
