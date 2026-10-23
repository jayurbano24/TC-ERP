type ModelCompatibilityRef = {
  id: string;
  brand_id?: string | null;
};

type CatalogCompatibilityRow = {
  brand_id?: string | null;
  model_id?: string | null;
  compatible_models?: Array<{
    model_id?: string | null;
    models?: { brand_id?: string | null } | Array<{ brand_id?: string | null }> | null;
  }> | null;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function buildPartCompatibilityWrite(
  selectedBrandIds: string[],
  selectedModelIds: string[],
  models: ModelCompatibilityRef[],
) {
  const brandIds = unique(selectedBrandIds);
  const selectedBrands = new Set(brandIds);
  const modelById = new Map(models.map((model) => [model.id, model]));
  const modelIds = unique(selectedModelIds).filter((id) => {
    const brandId = modelById.get(id)?.brand_id;
    return Boolean(brandId && selectedBrands.has(brandId));
  });
  const primaryModelId = modelIds[0] ?? null;
  const primaryBrandId =
    (primaryModelId ? modelById.get(primaryModelId)?.brand_id : null) ?? brandIds[0] ?? null;

  return { brandIds, modelIds, primaryBrandId, primaryModelId };
}

export function normalizePartCompatibility(row: CatalogCompatibilityRow) {
  const relations = row.compatible_models ?? [];
  const modelIds = unique(relations.map((relation) => relation.model_id));
  const brandIds = unique(
    relations.map((relation) => {
      const model = Array.isArray(relation.models) ? relation.models[0] : relation.models;
      return model?.brand_id;
    }),
  );

  return {
    brand_ids: brandIds.length > 0 ? brandIds : unique([row.brand_id]),
    model_ids: modelIds.length > 0 ? modelIds : unique([row.model_id]),
  };
}
