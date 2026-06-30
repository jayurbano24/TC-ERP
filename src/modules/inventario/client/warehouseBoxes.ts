/**
 * Inventario — operaciones de cajas/bodega para UI (legacy bridge / strangler fig).
 *
 * ARCH-01 seam: la UI de `/bodega/gestion` accede a cajas, racks, traslados y
 * despachos vía este módulo en vez de `@/lib/database/warehouse`.
 */
export * from '@/lib/database/warehouse';
