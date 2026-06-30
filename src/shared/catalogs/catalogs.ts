/**
 * Catálogos / configuración compartida (legacy bridge / strangler fig).
 *
 * Datos de referencia (tecnologías, marcas, modelos, agencias, carriers,
 * proveedores PX, etc.) usados por múltiples módulos. ARCH-01 seam para que la
 * UI no importe `@/lib/database/config` directamente.
 */
export * from '@/lib/database/config';
