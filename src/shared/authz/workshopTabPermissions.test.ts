import { describe, expect, it } from 'vitest';
import type { UserAuthz } from './canDo';
import {
  canAccessWorkshopTab,
  workshopTabForActionName,
  workshopPermissionModule,
  type WorkshopPermissionTab,
} from './workshopTabPermissions';

function authz(rows: Array<{ module: string; view?: boolean; edit?: boolean }>): UserAuthz {
  return {
    userId: 'user-1',
    roleId: 'role-1',
    roleLabel: 'TECNICO',
    isAdmin: false,
    perms: rows.map((row) => ({
      module_name: row.module,
      can_view: row.view ?? false,
      can_create: false,
      can_edit: row.edit ?? false,
      can_delete: false,
      can_approve: false,
      can_export: false,
    })),
  };
}

describe('permisos por pestaña de Taller', () => {
  it('mantiene acceso general mientras el rol no tenga permisos por pestaña', () => {
    const user = authz([{ module: 'Taller', view: true, edit: true }]);

    expect(canAccessWorkshopTab(user, 'diagnostico', 'view')).toBe(true);
    expect(canAccessWorkshopTab(user, 'qc', 'edit')).toBe(true);
  });

  it('al configurar una pestaña limita las demás', () => {
    const user = authz([
      { module: 'Taller', view: true, edit: true },
      { module: workshopPermissionModule('reparacion'), view: true, edit: true },
    ]);

    expect(canAccessWorkshopTab(user, 'reparacion', 'view')).toBe(true);
    expect(canAccessWorkshopTab(user, 'reparacion', 'edit')).toBe(true);
    expect(canAccessWorkshopTab(user, 'diagnostico', 'view')).toBe(false);
  });

  it('separa ver de operar dentro de una pestaña', () => {
    const user = authz([
      { module: workshopPermissionModule('qc'), view: true, edit: false },
    ]);

    expect(canAccessWorkshopTab(user, 'qc', 'view')).toBe(true);
    expect(canAccessWorkshopTab(user, 'qc', 'edit')).toBe(false);
  });

  it('define una clave estable para todas las pestañas visibles', () => {
    const tabs: WorkshopPermissionTab[] = [
      'diagnostico',
      'reparacion',
      'esperando_partes',
      'reacondicionado',
      'qc',
      'l3',
      'scraps',
      'despacho',
    ];

    expect(tabs.map(workshopPermissionModule)).toEqual([
      'Taller · Diagnóstico',
      'Taller · Reparación',
      'Taller · Esperando Partes',
      'Taller · Reacondicionado',
      'Taller · Control de Calidad',
      'Taller · L3 (Avanzado)',
      'Taller · SCRAPS',
      'Taller · Retornar a Bodega',
    ]);
  });

  it('resuelve la pestaña que autoriza cada operación de Taller', () => {
    expect(workshopTabForActionName('DIAGNÓSTICO INICIAL COMPLETADO')).toBe('diagnostico');
    expect(workshopTabForActionName('REPARACIÓN COMPLETADA')).toBe('reparacion');
    expect(workshopTabForActionName('REACONDICIONADO COMPLETADO')).toBe('reacondicionado');
    expect(workshopTabForActionName('CONTROL DE CALIDAD COMPLETADO')).toBe('qc');
    expect(workshopTabForActionName('REPARACIÓN L3 COMPLETADA')).toBe('l3');
    expect(workshopTabForActionName('OPERACIÓN DESCONOCIDA')).toBeNull();
  });
});
