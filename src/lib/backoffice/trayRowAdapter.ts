import type { HistoryUnitEntry } from '@/app/(erp)/produccion/backoffice/history/types';
import type { CacTrayUnitRow } from './cacTrayTypes';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';

/** Adapta fila del read-model al shape que ya consumen tabla, export y modales. */
export function trayRowToHistoryEntry(row: CacTrayUnitRow, groupIndex = 0): HistoryUnitEntry {
  const unit = row.serial_numbers.map((sn, i) => ({
    id: row.series_ids[i] || `${row.service_order_id}-${i}`,
    serial_number: sn,
    brand_id: row.brand_id,
    model_id: row.model_id,
    current_status: row.unit_status,
    sap_transfer_id: row.sap_transfer_id,
    sap_status: row.series_sap_statuses?.[i] || null,
    service_orders: {
      os_label: row.os_label,
      main_serial: row.serial_numbers[0] || sn,
      reentry_count: row.reentry_count,
      created_at: row.classified_at,
      reception_guide_id: row.reception_guide_id,
      sap_transfer_id: row.sap_transfer_id,
      sap_integration_status: row.sap_integration_status,
    },
  }));

  const classifiedAtIso = new Date(row.classified_at).toISOString();
  const sortAt = new Date(row.classified_at).getTime();

  const notesParts: string[] = [];
  if (row.pilot_name) notesParts.push(`Piloto: ${row.pilot_name}`);
  if (row.received_by_name) notesParts.push(`CLASIFICACIÓN (Guía ${row.guide_number}): Por: ${row.received_by_name}`);

  return {
    rec: {
      id: row.reception_id,
      guide_number: row.guide_number,
      carrier: row.carrier,
      notes: notesParts.join('\n'),
      source: 'cac',
    },
    grp: {
      modelId: row.model_id || '',
      brandId: row.brand_id || '',
      fullSeries: unit,
    },
    unit,
    unitIndex: 0,
    groupIndex,
    osLabel: row.os_label,
    unitGuide: row.guide_number,
    unitAgencyRaw: row.agency_code || row.agency_name || '',
    unitSap: row.sap_document_number || '---',
    unitStatus: row.unit_status,
    unitStatusLabel: row.unit_status_label,
    sapTransferId: row.sap_transfer_id,
    sortAt,
    classifiedAtIso,
    sapValidationStatus: resolveUnitSapStatus(
      row.sap_integration_status,
      row.series_sap_statuses || unit.map((u) => u.sap_status)
    ),
    seriesSapStatuses: row.series_sap_statuses || unit.map((u) => u.sap_status),
  };
}

export function trayRowsToHistoryEntries(rows: CacTrayUnitRow[]): HistoryUnitEntry[] {
  return rows.map((row, i) => trayRowToHistoryEntry(row, i));
}
