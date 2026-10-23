import { describe, expect, it } from 'vitest';
import {
  buildPartCompatibilityWrite,
  normalizePartCompatibility,
} from './partsCompatibility';

const MODELS = [
  { id: 'model-zte-1', brand_id: 'brand-zte' },
  { id: 'model-zte-2', brand_id: 'brand-zte' },
  { id: 'model-huawei-1', brand_id: 'brand-huawei' },
  { id: 'model-kaon-1', brand_id: 'brand-kaon' },
];

describe('compatibilidad múltiple de piezas', () => {
  it('acepta modelos de todas las marcas seleccionadas y elimina duplicados', () => {
    expect(
      buildPartCompatibilityWrite(
        ['brand-zte', 'brand-huawei'],
        ['model-zte-1', 'model-huawei-1', 'model-zte-1', 'model-kaon-1'],
        MODELS,
      ),
    ).toEqual({
      brandIds: ['brand-zte', 'brand-huawei'],
      modelIds: ['model-zte-1', 'model-huawei-1'],
      primaryBrandId: 'brand-zte',
      primaryModelId: 'model-zte-1',
    });
  });

  it('elimina modelos que dejan de pertenecer a las marcas seleccionadas', () => {
    expect(
      buildPartCompatibilityWrite(
        ['brand-huawei'],
        ['model-zte-1', 'model-huawei-1'],
        MODELS,
      ).modelIds,
    ).toEqual(['model-huawei-1']);
  });

  it('recupera marcas y modelos desde la relación N:N con fallback legacy', () => {
    expect(
      normalizePartCompatibility({
        brand_id: 'brand-zte',
        model_id: 'model-zte-1',
        compatible_models: [
          { model_id: 'model-zte-1', models: { brand_id: 'brand-zte' } },
          { model_id: 'model-huawei-1', models: { brand_id: 'brand-huawei' } },
        ],
      }),
    ).toEqual({
      brand_ids: ['brand-zte', 'brand-huawei'],
      model_ids: ['model-zte-1', 'model-huawei-1'],
    });

    expect(
      normalizePartCompatibility({
        brand_id: 'brand-zte',
        model_id: 'model-zte-1',
        compatible_models: [],
      }),
    ).toEqual({ brand_ids: ['brand-zte'], model_ids: ['model-zte-1'] });
  });
});
