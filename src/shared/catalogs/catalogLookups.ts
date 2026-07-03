export type CatalogRow = { id: string; name?: string; brand_id?: string; technology_id?: string };

export type CatalogLookups = {
  technologies: CatalogRow[];
  brands: CatalogRow[];
  models: CatalogRow[];
  techNameById: Map<string, string>;
  brandNameById: Map<string, string>;
  modelNameById: Map<string, string>;
  techIdByModelId: Map<string, string>;
};

export function buildCatalogLookups(
  technologies: CatalogRow[],
  brands: CatalogRow[],
  models: CatalogRow[]
): CatalogLookups {
  const techNameById = new Map<string, string>();
  for (const t of technologies) {
    if (t.id) techNameById.set(t.id, t.name ?? '---');
  }

  const brandNameById = new Map<string, string>();
  for (const b of brands) {
    if (b.id) brandNameById.set(b.id, b.name ?? '---');
  }

  const modelNameById = new Map<string, string>();
  const techIdByModelId = new Map<string, string>();
  for (const m of models) {
    if (m.id) {
      modelNameById.set(m.id, m.name ?? '---');
      if (m.technology_id) techIdByModelId.set(m.id, m.technology_id);
    }
  }

  return {
    technologies,
    brands,
    models,
    techNameById,
    brandNameById,
    modelNameById,
    techIdByModelId,
  };
}

export function resolveTechName(lookups: CatalogLookups, techId?: string | null, fallback = '---'): string {
  if (!techId) return fallback;
  return lookups.techNameById.get(techId) ?? techId ?? fallback;
}

export function resolveBrandName(lookups: CatalogLookups, brandId?: string | null, fallback = 'N/A'): string {
  if (!brandId) return fallback;
  return lookups.brandNameById.get(brandId) ?? brandId ?? fallback;
}

export function resolveModelName(lookups: CatalogLookups, modelId?: string | null, fallback = 'N/A'): string {
  if (!modelId) return fallback;
  return lookups.modelNameById.get(modelId) ?? modelId ?? fallback;
}

export function resolveTechNameForModel(
  lookups: CatalogLookups,
  modelId?: string | null,
  fallback = '---'
): string {
  if (!modelId) return fallback;
  const techId = lookups.techIdByModelId.get(modelId);
  return techId ? resolveTechName(lookups, techId, fallback) : fallback;
}
