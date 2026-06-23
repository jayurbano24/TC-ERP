import {
  formatAgencyLabel,
  getBackofficeClassifierName,
  type HistoryUnitEntry,
} from '../historyTrayUtils';
import {
  formatSeriesSapStatusLabel,
  formatUnitSapValidationForExport,
} from '@/lib/backoffice/trayRowAdapter';
import { resolveUnitSapStatus } from '@/lib/sap/sapValidationStatus';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../types';

type ExportCatalogs = {
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
};

export async function exportHistoryReport(
  trayEntries: HistoryUnitEntry[],
  catalogs: ExportCatalogs,
  dateFilterFrom: string,
  dateFilterTo: string
): Promise<void> {
  if (trayEntries.length === 0) {
    alert('No hay ingresos CAC con orden de servicio TC-XXX que coincidan con los filtros actuales.');
    return;
  }

  const rows: Record<string, string>[] = [];

  trayEntries.forEach((entry) => {
    const rec = entry.rec;
    const grp = entry.grp;
    const unit = entry.unit;
    const dateObj = new Date(entry.classifiedAtIso);
    const formattedDate = `${dateObj.getDate()}-${dateObj.getMonth() + 1}-${dateObj.getFullYear()} ${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
    const piloto = rec.notes?.split('Piloto: ')[1]?.split('\n')[0] || '---';
    const agencia = formatAgencyLabel(entry.unitAgencyRaw, catalogs.CAC_AGENCIES, entry.rec?.carrier);
    const modelObj = catalogs.MASTER_MODELOS.find((m) => m.id === grp.modelId);
    const brandObj = catalogs.MASTER_MARCAS.find((b) => b.id === grp.brandId);
    const techObj = modelObj
      ? catalogs.MASTER_TECNOLOGIAS.find((t) => t.id === modelObj.tecnologiaId)
      : null;
    const reentry =
      unit.find((u: { service_orders?: { reentry_count?: number } }) => u?.service_orders?.reentry_count)
        ?.service_orders?.reentry_count || 1;

    const seriesSapStatuses = entry.seriesSapStatuses ?? unit.map((u) => u.sap_status || 'Pendiente');
    const unitSapValidationStatus =
      entry.unitSapValidationStatus ??
      resolveUnitSapStatus(unit[0]?.service_orders?.sap_integration_status, seriesSapStatuses);

    rows.push({
      'Fecha / Hora': formattedDate,
      'No. Guía': entry.unitGuide,
      Piloto: piloto,
      Courier: rec.carrier || '---',
      Recibió: getBackofficeClassifierName(rec, entry.unitGuide),
      Estatus: entry.unitStatusLabel,
      'Orden de Servicio': entry.osLabel,
      Ingreso: `${reentry}° Ingreso`,
      'Agencia CAC': agencia,
      Tecnología: techObj?.nombre || '---',
      Marca: brandObj?.nombre || '---',
      Modelo: modelObj?.nombre || '---',
      'Documento SAP': entry.unitSap,
      'Validación SAP': formatUnitSapValidationForExport(unitSapValidationStatus),
      'S-1': unit[0]?.serial_number || '---',
      'S-1 Validación SAP': unit[0] ? formatSeriesSapStatusLabel(unit[0].sap_status) : '---',
      'S-2': unit[1]?.serial_number || '---',
      'S-2 Validación SAP': unit[1] ? formatSeriesSapStatusLabel(unit[1].sap_status) : '---',
      'S-3': unit[2]?.serial_number || '---',
      'S-3 Validación SAP': unit[2] ? formatSeriesSapStatusLabel(unit[2].sap_status) : '---',
      'S-4': unit[3]?.serial_number || '---',
      'S-4 Validación SAP': unit[3] ? formatSeriesSapStatusLabel(unit[3].sap_status) : '---',
    });
  });

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Histórico CAC');
  XLSX.writeFile(wb, `Reporte_CAC_TC_${dateFilterFrom || 'inicio'}_a_${dateFilterTo || 'fin'}.xlsx`);
}
