import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrediagnosticoCatalogRow } from './resolvePrediagnosticoCatalog';
import {
  resolvePrediagnosticoMotorItems,
  type PrediagnosticoMotorCheckItem,
} from './resolvePrediagnosticoMotorItems';

export async function loadModelItemProfilesMap(
  supabase: SupabaseClient,
  modelId?: string
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  let query = supabase.from('cat_prediagnostico_model_items').select('model_id, item_id');
  if (modelId?.trim()) {
    query = query.eq('model_id', modelId.trim());
  }
  const { data, error } = await query;
  if (error) {
    if (
      error.message.includes('cat_prediagnostico_model_items') ||
      error.message.includes('does not exist')
    ) {
      throw new Error('Falta aplicar la migración 253_prediagnostico_model_items.sql en Supabase.');
    }
    throw new Error(error.message);
  }
  for (const row of data || []) {
    const mid = String(row.model_id);
    const list = map.get(mid) || [];
    list.push(String(row.item_id));
    map.set(mid, list);
  }
  return map;
}

export async function loadActivePrediagnosticoCatalogRows(
  supabase: SupabaseClient
): Promise<PrediagnosticoCatalogRow[]> {
  const { data, error } = await supabase
    .from('cat_prediagnostico_items')
    .select('id, name, item_kind, technology_ids, brand_ids, sort_order')
    .eq('active', true)
    .order('sort_order');

  if (error) {
    throw new Error(
      error.message.includes('cat_prediagnostico_items')
        ? 'Falta aplicar la migración 251_prediagnostico.sql en Supabase.'
        : error.message
    );
  }

  return (data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: String(row.item_kind) as 'cosmetico' | 'funcionamiento',
    technologyIds: (row.technology_ids as string[]) || [],
    brandIds: (row.brand_ids as string[]) || [],
    sortOrder: Number(row.sort_order) || 0,
  }));
}

/** Catálogo del motor alineado al reporte contractual SCA (PREDIAGNOSTICO_EQUIPOS). */
export async function loadPrediagnosticoMotorCatalog(
  supabase: SupabaseClient,
  input: { techId: string; brandId: string; modelId: string }
): Promise<{ items: PrediagnosticoMotorCheckItem[]; catalogRows: PrediagnosticoCatalogRow[] }> {
  const [catalogRows, modelItemProfiles] = await Promise.all([
    loadActivePrediagnosticoCatalogRows(supabase),
    input.modelId.trim()
      ? loadModelItemProfilesMap(supabase, input.modelId)
      : Promise.resolve(new Map<string, string[]>()),
  ]);

  const items = resolvePrediagnosticoMotorItems({
    catalogRows,
    modelItemProfiles,
    techId: input.techId,
    brandId: input.brandId,
    modelId: input.modelId,
  });

  return { items, catalogRows };
}
