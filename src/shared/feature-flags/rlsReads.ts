/**
 * ADR-011 Fase 2A — lecturas con cliente RLS (JWT usuario) vs service role.
 * Server-only. Default off: sin cambio de comportamiento hasta activar en Vercel.
 */
export function useRlsReads(): boolean {
  return process.env.USE_RLS_READS === 'true';
}
