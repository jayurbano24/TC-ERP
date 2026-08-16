/**
 * Inventario — lecturas para UI (legacy bridge / strangler fig).
 *
 * ARCH-01: la UI (`src/app/**`) no debe importar `@/lib/database` directamente.
 * Este módulo es el SEAM (costura) por donde la UI accede al inventario: hoy
 * delega en las funciones legacy de `lib/database/warehouse`, pero el día de
 * mañana puede sustituirse por `SupabaseInventarioRepository` sin tocar la UI.
 *
 * Nota: `getInventoryDetails` usa el cliente *browser* de Supabase, por lo que
 * estas lecturas se ejecutan en el componente cliente (no en una API route).
 */
import {
  getInventoryDetails as legacyGetInventoryDetails,
  getScrapInventoryDetails as legacyGetScrapInventoryDetails,
  resolveWarehouseStatusLabel as legacyResolveWarehouseStatusLabel,
} from '@/lib/database/warehouse';

/** Detalle de inventario en bodega (unidad por unidad). */
export function getInventoryDetails() {
  return legacyGetInventoryDetails();
}

/** Detalle de inventario en Bodega SCRAPS (series irreparables en cajas SCRAP). */
export function getScrapInventoryDetails() {
  return legacyGetScrapInventoryDetails();
}

/** Etiqueta legible para el estado de almacén (función pura). */
export function resolveWarehouseStatusLabel(status: string | null | undefined): string {
  return legacyResolveWarehouseStatusLabel(status);
}
