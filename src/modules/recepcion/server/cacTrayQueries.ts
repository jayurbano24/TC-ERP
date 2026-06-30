/**
 * CAC tray — consultas server-side del historial de backoffice (legacy bridge).
 *
 * ARCH-01 seam para las API routes de `backoffice/cac-history`: re-exporta las
 * consultas de `@/lib/database/cacTrayUnits` (cliente *server* de Supabase).
 */
export * from '@/lib/database/cacTrayUnits';
