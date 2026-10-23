type HarvestCatalogItem = {
  model_ids?: string[] | null;
};

type HarvestCatalogItemWithNames = HarvestCatalogItem & {
  model_name?: string | null;
  compatible_models?: Array<{ name?: string | null }> | null;
};

type HarvestDonorModel = {
  model_id?: string | null;
  model_name?: string | null;
};

function normalizeModelName(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

export function filterHarvestCatalog<T extends HarvestCatalogItem>(
  catalog: T[],
  donorModelIds: Array<string | null | undefined>
): T[] {
  const requiredModels = [...new Set(donorModelIds.filter((id): id is string => Boolean(id)))];
  if (requiredModels.length === 0) return [];

  return catalog.filter((item) => {
    const compatibleModels = new Set(item.model_ids ?? []);
    return requiredModels.every((modelId) => compatibleModels.has(modelId));
  });
}

export function filterHarvestCatalogByDonors<T extends HarvestCatalogItemWithNames>(
  catalog: T[],
  donors: HarvestDonorModel[]
): T[] {
  if (donors.length === 0) return [];

  return catalog.filter((item) => {
    const compatibleModelIds = new Set(item.model_ids ?? []);
    const compatibleModelNames = new Set([
      normalizeModelName(item.model_name),
      ...(item.compatible_models ?? []).map((model) => normalizeModelName(model.name)),
    ].filter(Boolean));

    return donors.every((donor) => {
      if (donor.model_id) return compatibleModelIds.has(donor.model_id);
      const donorModelName = normalizeModelName(donor.model_name);
      return Boolean(donorModelName) && compatibleModelNames.has(donorModelName);
    });
  });
}
