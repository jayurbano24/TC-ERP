import { describe, expect, it } from 'vitest';
import { filterPrediagnosticoCatalogForEquipment } from './resolvePrediagnosticoCatalog';

const catalog = [
  {
    id: 'cos-1',
    name: 'Puertos',
    kind: 'cosmetico' as const,
    technologyIds: [] as string[],
    brandIds: [] as string[],
    sortOrder: 10,
  },
  {
    id: 'fn-1',
    name: 'Enciende',
    kind: 'funcionamiento' as const,
    technologyIds: ['iptv'],
    brandIds: [] as string[],
    sortOrder: 10,
  },
  {
    id: 'fn-2',
    name: 'WiFi',
    kind: 'funcionamiento' as const,
    technologyIds: ['ont'],
    brandIds: [] as string[],
    sortOrder: 20,
  },
];

describe('filterPrediagnosticoCatalogForEquipment', () => {
  it('sin perfil de modelo usa tecnología y marca', () => {
    const items = filterPrediagnosticoCatalogForEquipment(catalog, 'iptv', 'zte', null);
    expect(items.map((row) => row.id)).toEqual(['cos-1', 'fn-1']);
  });

  it('con perfil de modelo restringe a allowlist dentro de tech/marca', () => {
    const items = filterPrediagnosticoCatalogForEquipment(catalog, 'iptv', 'zte', ['cos-1', 'fn-2']);
    expect(items.map((row) => row.id)).toEqual(['cos-1']);
  });
});
