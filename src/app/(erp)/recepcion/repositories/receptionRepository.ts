import { getReceptions, createReceptionWithSeries, createReceptionWithGuides, createPxReceptionWithBoxes, resolveUniquePxGuideNumber, generateNextPxGuideNumber, isPxGuideNumberAvailable, findActivePxReceptionBySapDocument, findActivePxReceptionByDocReference, validatePxHeaderUniqueness, validatePxScannedSeriesForFinalize, deletePxReceptionCascade, deleteCacReceptionCascade } from "@/modules/recepcion/client/receptions";
import { getCarriers, getPxProviders, getTechnologies, getBrands, getModels } from "@/shared/catalogs/catalogs";
import { fetchLatestServiceOrder, lookupReceptionSerial } from "../services/receptionReadsApi";

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

  checkSerialExists: async (serial: string) => lookupReceptionSerial(serial),

  getLatestServiceOrder: async (seriesId: string, mainSerial?: string) =>
    fetchLatestServiceOrder(seriesId, mainSerial),

  generateNextRECNumber: async () => generateNextPxGuideNumber(),

  resolveUniquePxGuideNumber,

  isPxGuideNumberAvailable,

  findActivePxReceptionBySapDocument,

  findActivePxReceptionByDocReference,

  validatePxHeaderUniqueness,

  validatePxScannedSeriesForFinalize,
};
