import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getReceptions, createReceptionWithSeries, createReceptionWithGuides, createPxReceptionWithBoxes } from "@/lib/database/receptions";
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
  
  createCACReception: async (reception: any, guides: string[]) => {
    return await createReceptionWithGuides(reception, guides);
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
  },

  generateNextRECNumber: async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return 'REC-800000';

    const { data } = await supabase
      .from('receptions')
      .select('guide_number')
      .like('guide_number', 'REC-%')
      .order('guide_number', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && data.guide_number) {
      const currentNum = parseInt(data.guide_number.split('-')[1]);
      if (!isNaN(currentNum)) {
        return `REC-${currentNum + 1}`;
      }
    }
    return 'REC-800000';
  }
};
