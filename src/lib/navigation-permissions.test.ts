import { describe, it, expect } from 'vitest';
import { canViewNavItem, type NavAuthz } from './navigation-permissions';
import type { NavigationItem } from './modules';

function nav(over: Partial<NavigationItem> & { label: string }): NavigationItem {
  return { href: '/x', descripcion: '', ...over };
}

function authz(modules: string[], isAdmin = false): NavAuthz {
  const set = new Set(modules);
  return { isAdmin, canView: (m) => set.has(m) };
}

describe('canViewNavItem (solo UX)', () => {
  it('sin authz → oculto', () => {
    expect(canViewNavItem(nav({ label: 'Bodega' }), null)).toBe(false);
  });

  it('admin ve todo', () => {
    expect(canViewNavItem(nav({ label: 'Seguridad' }), authz([], true))).toBe(true);
  });

  it('coincidencia directa por label', () => {
    expect(canViewNavItem(nav({ label: 'Bodega' }), authz(['Bodega']))).toBe(true);
    expect(canViewNavItem(nav({ label: 'Bodega' }), authz(['Taller']))).toBe(false);
  });

  it('usa permissionKey cuando existe', () => {
    const item = nav({ label: 'Despacho Final', permissionKey: 'Despacho' });
    expect(canViewNavItem(item, authz(['Despacho']))).toBe(true);
    // Un módulo no relacionado no concede acceso.
    expect(canViewNavItem(item, authz(['Bodega']))).toBe(false);
  });

  it('resuelve alias (Recepción General ↔ Recepción)', () => {
    const item = nav({ label: 'Recepción General' });
    expect(canViewNavItem(item, authz(['Recepción']))).toBe(true);
  });

  it('fallback de Gestión: Costos visible si tiene Reportes', () => {
    const item = nav({ label: 'Costos' });
    expect(canViewNavItem(item, authz(['Reportes']))).toBe(true);
    expect(canViewNavItem(item, authz(['Bodega']))).toBe(false);
  });

  it('oculta cuando no hay permiso ni fallback', () => {
    expect(canViewNavItem(nav({ label: 'Taller' }), authz(['Bodega']))).toBe(false);
  });
});
