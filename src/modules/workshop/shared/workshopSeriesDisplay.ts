import {
  isSapValidatedSeriesStatus,
  orderSeriesForSapDisplay,
} from '@/app/(erp)/bodega/inventario/_components/inventorySeriesOrder';

export { isSapValidatedSeriesStatus, orderSeriesForSapDisplay };

export function seriesSlotsFromRow(row: {
  serial_number?: string | null;
  s2?: string | null;
  s3?: string | null;
  s4?: string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of [row.serial_number, row.s2, row.s3, row.s4]) {
    const sn = String(raw || '').trim().toUpperCase();
    if (!sn || seen.has(sn)) continue;
    seen.add(sn);
    out.push(sn);
  }
  return out;
}

export function indexSeriesSapBySn(
  target: { series_sap_by_sn?: Record<string, string | null> },
  row: { serial_number?: string | null; s2?: string | null; s3?: string | null; s4?: string | null; sap_status?: string | null },
): void {
  if (!target.series_sap_by_sn) target.series_sap_by_sn = {};
  const sap = row.sap_status ?? null;
  for (const sn of seriesSlotsFromRow(row)) {
    if (sap && target.series_sap_by_sn[sn] == null) {
      target.series_sap_by_sn[sn] = sap;
    }
  }
}

/** S1 = Validado SAP; luego main_serial; resto S2–S4. */
export function finalizeWorkshopGroupSeriesOrder(group: {
  all_sns?: string[];
  serial_number?: string | null;
  service_orders?: { main_serial?: string | null } | null;
  series_sap_by_sn?: Record<string, string | null>;
}): void {
  const sns = group.all_sns || [];
  if (sns.length === 0) return;
  const mainSerial = group.service_orders?.main_serial;
  const sapMap = group.series_sap_by_sn || {};
  const ordered = orderSeriesForSapDisplay(
    sns.map((sn) => ({
      serial_number: sn,
      sap_status: sapMap[sn] ?? null,
      created_at: null,
    })),
    mainSerial,
  )
    .map((r) => String(r.serial_number || '').trim().toUpperCase())
    .filter(Boolean);
  group.all_sns = ordered;
  if (ordered[0]) group.serial_number = ordered[0];
}

/** Etiqueta única RC / RP según historial de etapas completadas. */
export function formatWorkshopStageHistoryLabel(flags: {
  passed_repair?: boolean;
  passed_reacond?: boolean;
}): string {
  const parts: string[] = [];
  if (flags.passed_reacond) parts.push('RC');
  if (flags.passed_repair) parts.push('RP');
  return parts.join(' · ');
}
