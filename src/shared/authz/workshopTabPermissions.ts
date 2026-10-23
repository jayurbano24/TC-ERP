import { canDo, type UserAuthz } from './canDo';
import type { PermAction } from './modules';

export type WorkshopPermissionTab =
  | 'diagnostico'
  | 'reparacion'
  | 'esperando_partes'
  | 'reacondicionado'
  | 'qc'
  | 'l3'
  | 'scraps'
  | 'despacho';

const WORKSHOP_TAB_MODULES: Record<WorkshopPermissionTab, string> = {
  diagnostico: 'Taller · Diagnóstico',
  reparacion: 'Taller · Reparación',
  esperando_partes: 'Taller · Esperando Partes',
  reacondicionado: 'Taller · Reacondicionado',
  qc: 'Taller · Control de Calidad',
  l3: 'Taller · L3 (Avanzado)',
  scraps: 'Taller · SCRAPS',
  despacho: 'Taller · Retornar a Bodega',
};

export const WORKSHOP_PERMISSION_TABS = Object.keys(
  WORKSHOP_TAB_MODULES,
) as WorkshopPermissionTab[];

export const WORKSHOP_PERMISSION_MODULES = Object.values(WORKSHOP_TAB_MODULES);

export function workshopPermissionModule(tab: WorkshopPermissionTab): string {
  return WORKSHOP_TAB_MODULES[tab];
}

export function resolveWorkshopTab<T extends { id: string }>(
  tabs: readonly T[],
  activeTabId: string,
): T | undefined {
  return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
}

const WORKSHOP_ACTION_TABS: Record<string, WorkshopPermissionTab> = {
  'DIAGNÓSTICO INICIAL COMPLETADO': 'diagnostico',
  'REPARACIÓN COMPLETADA': 'reparacion',
  'REACONDICIONADO COMPLETADO': 'reacondicionado',
  'CONTROL DE CALIDAD COMPLETADO': 'qc',
  'REPARACIÓN L3 COMPLETADA': 'l3',
};

export function workshopTabForActionName(actionName: string): WorkshopPermissionTab | null {
  return WORKSHOP_ACTION_TABS[actionName.trim().toUpperCase()] ?? null;
}

export function canAccessWorkshopTab(
  authz: UserAuthz | null | undefined,
  tab: WorkshopPermissionTab,
  action: Extract<PermAction, 'view' | 'edit'>,
): boolean {
  if (!authz) return false;
  if (authz.isAdmin) return true;

  const hasScopedPermissions = authz.perms.some((permission) =>
    WORKSHOP_PERMISSION_MODULES.includes(permission.module_name),
  );

  return hasScopedPermissions
    ? canDo(authz, workshopPermissionModule(tab), action)
    : canDo(authz, 'Taller', action);
}
