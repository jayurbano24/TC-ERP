/**
 * Accesorios — stock base (legacy bridge / strangler fig).
 *
 * ARCH-01 seam para `@/lib/database/accessories`. El despacho de accesorios
 * (con/sin lote) vive en `modules/accessories-dispatch`; este puente cubre el
 * stock base (altas, entradas, movimientos, cajas).
 */
export * from '@/lib/database/accessories';
