import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getReceptions, createReceptionWithSeries, createReceptionWithGuides, createPxReceptionWithBoxes, resolveUniquePxGuideNumber, generateNextPxGuideNumber, isPxGuideNumberAvailable, findActivePxReceptionBySapDocument, findActivePxReceptionByDocReference, validatePxHeaderUniqueness, validatePxScannedSeriesForFinalize, deletePxReceptionCascade, deleteCacReceptionCascade } from "@/lib/database/receptions";
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

  deleteCacReception: async (id: string) => deleteCacReceptionCascade(id),

  deletePxReception: async (id: string) => deletePxReceptionCascade(id),

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
      .select('id, serial_number, current_status, current_reception_id, service_order_id, receptions:current_reception_id(guide_number, created_at, status, source, sap_document)')
      .eq('serial_number', serial.toUpperCase())
      .maybeSingle();

    return data;
  },

  getLatestServiceOrder: async (seriesId: string, mainSerial?: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;

    const { data: series } = await supabase
      .from('series')
      .select('service_order_id, serial_number')
      .eq('id', seriesId)
      .maybeSingle();

    if (series?.service_order_id) {
      const { data: linked } = await supabase
        .from('service_orders')
        .select('os_label, status, reentry_count')
        .eq('id', series.service_order_id)
        .maybeSingle();
      if (linked) return linked;
    }

    const main = (mainSerial || series?.serial_number || '').trim().toUpperCase();
    if (!main) return null;

    const { data } = await supabase
      .from('service_orders')
      .select('os_label, status, reentry_count')
      .eq('main_serial', main)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data;
  },

  generateNextRECNumber: async () => generateNextPxGuideNumber(),

  resolveUniquePxGuideNumber,

  isPxGuideNumberAvailable,

  findActivePxReceptionBySapDocument,

  findActivePxReceptionByDocReference,

  validatePxHeaderUniqueness,

  validatePxScannedSeriesForFinalize,
};
