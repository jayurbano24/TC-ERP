import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { PrediagnosticoCheckItem } from './prediagnostico-report-format';
import {
  buildPrediagnosticoExportColumns,
  resolvePrediagnosticoExportItems,
} from './prediagnostico-export-catalog';

async function loadActiveCheckItems(): Promise<PrediagnosticoCheckItem[]> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('cat_prediagnostico_items')
    .select('id, name, item_kind, sort_order')
    .eq('active', true)
    .order('sort_order');
  if (error) {
    if (error.message.includes('cat_prediagnostico_items') || error.message.includes('does not exist')) {
      return [];
    }
    throw new Error(error.message);
  }
  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
    kind: row.item_kind === 'cosmetico' ? 'cosmetico' : 'funcionamiento',
    sortOrder: Number(row.sort_order) || 0,
  }));
}

async function loadModelItemProfiles(): Promise<Map<string, string[]>> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('cat_prediagnostico_model_items').select('model_id, item_id');
  if (error) {
    if (error.message.includes('cat_prediagnostico_model_items') || error.message.includes('does not exist')) {
      return new Map();
    }
    throw new Error(error.message);
  }
  const map = new Map<string, string[]>();
  for (const row of data || []) {
    const modelId = String(row.model_id);
    const list = map.get(modelId) || [];
    list.push(String(row.item_id));
    map.set(modelId, list);
  }
  return map;
}

/** Columnas reales del Excel SCA (base + catálogo activo + Clase + Observaciones). */
export async function fetchPrediagnosticoLiveExportColumns(): Promise<string[]> {
  const [catalog, modelItemProfiles] = await Promise.all([loadActiveCheckItems(), loadModelItemProfiles()]);
  if (!catalog.length) {
    return buildPrediagnosticoExportColumns([]);
  }

  const modelIds = [...modelItemProfiles.keys()];
  if (modelIds.length === 0) {
    return buildPrediagnosticoExportColumns(catalog);
  }

  const unionIds = new Set<string>();
  for (const modelId of modelIds) {
    for (const item of resolvePrediagnosticoExportItems({
      catalog,
      modelItemProfiles,
      modelIdFilter: modelId,
    })) {
      unionIds.add(item.id);
    }
  }
  const exportItems = catalog.filter((item) => unionIds.has(item.id));
  return buildPrediagnosticoExportColumns(exportItems.length > 0 ? exportItems : catalog);
}
