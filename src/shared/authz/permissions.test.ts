import { describe, it, expect } from 'vitest';
import { canDo, type UserAuthz, type ModulePermission } from './permissions';

function perm(module: string, over: Partial<ModulePermission> = {}): ModulePermission {
  return {
    module_name: module,
    can_view: false,
    can_create: false,
    can_edit: false,
    can_delete: false,
    can_approve: false,
    can_export: false,
    ...over,
  };
}

function authz(over: Partial<UserAuthz> = {}): UserAuthz {
  return { userId: 'u1', roleId: 'r1', roleLabel: 'X', isAdmin: false, perms: [], ...over };
}

describe('canDo', () => {
  it('admin puede todo', () => {
    const a = authz({ isAdmin: true, perms: [] });
    expect(canDo(a, 'Despacho', 'edit')).toBe(true);
    expect(canDo(a, 'Seguridad', 'delete')).toBe(true);
  });

  it('respeta el flag por módulo/acción', () => {
    const a = authz({ perms: [perm('Despacho', { can_view: true })] });
    expect(canDo(a, 'Despacho', 'view')).toBe(true);
    expect(canDo(a, 'Despacho', 'edit')).toBe(false);
  });

  it('niega si el módulo no está en los permisos', () => {
    const a = authz({ perms: [perm('Despacho', { can_view: true })] });
    expect(canDo(a, 'Bodega', 'view')).toBe(false);
  });

  it('niega a usuario sin rol/permisos', () => {
    const a = authz({ roleId: null, perms: [] });
    expect(canDo(a, 'Dashboard', 'view')).toBe(false);
  });

  it('mapea cada acción a su columna can_*', () => {
    const a = authz({
      perms: [perm('Reportes', { can_export: true, can_view: true })],
    });
    expect(canDo(a, 'Reportes', 'export')).toBe(true);
    expect(canDo(a, 'Reportes', 'approve')).toBe(false);
  });
});
