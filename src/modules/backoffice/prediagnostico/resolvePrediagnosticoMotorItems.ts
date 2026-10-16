import { resolvePrediagnosticoExportItems } from '@/modules/reporting/infrastructure/providers/prediagnostico-export-catalog';
import type { PrediagnosticoCheckItem } from '@/modules/reporting/infrastructure/providers/prediagnostico-report-format';
import {
  filterPrediagnosticoCatalogForEquipment,
  type PrediagnosticoCatalogRow,
} from './resolvePrediagnosticoCatalog';

export type PrediagnosticoMotorCheckItem = {
  id: string;
  name: string;
  kind: 'cosmetico' | 'funcionamiento';
};

function toCheckItem(row: PrediagnosticoCatalogRow): PrediagnosticoCheckItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    sortOrder: row.sortOrder,
  };
}

/**
 * Ítems del formulario de pre-diagnóstico (motor Backoffice / PX).
 * Misma resolución que el export `PREDIAGNOSTICO_EQUIPOS` cuando hay modelId.
 */
export function resolvePrediagnosticoMotorItems(input: {
  catalogRows: PrediagnosticoCatalogRow[];
  modelItemProfiles: Map<string, string[]>;
  techId: string;
  brandId: string;
  modelId: string;
}): PrediagnosticoMotorCheckItem[] {
  const modelId = input.modelId.trim();
  if (modelId) {
    const catalog = input.catalogRows.map(toCheckItem);
    const resolved = resolvePrediagnosticoExportItems({
      catalog,
      modelItemProfiles: input.modelItemProfiles,
      modelIdFilter: modelId,
    });
    return resolved.map(({ id, name, kind }) => ({ id, name, kind }));
  }

  return filterPrediagnosticoCatalogForEquipment(
    input.catalogRows,
    input.techId,
    input.brandId,
    null
  ).map(({ id, name, kind }) => ({ id, name, kind }));
}
