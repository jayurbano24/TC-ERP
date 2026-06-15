import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getReceptions, createReceptionWithSeries, createPxReceptionWithBoxes } from "@/lib/database/receptions";
import { getCarriers, getPxProviders, getTechnologies, getBrands, getModels } from "@/lib/database/config";

/**
 * Repository for the Reception module.
 * Acts as the Data Layer, isolating all Supabase calls.
 */
export const receptionRepository = {
  // Receptions
  getHistory: async (source?: 'cac' | 'px') => {
    return await getReceptions(source);
  },
  
  createCACReception: async (reception: any, series: string[]) => {
    return await createReceptionWithSeries(reception, series);
  },

  createPXReception: async (reception: any, boxes: any[], seriesByBox: Record<string, string[]>) => {
    return await createPxReceptionWithBoxes(reception, boxes, seriesByBox);
  },

  // Config & Master Data
  getCarriers: async () => await getCarriers(),
  getPxProviders: async () => await getPxProviders(),
  getTechnologies: async () => await getTechnologies(),
  getBrands: async () => await getBrands(),
  getModels: async () => await getModels(),

  // Specialized queries specific to Reception can be added here
  checkSerialExists: async (serial: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from('series')
      .select('id, serial_number, current_reception_id, receptions:current_reception_id(guide_number, created_at)')
      .eq('serial_number', serial.toUpperCase())
      .maybeSingle();

    return data;
  },

  getLatestServiceOrder: async (seriesId: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;

    const { data } = await supabase
      .from('service_orders')
      .select('os_label, status, reentry_count')
      .eq('series_id', seriesId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data;
  }
};
