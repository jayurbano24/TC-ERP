import type { NavigationItem } from '@/lib/modules';

/**
 * Decisión de visibilidad de items del menú — SOLO UX.
 *
 * No usa comparaciones de rol: delega en el API de autorización (`authz.canView`
 * / `authz.isAdmin`), que a su vez consulta `erp_role_permissions` (app_can).
 * La autoridad real sigue siendo el backend.
 */
export interface NavAuthz {
  isAdmin: boolean;
  canView: (module: string) => boolean;
}

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

export function canViewNavItem(item: NavigationItem, authz: NavAuthz | null): boolean {
  if (!authz) return false;
  if (authz.isAdmin) return true;

  const key = item.permissionKey ?? item.label;
  const aliases = MODULE_ALIASES[key] ?? [key];

  if (aliases.some((name) => authz.canView(name))) return true;

  if (GESTION_FALLBACK_MODULES.has(key)) {
    return ['Productividad', 'Costos', 'Seguridad', 'Reportes', 'Dashboard'].some((m) =>
      authz.canView(m)
    );
  }

  return false;
}
