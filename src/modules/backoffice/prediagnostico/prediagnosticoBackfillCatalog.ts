import type { SupabaseClient } from '@supabase/supabase-js';
import {
  filterPrediagnosticoCatalogForEquipment,
  type PrediagnosticoCatalogRow,
} from './resolvePrediagnosticoCatalog';
import type { BackfillCatalogItem } from './prediagnosticoBackfillPlan';

export type PrediagnosticoBackfillCatalogContext = {
  catalog: PrediagnosticoCatalogRow[];
  modelProfileItemIds: Map<string, Set<string>>;
};

export async function loadPrediagnosticoBackfillCatalog(
  supabase: SupabaseClient
): Promise<PrediagnosticoBackfillCatalogContext> {
  const [itemsRes, profileRes] = await Promise.all([
    supabase
      .from('cat_prediagnostico_items')
      .select('id, name, item_kind, technology_ids, brand_ids, sort_order')
      .eq('active', true)
      .order('sort_order'),
    supabase.from('cat_prediagnostico_model_items').select('model_id, item_id'),
  ]);

  if (itemsRes.error) {
    throw new Error(itemsRes.error.message);
  }
  if (profileRes.error) {
    const code = profileRes.error.code || '';
    if (code === 'PGRST205' || /does not exist/i.test(profileRes.error.message)) {
      throw new Error(
        'Falta aplicar migración 253_prediagnostico_model_items.sql (cat_prediagnostico_model_items).'
      );
    }
    throw new Error(profileRes.error.message);
  }

  const catalog: PrediagnosticoCatalogRow[] = (itemsRes.data || []).map((row) => ({
    id: String(row.id),
    name: String(row.name),
    kind: String(row.item_kind) as 'cosmetico' | 'funcionamiento',
    technologyIds: (row.technology_ids as string[]) || [],
    brandIds: (row.brand_ids as string[]) || [],
    sortOrder: Number(row.sort_order) || 0,
  }));

  const modelProfileItemIds = new Map<string, Set<string>>();
  for (const row of profileRes.data || []) {
    const modelId = String(row.model_id);
    const itemId = String(row.item_id);
    if (!modelProfileItemIds.has(modelId)) {
      modelProfileItemIds.set(modelId, new Set());
    }
    modelProfileItemIds.get(modelId)!.add(itemId);
  }

  return { catalog, modelProfileItemIds };
}

export function catalogItemsForEquipment(
  ctx: PrediagnosticoBackfillCatalogContext,
  techId: string,
  brandId: string,
  modelId: string
): BackfillCatalogItem[] {
  const profileSet = ctx.modelProfileItemIds.get(modelId);
  const profileList =
    profileSet && profileSet.size > 0 ? [...profileSet] : null;

  return filterPrediagnosticoCatalogForEquipment(
    ctx.catalog,
    techId,
    brandId,
    profileList
  ).map(({ id, name, kind }) => ({ id, name, kind }));
}
