import { describe, expect, it } from 'vitest';
import { navigationGroups } from './modules';
import { PERMISSION_MATRIX_MODULES } from './permission-matrix';

describe('matriz de permisos', () => {
  it('permite administrar por separado los módulos operativos nuevos del menú', () => {
    const matrix = new Set<string>(PERMISSION_MATRIX_MODULES);
    const newModules = ['Bodega SCRAPS', 'Bodega de Partes', 'TEC-LAB DUT'];

    expect(newModules.every((moduleName) => matrix.has(moduleName))).toBe(true);

    const navigation = navigationGroups.flatMap((group) => group.items);
    for (const moduleName of newModules) {
      const item = navigation.find((candidate) => candidate.label === moduleName);
      expect(item?.permissionKey ?? item?.label).toBe(moduleName);
    }
  });

  it('muestra también los módulos administrativos nuevos', () => {
    expect(PERMISSION_MATRIX_MODULES).toEqual(
      expect.arrayContaining(['Autorizaciones', 'Salud'])
    );
  });

  it('muestra permisos separados para cada pestaña de Taller', () => {
    expect(PERMISSION_MATRIX_MODULES).toEqual(
      expect.arrayContaining([
        'Taller · Diagnóstico',
        'Taller · Reparación',
        'Taller · Esperando Partes',
        'Taller · Reacondicionado',
        'Taller · Control de Calidad',
        'Taller · L3 (Avanzado)',
        'Taller · SCRAPS',
        'Taller · Retornar a Bodega',
      ])
    );
  });
});
