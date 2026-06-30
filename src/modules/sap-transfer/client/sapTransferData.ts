/**
 * SAP transfer — operaciones legacy para UI (legacy bridge / strangler fig).
 *
 * ARCH-01 seam. Nota: re-exporta las funciones LEGACY (no el handler
 * hexagonal, que está detrás de feature flag) para preservar el comportamiento
 * actual de backoffice. Migrar al handler hexagonal es un paso posterior.
 */
export { createOrGetSapTransfer, classifyEquipmentBatch } from '@/lib/database/sapTransfers';
