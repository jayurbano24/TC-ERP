/**
 * Finance costing — costos de actividad (legacy bridge / strangler fig).
 *
 * ARCH-01 seam: la UI de `/gestion/costos` accede a costos vía este módulo en
 * vez de `@/lib/database/costs`. Futuro: ledger `cost_ledger_entries` (Fase 3).
 */
export * from '@/lib/database/costs';
