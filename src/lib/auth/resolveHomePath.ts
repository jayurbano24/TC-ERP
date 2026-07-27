import { navigationGroups, type NavigationItem } from '@/lib/modules';
import { canViewNavItem, type NavAuthz } from '@/lib/navigation-permissions';
import type { UserAuthz } from '@/shared/authz/canDo';
import { canView } from '@/shared/authz/canDo';

/**
 * Ruta de aterrizaje post-login según permisos (UX).
 * Técnicos / operativos no deben caer en Dashboard Gerencial si no tienen can_view.
 */
export function resolveHomePath(authz: UserAuthz | null | undefined): string {
  if (!authz?.userId) return '/dashboard';

  const navAuthz: NavAuthz = {
    isAdmin: authz.isAdmin,
    canView: (module) => canView(authz, module),
  };

  // Preferir Taller si el rol puede verlo (técnicos / QC).
  if (canViewNavItem(
    { label: 'Taller', href: '/produccion/taller', descripcion: '' },
    navAuthz
  )) {
    return '/produccion/taller';
  }

  const preferredOrder = [
    '/produccion/taller',
    '/produccion/backoffice',
    '/bodega/gestion',
    '/recepcion',
    '/consulta',
    '/despacho',
    '/rrhh',
    '/dashboard',
  ];

  const allowed: NavigationItem[] = [];
  for (const group of navigationGroups) {
    for (const item of group.items) {
      if (canViewNavItem(item, navAuthz)) allowed.push(item);
    }
  }

  for (const href of preferredOrder) {
    const hit = allowed.find((i) => i.href === href);
    if (hit) return hit.href;
  }

  if (allowed.length > 0) return allowed[0].href;

  // Sin módulos visibles: perfil mínimo (consulta) o dashboard con guard.
  return '/consulta';
}

/** ¿Puede ver el Dashboard Gerencial & BI? */
export function canViewGerencialDashboard(authz: UserAuthz | null | undefined): boolean {
  if (!authz?.userId) return false;
  if (authz.isAdmin) return true;
  // Solo módulos explícitos de dashboard gerencial (no Productividad operativa).
  return canView(authz, 'Dashboard') || canView(authz, 'Dashboard & BI');
}
