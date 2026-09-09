import type { SupabaseClient } from '@supabase/supabase-js';

export type SapIntegrationKpis = {
  historico: number;
  despachadas: number;
  devueltas: number;
  enPlanta: number;
  validados: number;
  pendientes: number;
  sinCoincidencia: number;
  inconsistentes: number;
  obsoletos: number;
  historicoValidados: number;
  historicoPendientes: number;
  historicoSinCoincidencia: number;
  historicoInconsistentes: number;
  historicoObsoletos: number;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchSapIntegrationKpis(
  supabase: SupabaseClient,
): Promise<SapIntegrationKpis | null> {
  const { data, error } = await supabase.rpc('count_sap_integration_kpis');
  if (error || !data || typeof data !== 'object') {
    console.warn('[sapDashboardKpis] RPC unavailable:', error?.message);
    return null;
  }
  const d = data as Record<string, unknown>;
  return {
    historico: num(d.historico),
    despachadas: num(d.despachadas),
    devueltas: num(d.devueltas),
    enPlanta: num(d.enPlanta),
    validados: num(d.validados),
    pendientes: num(d.pendientes),
    sinCoincidencia: num(d.sinCoincidencia),
    inconsistentes: num(d.inconsistentes),
    obsoletos: num(d.obsoletos),
    historicoValidados: num(d.historicoValidados),
    historicoPendientes: num(d.historicoPendientes),
    historicoSinCoincidencia: num(d.historicoSinCoincidencia),
    historicoInconsistentes: num(d.historicoInconsistentes),
    historicoObsoletos: num(d.historicoObsoletos),
  };
}
