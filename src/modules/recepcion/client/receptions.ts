/**
 * Recepción — acceso a datos de recepciones para UI (legacy bridge / strangler fig).
 *
 * ARCH-01: la UI (`src/app/**`) y los hooks no deben importar `@/lib/database`
 * directamente. Este archivo es el SEAM por donde la UI accede a las recepciones;
 * hoy delega en las funciones legacy y mañana puede sustituirse por la
 * infraestructura hexagonal de `modules/recepcion` sin tocar la UI.
 */
export * from '@/lib/database/receptions';
