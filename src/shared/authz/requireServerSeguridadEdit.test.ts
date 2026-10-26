import { describe, expect, it } from 'vitest';
import { canPassServerModuleGate } from './requireServerAdmin';
import type { UserAuthz } from './canDo';
import { AUTHZ_MODULE } from './modules';

function authz(over: Partial<UserAuthz> = {}): UserAuthz {
  return {
    userId: 'u1',
    roleId: 'r1',
    roleLabel: 'X',
    isAdmin: false,
    perms: [],
    ...over,
  };
}

describe('requireServerSeguridadEdit gate', () => {
  it('permite GERENTE GENERAL (isAdmin)', () => {
    expect(
      canPassServerModuleGate(authz({ isAdmin: true }), AUTHZ_MODULE.SEGURIDAD, 'edit')
    ).toBe(true);
  });

  it('permite rol con Seguridad.edit aunque no sea admin', () => {
    expect(
      canPassServerModuleGate(
        authz({
          perms: [
            {
              module_name: 'Seguridad',
              can_view: true,
              can_create: false,
              can_edit: true,
              can_delete: false,
              can_approve: false,
              can_export: false,
            },
          ],
        }),
        AUTHZ_MODULE.SEGURIDAD,
        'edit'
      )
    ).toBe(true);
  });

  it('deniega sin permiso edit en Seguridad', () => {
    expect(
      canPassServerModuleGate(
        authz({
          perms: [
            {
              module_name: 'Seguridad',
              can_view: true,
              can_create: false,
              can_edit: false,
              can_delete: false,
              can_approve: false,
              can_export: false,
            },
          ],
        }),
        AUTHZ_MODULE.SEGURIDAD,
        'edit'
      )
    ).toBe(false);
  });
});
