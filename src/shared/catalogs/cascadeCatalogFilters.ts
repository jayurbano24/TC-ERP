/**
 * Cascada Tecnología → Marca → Modelo para selects de ingreso / despacho.
 * Una marca solo aparece si tiene al menos un modelo de la tecnología elegida.
 */

export type CascadeBrandRow = { id: string; name?: string; nombre?: string };
export type CascadeTechRow = { id: string; name?: string; nombre?: string };
export type CascadeModelRow = {
  id: string;
  brand_id?: string;
  technology_id?: string;
  marcaId?: string;
  tecnologiaId?: string;
  name?: string;
  nombre?: string;
};

function modelBrandId(m: CascadeModelRow): string {
  return String(m.brand_id || m.marcaId || '');
}

function modelTechId(m: CascadeModelRow): string {
  return String(m.technology_id || m.tecnologiaId || '');
}

export function resolveCatalogTechId(
  technologies: CascadeTechRow[],
  techValue: string | null | undefined
): string {
  if (!techValue) return '';
  const hit = technologies.find(
    (t) => t.id === techValue || t.name === techValue || t.nombre === techValue
  );
  return hit?.id || '';
}

export function resolveCatalogBrandId(
  brands: CascadeBrandRow[],
  brandValue: string | null | undefined
): string {
  if (!brandValue) return '';
  const hit = brands.find(
    (b) => b.id === brandValue || b.name === brandValue || b.nombre === brandValue
  );
  return hit?.id || '';
}

/** Marcas con al menos un modelo de la tecnología (por id de tech). */
export function filterBrandsByTechnologyId(
  brands: CascadeBrandRow[],
  models: CascadeModelRow[],
  technologyId: string | null | undefined
): CascadeBrandRow[] {
  if (!technologyId) return [];
  const brandIds = new Set(
    models.filter((m) => modelTechId(m) === technologyId).map(modelBrandId).filter(Boolean)
  );
  return brands.filter((b) => brandIds.has(b.id));
}

/** Modelos de tech (+ marca opcional). */
export function filterModelsByTechAndBrand(
  models: CascadeModelRow[],
  technologyId: string | null | undefined,
  brandId: string | null | undefined
): CascadeModelRow[] {
  return models.filter((m) => {
    if (technologyId && modelTechId(m) !== technologyId) return false;
    if (brandId && modelBrandId(m) !== brandId) return false;
    return true;
  });
}
