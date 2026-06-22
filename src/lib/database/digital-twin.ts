/** Elige el primer conteo confiable (>0); evita que `0 ?? fallback` ignore el gemelo digital. */
export function pickKpiCount(
  ...candidates: Array<number | null | undefined>
): number {
  for (const n of candidates) {
    if (n != null && n > 0) return n;
  }
  for (const n of candidates) {
    if (n != null) return n;
  }
  return 0;
}

/** Motor 1–4 consolidado (vw_kpi_*). Tolerante a fallos parciales. */
export async function loadDigitalTwinKpis(
  supabase: { from: (table: string) => ReturnType<import('@supabase/supabase-js').SupabaseClient['from']> }
): Promise<DigitalTwinKpiPayload | null> {
  const [ledgerRes, reconRes, snapshotRes, prodRes, prodTodayRes, qualityRes] = await Promise.all([
    supabase.from('vw_kpi_ledger').select('os_total').maybeSingle(),
    supabase.from('vw_kpi_snapshot_reconciliation').select('ledger_total, snapshot_total, delta').maybeSingle(),
    supabase.from('vw_kpi_snapshot').select('state_code, state_label, os_count').order('os_count', { ascending: false }),
    supabase.from('vw_kpi_production').select('stage_code, produccion_os, retrabajos_eventos, eventos_totales').order('stage_code'),
    supabase.from('vw_kpi_production_today').select('stage_code, produccion_hoy').order('stage_code'),
    supabase.from('vw_kpi_quality').select('stage_code, retrabajos, os_con_retrabajo').order('stage_code'),
  ]);

  const errors = [
    ledgerRes.error,
    reconRes.error,
    snapshotRes.error,
    prodRes.error,
    prodTodayRes.error,
    qualityRes.error,
  ].filter(Boolean);

  const allMissing = errors.length > 0 && errors.every((e) => isMissingRelationError(e?.message));
  if (allMissing) return null;

  if (errors.length > 0) {
    console.warn('Digital twin KPI partial errors:', errors.map((e) => e?.message));
  }

  const hasProduction =
    (prodRes.data?.length ?? 0) > 0 ||
    (snapshotRes.data?.length ?? 0) > 0 ||
    ledgerRes.data != null;
  if (!hasProduction) return null;