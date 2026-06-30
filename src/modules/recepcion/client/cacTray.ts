/**
 * CAC tray — helpers de consulta para el historial de backoffice (legacy bridge).
 *
 * ARCH-01 seam para `buildTrayQueryString` (constructor puro de query string)
 * sin que los hooks importen `@/lib/database/cacTrayUnits`.
 */
export { buildTrayQueryString } from '@/lib/database/cacTrayUnits';
