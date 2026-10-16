import { describe, expect, it } from 'vitest';
import { resolvePrediagnosticoMotorItems } from './resolvePrediagnosticoMotorItems';
import type { PrediagnosticoCatalogRow } from './resolvePrediagnosticoCatalog';

const catalog: PrediagnosticoCatalogRow[] = [
  {
    id: 'a',
    name: 'Cos A',
    kind: 'cosmetico',
    technologyIds: ['t1'],
    brandIds: [],
    sortOrder: 1,
  },
  {
    id: 'b',
    name: 'Func B',
    kind: 'funcionamiento',
    technologyIds: ['t1'],
    brandIds: [],
    sortOrder: 2,
  },
  {
    id: 'c',
    name: 'Otra tech',
    kind: 'funcionamiento',
    technologyIds: ['t2'],
    brandIds: [],
    sortOrder: 3,
  },
];

describe('resolvePrediagnosticoMotorItems', () => {
  it('con perfil de modelo usa los mismos ids que el export', () => {
    const profiles = new Map([['m1', ['b']]]);
    const items = resolvePrediagnosticoMotorItems({
      catalogRows: catalog,
      modelItemProfiles: profiles,
      techId: 't1',
      brandId: 'b1',
      modelId: 'm1',
    });
    expect(items.map((i) => i.id)).toEqual(['b']);
  });

  it('sin modelId filtra por tecnología/marca (legacy)', () => {
    const items = resolvePrediagnosticoMotorItems({
      catalogRows: catalog,
      modelItemProfiles: new Map(),
      techId: 't1',
      brandId: 'b1',
      modelId: '',
    });
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
