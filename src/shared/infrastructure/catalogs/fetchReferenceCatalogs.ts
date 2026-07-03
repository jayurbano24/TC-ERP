import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BRAND_SELECT,
  MODEL_SELECT,
  TECHNOLOGY_SELECT,
} from '@/shared/constants/dbProjections';

export type ReferenceCatalogsPayload = {
  technologies: Array<{ id: string; name?: string; series_count?: number; digits_per_series?: number[] }>;
  brands: Array<{ id: string; name?: string; code?: string }>;
  models: Array<{
    id: string;
    name?: string;
    code?: string;
    brand_id?: string;
    technology_id?: string;
    series_count?: number;
    digits_per_series?: number[];
  }>;
};

export async function fetchReferenceCatalogs(
  supabase: SupabaseClient
): Promise<ReferenceCatalogsPayload> {
  const [technologiesRes, brandsRes, modelsRes] = await Promise.all([
    supabase.from('technologies').select(TECHNOLOGY_SELECT).order('name'),
    supabase.from('brands').select(BRAND_SELECT).order('name'),
    supabase.from('models').select(MODEL_SELECT).order('name'),
  ]);

  if (technologiesRes.error) throw technologiesRes.error;
  if (brandsRes.error) throw brandsRes.error;
  if (modelsRes.error) throw modelsRes.error;

  return {
    technologies: technologiesRes.data ?? [],
    brands: brandsRes.data ?? [],
    models: modelsRes.data ?? [],
  };
}
