import type { NavigationItem } from '@/lib/modules';

type NavPermission = {
  module_name: string;
  can_view?: boolean;
  is_admin?: boolean;
};

const ADMIN_ROLE_NAMES = new Set([
  'ADMINISTRADOR',
  'Administrador',
  'GERENTE GENERAL',
  'GERENTE',
  'SUPER ADMIN',
]);

/** Módulos de Gestión visibles si el rol ya tiene acceso a BI/reportes. */
const GESTION_FALLBACK_MODULES = new Set(['Reportes', 'Productividad', 'Costos']);

const MODULE_ALIASES: Record<string, string[]> = {
  'Recepción General': ['Recepción General', 'Recepción'],
  Reportes: ['Reportes'],
  'Recursos Humanos': ['Recursos Humanos', 'RRHH'],
  Productividad: ['Productividad', 'Dashboard & BI'],
  Costos: ['Costos', 'Costos & Rentabilidad'],
  Seguridad: ['Seguridad', 'Seguridad & Logs'],
  Backoffice: ['Backoffice', 'Backoffice (Series)'],
  Taller: ['Taller', 'Taller Técnico'],
  Bodega: ['Bodega', 'Gestión de Bodega'],
  Accesorios: ['Accesorios', 'Bodega Accesorios'],
  Despacho: ['Despacho', 'Despacho Final'],
  'Integración SAP': ['Integración SAP'],
};

function hasViewOnModule(permissions: NavPermission[], names: string[]): boolean {
  return permissions.some((p) => names.includes(p.module_name) && p.can_view === true);
}

export function canViewNavItem(
  item: NavigationItem,
  permissions: NavPermission[] | null
): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (permissions[0]?.is_admin) return true;

  const key = item.permissionKey ?? item.label;
  const aliases = MODULE_ALIASES[key] ?? [key];

  if (hasViewOnModule(permissions, aliases)) return true;

  if (GESTION_FALLBACK_MODULES.has(key)) {
    return hasViewOnModule(permissions, [
      'Productividad',
      'Costos',
      'Seguridad',
      'Reportes',
      'Dashboard',
    ]);
  }

  return false;
}

export function isAdminNavRole(roleName?: string | null): boolean {
  if (!roleName) return false;
  return ADMIN_ROLE_NAMES.has(roleName.trim());
}
