import { isTcServiceOrderLabel } from './constants';
import { groupSeriesIntoEquipmentUnits } from './equipmentGrouping';
import type { HistoryUnitEntry } from './types';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
import {
  resolveUnitAgencyRaw,
  resolveUnitClassifiedAt,
  resolveUnitGuide,
  resolveUnitSap,
  resolveUnitSapTransferId,
  resolveUnitStatus,
} from './unitFieldResolvers';

export function filterHistoryRecordsByDate(
  records: any[],
  dateFilterFrom: string,
  dateFilterTo: string
) {
  return records.filter((r) => {
    if (!dateFilterFrom && !dateFilterTo) return true;
    const d = new Date(r.created_at);
    if (dateFilterFrom && d < new Date(dateFilterFrom + 'T00:00:00')) return false;
    if (dateFilterTo) {
      const to = new Date(dateFilterTo + 'T23:59:59');
      if (d > to) return false;
    }
    return true;
  });
}

export function filterUnitEntriesByDate(
  entries: HistoryUnitEntry[],
  dateFilterFrom: string,
  dateFilterTo: string
): HistoryUnitEntry[] {
  if (!dateFilterFrom && !dateFilterTo) return entries;
  return entries.filter((e) => {
    const d = new Date(e.classifiedAtIso);
    if (dateFilterFrom && d < new Date(dateFilterFrom + 'T00:00:00')) return false;
    if (dateFilterTo) {
      const to = new Date(dateFilterTo + 'T23:59:59');
      if (d > to) return false;
    }
    return true;
  });
}

/** Recepción con notas de clasificación pero sin OS TC-XXX en series (ingreso a medias) */
export function receptionHasTcOs(rec: any): boolean {
  return (rec.series || []).some(
    (s: any) => s?.service_orders?.os_label && isTcServiceOrderLabel(s.service_orders.os_label)
  );
}

export function findOrphanClassifications(records: any[], search: string): any[] {
  const q = search.trim().toLowerCase();
  if (!q) return [];
  return records.filter((rec) => {
    if ((rec.source || '').toLowerCase() !== 'cac') return false;
    if (receptionHasTcOs(rec)) return false;
    const notes = (rec.notes || '').toLowerCase();
    const hasClassif =
      notes.includes('clasificación') ||
      notes.includes('detalles backoffice') ||
      notes.includes('backoffice_agency:');
    if (!hasClassif) return false;
    const guide = (rec.guide_number || '').toLowerCase();
    const processed = (rec.processed_guides || []).map((g: string) => g.toLowerCase());
    return (
      guide.includes(q) ||
      notes.includes(q) ||
      processed.some((g: string) => g.includes(q))
    );
  });
}

/** Expande recepciones CAC a filas de unidad con OS TC-XXX */
export function collectTcHistoryUnitEntries(
  records: any[],
  resolveSeriesPerUnit: (modelId: string) => number = () => 1
): HistoryUnitEntry[] {
  const entries: HistoryUnitEntry[] = [];

  for (const rec of records) {
    if ((rec.source || '').toLowerCase() !== 'cac') continue;

    const equipmentUnits = groupSeriesIntoEquipmentUnits(rec.series || [], resolveSeriesPerUnit);

    for (let gi = 0; gi < equipmentUnits.length; gi++) {
      const { modelId, brandId, unit } = equipmentUnits[gi];
      const grp = { modelId, brandId, fullSeries: unit };
      const osLabel =
        unit.find((u: any) => u?.service_orders?.os_label)?.service_orders?.os_label || '---';
      if (!isTcServiceOrderLabel(osLabel)) continue;

      const unitGuide = resolveUnitGuide(rec, unit);
      const unitSap = resolveUnitSap(rec, unitGuide, unit);
      const { status: unitStatus, label: unitStatusLabel } = resolveUnitStatus(rec, unit);
      const classifiedAt = resolveUnitClassifiedAt(rec, unit, unitGuide);
      const seriesSapStatuses = unit.map(
        (u: { sap_status?: string | null }) => u.sap_status || 'Pendiente'
      );
      const integrationStatus = unit.find(
        (u: { service_orders?: { sap_integration_status?: string | null } }) =>
          u?.service_orders?.sap_integration_status
      )?.service_orders?.sap_integration_status;
      const unitSapValidationStatus = resolveUnitSapStatus(integrationStatus, seriesSapStatuses);

      entries.push({
        rec,
        grp,
        unit,
        unitIndex: 0,
        groupIndex: gi,
        osLabel,
        unitGuide,
        unitAgencyRaw: resolveUnitAgencyRaw(rec, unitGuide, unit),
        unitSap,
        unitStatus,
        unitStatusLabel,
        sapTransferId: resolveUnitSapTransferId(rec, unit),
        unitSapValidationStatus,
        seriesSapStatuses,
        sortAt: classifiedAt,
        classifiedAtIso: new Date(classifiedAt).toISOString(),
      });
    }
  }

  return entries.sort((a, b) => {
    if (b.sortAt !== a.sortAt) return b.sortAt - a.sortAt;
    const osA = parseInt((a.osLabel || '').replace(/\D/g, ''), 10) || 0;
    const osB = parseInt((b.osLabel || '').replace(/\D/g, ''), 10) || 0;
    return osB - osA;
  });
}

export function formatHistoryHourLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const datePart = d.toLocaleDateString('es-GT', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const hour = d.getHours().toString().padStart(2, '0');
  return `${datePart} — ${hour}:00 hrs`;
}

export function getHistoryHourKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`;
}
