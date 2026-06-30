import { describe, it, expect } from 'vitest';
import { canDo, canView, type UserAuthz, type ModulePermission } from './canDo';

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

describe('canDo (núcleo puro)', () => {
  it('null/undefined → false (fail-closed)', () => {
    expect(canDo(null, 'Despacho', 'view')).toBe(false);
    expect(canDo(undefined, 'Despacho', 'edit')).toBe(false);
  });

  it('admin puede todo', () => {
    const a = authz({ isAdmin: true });
    expect(canDo(a, 'Cualquiera', 'delete')).toBe(true);
  });

  it('canView es atajo de view', () => {
    const a = authz({ perms: [perm('Bodega', { can_view: true })] });
    expect(canView(a, 'Bodega')).toBe(true);
    expect(canView(a, 'Taller')).toBe(false);
  });

  it('admin via canView', () => {
    expect(canView(authz({ isAdmin: true }), 'Loquesea')).toBe(true);
  });
});
