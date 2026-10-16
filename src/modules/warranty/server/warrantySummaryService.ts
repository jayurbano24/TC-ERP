import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeWarrantyPack,
  computeWarrantyPackExportRows,
  type WarrantyBreakdownRow,
  type WarrantyOsExportRow,
  type WarrantyPackResult,
} from './warrantyPackCompute';
import {
  fetchWarrantyPackExportFromSnapshot,
  fetchWarrantyPackSummaryFromEtl,
  refreshWarrantyPackSnapshot,
  type WarrantyPackSummaryWithMeta,
} from './warrantyEtlService';

export type { WarrantyBreakdownRow, WarrantyOsExportRow, WarrantyPackResult, WarrantyPackSummaryWithMeta };

/** @deprecated alias */
export type WarrantySummaryResult = WarrantyPackResult;

function isMissingEtlRelation(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('get_warranty_pack_summary') ||
    m.includes('warranty_pack_os_snapshot') ||
    m.includes('does not exist')
  );
}

function canRunWarrantyEtlOnServer(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

/** Lectura rápida desde snapshot ETL (migración 265). */
export async function computeWarrantySummary(
  supabase: SupabaseClient,
  now = new Date()
): Promise<WarrantyPackSummaryWithMeta & { bootstrapAttempted?: boolean; bootstrapError?: string | null }> {
  try {
    let summary = await fetchWarrantyPackSummaryFromEtl(supabase);

    // Primera visita tras migración 265: generar snapshot sin pedir SQL manual.
    if (
      summary.snapshotEmpty &&
      summary.snapshotRefreshedAt == null &&
      canRunWarrantyEtlOnServer()
    ) {
      try {
        await refreshWarrantyPackSnapshot(supabase);
        summary = await fetchWarrantyPackSummaryFromEtl(supabase);
        return { ...summary, bootstrapAttempted: true, bootstrapError: null };
      } catch (bootstrapErr) {
        const msg = bootstrapErr instanceof Error ? bootstrapErr.message : String(bootstrapErr);
        return { ...summary, bootstrapAttempted: true, bootstrapError: msg };
      }
    }

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingEtlRelation(message)) throw err;
    return {
      periodDays: 90,
      totalOsDespachadas: 0,
      osConFechaDespacho: 0,
      osSinFechaDespacho: 0,
      enGarantia: 0,
      vencida: 0,
      elegiblesDespachados: 0,
      reingresosGarantia: 0,
      reingresosEnVentana90: 0,
      noElegiblesPerfil: 0,
      byTechnology: [],
      byModel: [],
      trendByMonth: [],
      computedAt: now.toISOString(),
      snapshotRefreshedAt: null,
      snapshotRefreshMs: null,
      snapshotRowCount: 0,
      snapshotEmpty: true,
    };
  }
}

export { refreshWarrantyPackSnapshot };

export async function computeWarrantyExportRows(
  supabase: SupabaseClient,
  now = new Date()
): Promise<WarrantyOsExportRow[]> {
  try {
    const rows = await fetchWarrantyPackExportFromSnapshot(supabase);
    if (rows.length > 0) {
      return rows.map((r) => ({
        osLabel: String(r.os_label || '—'),
        mainSerial: String(r.main_serial || '—'),
        technology: r.technology_name,
        brand: r.brand_name,
        model: r.model_name,
        dispatchedAt: r.dispatched_at || '',
        warrantyEndsAt: r.warranty_ends_at || '',
        warrantyStatus:
          r.warranty_status === 'en_garantia' || r.warranty_status === 'vencida'
            ? r.warranty_status
            : 'na',
        profile:
          r.warranty_profile === 'bueno'
            ? 'Bueno (B)'
            : r.warranty_profile === 'listo'
              ? 'Equipo Listo'
              : '—',
        elegibleGarantia: r.elegible ? 'Sí' : 'No',
      }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingEtlRelation(message)) throw err;
  }
  return computeWarrantyPackExportRows(supabase, now);
}
