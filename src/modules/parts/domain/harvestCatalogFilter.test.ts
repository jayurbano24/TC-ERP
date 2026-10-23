import { describe, expect, it } from 'vitest';
import { filterHarvestCatalog, filterHarvestCatalogByDonors } from './harvestCatalogFilter';

const catalog = [
  { id: 'zte-only', model_ids: ['model-zte'] },
  { id: 'huawei-only', model_ids: ['model-huawei'] },
  { id: 'shared', model_ids: ['model-zte', 'model-huawei'] },
  { id: 'unassigned', model_ids: [] },
];

describe('filterHarvestCatalog', () => {
  it('muestra solo piezas compatibles con el modelo de la serie seleccionada', () => {
    expect(filterHarvestCatalog(catalog, ['model-zte']).map((item) => item.id)).toEqual([
      'zte-only',
      'shared',
    ]);
  });

  it('en seleccion masiva exige compatibilidad con todos los modelos donantes', () => {
    expect(
      filterHarvestCatalog(catalog, ['model-zte', 'model-huawei']).map((item) => item.id)
    ).toEqual(['shared']);
  });

  it('no expone el catalogo completo cuando la serie no tiene modelo', () => {
    expect(filterHarvestCatalog(catalog, [])).toEqual([]);
  });

  it('usa el nombre del modelo cuando un donante en cache aun no incluye model_id', () => {
    const catalogWithNames = [
      { id: 'zte', model_ids: ['model-zte'], model_name: 'ZXV10 B866V', compatible_models: [] },
      { id: 'huawei', model_ids: ['model-huawei'], model_name: 'HG8245W5-6T', compatible_models: [] },
    ];

    expect(
      filterHarvestCatalogByDonors(catalogWithNames, [
        { model_id: null, model_name: 'ZXV10 B866V' },
      ]).map((item) => item.id)
    ).toEqual(['zte']);
  });
});
