/**
 * KPI analytics — métricas y dashboard (legacy bridge / strangler fig).
 *
 * ARCH-01 seam: la UI accede a KPIs vía este módulo en vez de
 * `@/lib/database/kpi`. Futuro: motor KPI sobre `domain_events` (Fase 3).
 */
export * from '@/lib/database/kpi';
