import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type SapMatLotPair = {
  material: string;
  valuation: string;
};

/**
 * Materiales / valoraciones SAP observados en series del marca+modelo
 * (datos provenientes de validación / sync SAP — "Modelo de SAP").
 */
export async function fetchSapMatLotOptionsForModel(
  brandId: string,
  modelId: string
): Promise<SapMatLotPair[]> {
  const brand = String(brandId || '').trim();
  const model = String(modelId || '').trim();
  if (!brand || !model) return [];

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('series')
    .select('material, valuation')
    .eq('brand_id', brand)
    .eq('model_id', model)
    .not('material', 'is', null)
    .limit(4000);

  if (error) {
    console.warn('[despacho] sap mat/lot options:', error.message);
    return [];
  }

  const seen = new Set<string>();
  const pairs: SapMatLotPair[] = [];
  for (const row of data || []) {
    const material = String(row.material || '').trim();
    const valuation = String(row.valuation || '').trim();
    if (!material) continue;
    const key = `${material.toUpperCase()}|${valuation.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ material, valuation });
  }

  pairs.sort((a, b) => {
    const m = a.material.localeCompare(b.material, 'es');
    if (m !== 0) return m;
    return a.valuation.localeCompare(b.valuation, 'es');
  });

  return pairs;
}

export function uniqueMaterials(pairs: SapMatLotPair[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    const k = p.material.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p.material);
  }
  return out;
}

export function valuationsForMaterial(pairs: SapMatLotPair[], material: string): string[] {
  const mat = String(material || '').trim().toUpperCase();
  if (!mat) {
    const all: string[] = [];
    const seen = new Set<string>();
    for (const p of pairs) {
      if (!p.valuation) continue;
      const k = p.valuation.toUpperCase();
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(p.valuation);
    }
    return all;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of pairs) {
    if (p.material.toUpperCase() !== mat || !p.valuation) continue;
    const k = p.valuation.toUpperCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p.valuation);
  }
  return out;
}
