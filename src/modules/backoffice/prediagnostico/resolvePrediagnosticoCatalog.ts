import { itemAppliesToEquipment } from './validatePrediagnostico';

export type PrediagnosticoCatalogRow = {
  id: string;
  name: string;
  kind: 'cosmetico' | 'funcionamiento';
  technologyIds: string[];
  brandIds: string[];
  sortOrder: number;
};

/**
 * Si hay filas en cat_prediagnostico_model_items para el modelo, solo se muestran esos ítems
 * (intersección con tech/marca). Sin perfil → reglas legacy por tecnología/marca.
 */
export function filterPrediagnosticoCatalogForEquipment(
  catalog: PrediagnosticoCatalogRow[],
  techId: string,
  brandId: string,
  modelProfileItemIds: string[] | null
): PrediagnosticoCatalogRow[] {
  const byTechBrand = catalog.filter((row) => itemAppliesToEquipment(row, techId, brandId));
  if (modelProfileItemIds === null) {
    return byTechBrand;
  }
  const allowed = new Set(modelProfileItemIds);
  return byTechBrand.filter((row) => allowed.has(row.id));
}
