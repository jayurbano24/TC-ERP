import type { SupabaseClient } from '@supabase/supabase-js';

/* ─────────────────────────── Tipos del payload ─────────────────────────── */

export interface DigitalTwinSnapshotRow {
  stateCode: string;
  stateLabel: string;
  osCount: number;
}

export interface DigitalTwinProductionRow {
  stageCode: string;
  produccionOs: number;
  retrabajosEventos: number;
  eventosTotales: number;
}

export interface DigitalTwinProductionTodayRow {
  stageCode: string;
  produccionHoy: number;
}

export interface DigitalTwinQualityRow {
  stageCode: string;
  retrabajos: number;
  osConRetrabajo: number;
}

export interface DigitalTwinKpiPayload {
  ledgerTotal: number;
  snapshotTotal: number;
  delta: number;
  reconciled: boolean;
  snapshot: DigitalTwinSnapshotRow[];
  production: DigitalTwinProductionRow[];
  productionToday: DigitalTwinProductionTodayRow[];
  quality: DigitalTwinQualityRow[];
}

/* ─────────────────────────────── Helpers ──────────────────────────────── */

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

/** Detecta errores de "vista/relación inexistente" para degradar sin romper. */
function isMissingRelationError(message?: string | null): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('does not exist') ||
    m.includes('could not find') ||
    (m.includes('relation') && m.includes('exist'))
  );
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/* ─────────────────────────────── Loader ───────────────────────────────── */

/** Motor 1–4 consolidado (vw_kpi_*). Tolerante a fallos parciales. */
export async function loadDigitalTwinKpis(
  supabase: { from: (table: string) => ReturnType<SupabaseClient['from']> }
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

  const snapshot: DigitalTwinSnapshotRow[] = (snapshotRes.data ?? []).map((r: any) => ({
    stateCode: r.state_code,
    stateLabel: r.state_label,
    osCount: num(r.os_count),
  }));

  const production: DigitalTwinProductionRow[] = (prodRes.data ?? []).map((r: any) => ({
    stageCode: r.stage_code,
    produccionOs: num(r.produccion_os),
    retrabajosEventos: num(r.retrabajos_eventos),
    eventosTotales: num(r.eventos_totales),
  }));

  const productionToday: DigitalTwinProductionTodayRow[] = (prodTodayRes.data ?? []).map((r: any) => ({
    stageCode: r.stage_code,
    produccionHoy: num(r.produccion_hoy),
  }));

  const quality: DigitalTwinQualityRow[] = (qualityRes.data ?? []).map((r: any) => ({
    stageCode: r.stage_code,
    retrabajos: num(r.retrabajos),
    osConRetrabajo: num(r.os_con_retrabajo),
  }));

  const recon = reconRes.data as { ledger_total?: number; snapshot_total?: number; delta?: number } | null;

  const ledgerTotal = pickKpiCount(
    num(recon?.ledger_total),
    num((ledgerRes.data as { os_total?: number } | null)?.os_total),
  );
  const snapshotTotal = pickKpiCount(
    num(recon?.snapshot_total),
    snapshot.reduce((sum, r) => sum + r.osCount, 0),
  );
  const delta = recon?.delta != null ? num(recon.delta) : ledgerTotal - snapshotTotal;

  return {
    ledgerTotal,
    snapshotTotal,
    delta,
    reconciled: delta === 0,
    snapshot,
    production,
    productionToday,
    quality,
  };
}
