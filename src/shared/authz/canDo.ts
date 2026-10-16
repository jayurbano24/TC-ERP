import type { PermAction } from './modules';

/**
 * Núcleo PURO de evaluación de permisos (sin dependencias de servidor).
 *
 * Se comparte entre:
 *   - el backend (`permissions.ts`, que añade la carga desde la BD), y
 *   - el frontend (`AuthzProvider`/`useAuthz`, solo para decisiones de UX).
 *
 * IMPORTANTE: este módulo NO es un mecanismo de seguridad. La autoridad real de
 * autorización es el backend (roleGuard/endpoints/RLS). Aquí solo se decide qué
 * mostrar/ocultar/deshabilitar para mejorar la experiencia de usuario.
 */

export interface ModulePermission {
  module_name: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
}

export interface UserAuthz {
  userId: string;
  roleId: string | null;
  roleLabel: string | null;
  isAdmin: boolean;
  perms: ModulePermission[];
  /** Email de la sesión (UX: p. ej. gate Tema/Colores). No usar como seguridad. */
  email?: string | null;
  /** Enum operacional (`user_roles.role`) — GET /api/authz/me */
  operationalRoles?: string[];
  /** Coherente con RPC bodega/despacho tras sync + assert SQL. */
  canBodegaDespachoRpc?: boolean;
}

export const ACTION_COLUMN: Record<PermAction, keyof ModulePermission> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  approve: 'can_approve',
  export: 'can_export',
};

/** ¿El usuario (según su snapshot de permisos) puede `action` sobre `module`? */
export function canDo(authz: UserAuthz | null | undefined, module: string, action: PermAction): boolean {
  if (!authz) return false;
  if (authz.isAdmin) return true;
  const row = authz.perms.find((p) => p.module_name === module);
  if (!row) return false;
  return Boolean(row[ACTION_COLUMN[action]]);
}

/** Atajo de lectura (equivale a canDo(authz, module, 'view')). */
export function canView(authz: UserAuthz | null | undefined, module: string): boolean {
  return canDo(authz, module, 'view');
}

const BODEGA_DESPACHO_ERP_MODULES = ['Bodega', 'Despacho'] as const;
const BODEGA_DESPACHO_WRITE_ACTIONS: PermAction[] = ['create', 'edit', 'delete', 'approve'];

/**
 * Misma regla que `app_has_bodega_despacho_erp_write()` (migr. 269):
 * escritura ERP en Bodega o Despacho habilita RPC de pistoleo aunque falte enum `bodega`.
 */
export function hasErpBodegaDespachoWrite(authz: UserAuthz | null | undefined): boolean {
  if (!authz) return false;
  if (authz.isAdmin) return true;
  for (const module of BODEGA_DESPACHO_ERP_MODULES) {
    for (const action of BODEGA_DESPACHO_WRITE_ACTIONS) {
      if (canDo(authz, module, action)) return true;
    }
  }
  return false;
}
